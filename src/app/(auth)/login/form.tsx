"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/app/actions/auth";
import { PasswordInput } from "@/components/ui/password-input";
import { Button, Field, FormError, Input } from "@/components/ui/primitives";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="mt-2 h-12">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
