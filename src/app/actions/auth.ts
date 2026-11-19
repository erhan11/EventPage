"use server";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { eventStaff, memberships, organizations, staffInvites, users } from "@/lib/db/schema";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { slugify } from "@/lib/format";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { clientIp, limitByIp, rateLimit } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";

export type FormState = { error?: string; fields?: Record<string, string> } | null;

const password = z.string().min(10, "Use at least 10 characters.").max(200);


export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  if (!(await limitByIp("signup", 5, 60 * 60_000)).ok) return { error: "Too many sign-ups from this network. Try later." };
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Enter your name.").max(80),
      org: z.string().trim().min(2, "Enter your collective or venue name.").max(80),
      email: z.email("Enter a valid email.").max(120),
      password,
    })
    .safeParse(Object.fromEntries(form));
  const fields = { name: String(form.get("name") ?? ""), org: String(form.get("org") ?? ""), email: String(form.get("email") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const { name, org, email } = parsed.data;

  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  if (exists) return { error: "An account with this email already exists.", fields };

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email: email.toLowerCase(), name, passwordHash }).returning({ id: users.id });
    const [o] = await tx
      .insert(organizations)
      .values({ name: org, slug: `${slugify(org) || "org"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "")}` })
      .returning({ id: organizations.id });
    await tx.insert(memberships).values({ userId: u.id, orgId: o.id, role: "owner" });
    return u.id;
  });
  await createSession(userId);
  redirect("/dashboard");
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const pw = String(form.get("password") ?? "").slice(0, 200);
  const ipLimit = await limitByIp("login", 20, 15 * 60_000);
  // Per (email, IP) is strict; per email alone is loose so an attacker can't easily lock a known organizer out.
  const pairLimit = rateLimit(`login-pair:${email}:${await clientIp()}`, 8, 15 * 60_000);
  const acctLimit = rateLimit(`login-acct:${email}`, 50, 15 * 60_000);
  if (!ipLimit.ok || !pairLimit.ok || !acctLimit.ok) return { error: "Too many attempts. Wait a few minutes and try again.", fields: { email } };

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(pw, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "Email or password is incorrect.", fields: { email } };

  await createSession(user.id);
  const [m] = await db.select({ role: memberships.role }).from(memberships).where(eq(memberships.userId, user.id));
  redirect(safeNextPath(form.get("next"), m?.role === "staff" ? "/scan" : "/dashboard"));
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

/** Door staff accept an invite link: creates (or signs into) an account bound to one event. */
export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  if (!(await limitByIp("invite", 10, 15 * 60_000)).ok) return { error: "Too many attempts. Try again later." };
  const token = String(form.get("token") ?? "");
  const parsed = z
    .object({ name: z.string().trim().min(2, "Enter your name.").max(80), password })
    .safeParse({ name: form.get("name"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [invite] = await db
    .select()
    .from(staffInvites)
    .where(and(eq(staffInvites.tokenHash, sha256(token)), isNull(staffInvites.acceptedAt), gt(staffInvites.expiresAt, new Date())))
    .limit(1);
  if (!invite) return { error: "This invite link is invalid or has expired. Ask the organizer for a new one." };

  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${invite.email.toLowerCase()}`).limit(1);
  if (existing && !(await verifyPassword(parsed.data.password, existing.passwordHash))) {
    return { error: "An account with this email exists — enter its password to accept the invite." };
  }
  const passwordHash = existing ? null : await hashPassword(parsed.data.password);

  const userId = await db.transaction(async (tx) => {
    // Single-use: the conditional update makes concurrent accepts race-safe.
    const claimed = await tx
      .update(staffInvites)
      .set({ acceptedAt: new Date() })
      .where(and(eq(staffInvites.id, invite.id), isNull(staffInvites.acceptedAt)))
      .returning({ id: staffInvites.id });
    if (claimed.length === 0) return null;
    const uid =
      existing?.id ??
      (await tx.insert(users).values({ email: invite.email.toLowerCase(), name: parsed.data.name, passwordHash: passwordHash! }).returning({ id: users.id }))[0].id;
    await tx.insert(memberships).values({ userId: uid, orgId: invite.orgId, role: "staff" }).onConflictDoNothing();
    await tx.insert(eventStaff).values({ eventId: invite.eventId, userId: uid }).onConflictDoNothing();
    return uid;
  });
  if (!userId) return { error: "This invite was already used." };
  await createSession(userId);
  redirect(`/scan/${invite.eventId}`);
}
