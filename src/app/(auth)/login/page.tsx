import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/ui/auth-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <AuthShell kicker="Welcome back" title="Sign in">
      <LoginForm next={typeof next === "string" ? next : ""} />
      <p className="mt-8 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-fg underline decoration-accent decoration-2 underline-offset-4">
          Create an organizer account
        </Link>
      </p>
    </AuthShell>
  );
}
