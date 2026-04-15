"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createFundAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContractOverlay } from "./contract-overlay";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="border-gold/50 bg-gold/15 text-gold hover:bg-gold/25"
      disabled={pending}
    >
      {pending ? "签署中…" : "确认划拨"}
    </Button>
  );
}

function FundFormImpl({ onReset }: { onReset: () => void }) {
  const router = useRouter();
  const [state, formAction] = useFormState(createFundAction, {
    error: null as string | null,
    success: false,
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.success) setOpen(true);
  }, [state.success]);

  function handleClose() {
    setOpen(false);
    onReset();
    router.refresh();
  }

  return (
    <>
      <ContractOverlay open={open} onClose={handleClose} />
      <form action={formAction} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="beneficiaryUsername">受益人用户名</Label>
          <Input
            id="beneficiaryUsername"
            name="beneficiaryUsername"
            className="border-gold/30 bg-black/20"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="totalAmount">信托总额</Label>
          <Input
            id="totalAmount"
            name="totalAmount"
            type="number"
            step="0.01"
            min="0"
            className="border-gold/30 bg-black/20"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="yearsCount">归属年限 N</Label>
          <Input
            id="yearsCount"
            name="yearsCount"
            type="number"
            min="1"
            max="50"
            className="border-gold/30 bg-black/20"
            required
          />
        </div>
        {state.error ? (
          <p className="text-sm text-red-400 md:col-span-2">{state.error}</p>
        ) : null}
        <div className="md:col-span-2">
          <Submit />
        </div>
      </form>
    </>
  );
}

export function FundForm() {
  const [key, setKey] = useState(0);
  return (
    <FundFormImpl key={key} onReset={() => setKey((k) => k + 1)} />
  );
}
