import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/ui/auth-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthShell kicker="For promoters, collectives & venues" title="Start your first night">
      <SignupForm />
      <p className="mt-8 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-fg underline decoration-accent decoration-2 underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
