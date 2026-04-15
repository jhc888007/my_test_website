"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      className="border-red-400/50 text-red-300 hover:bg-red-500/10"
    >
      {pending ? "处理中…" : "一键注销"}
    </Button>
  );
}

export function UserDeleteRow({
  userId,
  disabled,
  action,
}: {
  userId: number;
  disabled: boolean;
  action: (
    prev: { error: string | null },
    formData: FormData
  ) => Promise<{ error: string | null }>;
}) {
  const [state, formAction] = useFormState(action, { error: null });
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Submit disabled={disabled} />
      {state.error ? (
        <span className="max-w-[220px] text-xs text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
