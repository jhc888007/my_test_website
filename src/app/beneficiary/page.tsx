import { getSession } from "@/lib/auth-server";
import { getBeneficiaryDashboard, getTopology } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlowingTotal } from "@/components/trust-flow/glowing-total";
import { VestingChart } from "@/components/trust-flow/vesting-chart";
import { InheritanceTopology } from "@/components/trust-flow/inheritance-topology";

export default async function BeneficiaryPage() {
  const session = await getSession();
  const userId = session ? Number(session.sub) : 0;
  const dash = getBeneficiaryDashboard(userId);
  const topo = getTopology();
  const trusteeName = topo.trustees[0]?.username ?? "Trustee";
  const benNames = topo.beneficiaries.map((b) => b.username);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-gold/35 bg-white/5 p-8 shadow-[0_0_80px_-20px_rgba(212,175,55,0.35)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.35em] text-gold/70">Total Assets</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <GlowingTotal value={Math.round(dash.totalAssets)} />
          <span className="pb-1 text-lg text-white/50">USD 等值</span>
        </div>
        <div className="mt-8 space-y-2">
          <div className="flex justify-between text-sm text-white/60">
            <span>已归属进度</span>
            <span className="text-gold tabular-nums">{dash.progressPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-gold/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold/40 to-gold shadow-[0_0_20px_rgba(212,175,55,0.55)]"
              style={{ width: `${dash.progressPct}%` }}
            />
          </div>
        </div>
      </section>

      <Card className="border-gold/35 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base text-gold">归属释放曲线</CardTitle>
        </CardHeader>
        <CardContent>
          {dash.chartData.length ? (
            <VestingChart data={dash.chartData} />
          ) : (
            <p className="py-16 text-center text-sm text-white/50">暂无归属计划数据</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-gold/35 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base text-gold">传承拓扑</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <InheritanceTopology trusteeName={trusteeName} beneficiaryNames={benNames} />
        </CardContent>
      </Card>
    </div>
  );
}
