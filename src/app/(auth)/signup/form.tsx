"use client";

import { useActionState } from "react";
import { signUp, type FormState } from "@/app/actions/auth";
import { PasswordInput } from "@/components/ui/password-input";
import { Button, Field, FormError, Input } from "@/components/ui/primitives";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, null);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Your name">
        <Input name="name" autoComplete="name" required defaultValue={state?.fields?.name} />
      </Field>
      <Field label="Collective, label or venue">
        <Input name="org" required placeholder="e.g. Nachtfalter Collective" defaultValue={state?.fields?.org} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <PasswordInput name="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="mt-2 h-12">
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
