"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "@/app/actions/auth";
import { Button, Field, FormError, Input } from "@/components/ui/primitives";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name">
        <Input name="name" autoComplete="name" required />
      </Field>
      <Field label="Password" hint="New account: choose one (10+ characters). Existing account: enter yours.">
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="mt-2 h-12">
        {pending ? "Joining…" : "Join the door team"}
      </Button>
    </form>
  );
}
