"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full border-gold/50 bg-gold/15 text-gold hover:bg-gold/25" disabled={pending}>
      {pending ? "验证中…" : "进入金库"}
    </Button>
  );
}

export function LoginForm({
  action,
}: {
  action: (prev: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
}) {
  const [state, formAction] = useFormState(action, { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          className="border-gold/30 bg-black/20"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="border-gold/30 bg-black/20"
          required
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-red-400">{state.error}</p>
      ) : null}
      <Submit />
    </form>
  );
}
