"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full border-gold/50 bg-gold/15 text-gold hover:bg-gold/25"
      disabled={pending}
    >
      {pending ? "提交中…" : "注册并进入"}
    </Button>
  );
}

export function RegisterForm({
  action,
}: {
  action: (
    prev: { error: string | null },
    formData: FormData
  ) => Promise<{ error: string | null }>;
}) {
  const [state, formAction] = useFormState(action, { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label>注册身份</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
            <input
              type="radio"
              name="role"
              value="BENEFICIARY"
              defaultChecked
              className="accent-gold"
            />
            信托受益人
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
            <input type="radio" name="role" value="TRUSTEE" className="accent-gold" />
            信托管理人
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          className="border-gold/30 bg-black/20"
          required
          minLength={2}
          maxLength={32}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码（至少 6 位）</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="border-gold/30 bg-black/20"
          required
          minLength={6}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">确认密码</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          className="border-gold/30 bg-black/20"
          required
          minLength={6}
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-red-400">{state.error}</p>
      ) : null}
      <Submit />
    </form>
  );
}
