import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/trust-flow/fade-in";

export default function BeneficiaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-gold/20 bg-black/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <span className="text-sm tracking-[0.25em] text-gold/90">Trust-Flow · 受益人</span>
          <nav className="flex items-center gap-3">
            <Link
              href="/beneficiary"
              className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-white/80 hover:border-gold/30 hover:text-gold"
            >
              资产总览
            </Link>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-gold/40 text-gold hover:bg-gold/10"
              >
                退出
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <FadeIn>{children}</FadeIn>
      </main>
    </div>
  );
}
