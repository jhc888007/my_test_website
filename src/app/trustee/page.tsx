import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FundForm } from "@/components/trust-flow/fund-form";

export default function TrusteeHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-wide text-gold">资金划拨</h1>
        <p className="mt-2 text-sm text-white/60">
          输入受益人、总额与归属年限，系统将按递增比例自动拆分年度归属。
        </p>
      </div>
      <Card className="border-gold/35 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base text-white/90">新建信托计划</CardTitle>
        </CardHeader>
        <CardContent>
          <FundForm />
        </CardContent>
      </Card>
    </div>
  );
}
