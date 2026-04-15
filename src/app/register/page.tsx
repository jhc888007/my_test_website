import Link from "next/link";
import { registerAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/trust-flow/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-gold/40 bg-white/5 shadow-[0_0_60px_-12px_rgba(212,175,55,0.35)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-center text-xl tracking-[0.2em] text-gold">
            注册账号
          </CardTitle>
          <p className="text-center text-xs text-white/55">
            选择身份后注册；演示环境开放受益人与管理人自助开户。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RegisterForm action={registerAction} />
          <p className="text-center text-sm text-white/55">
            已有账号？{" "}
            <Link href="/login" className="text-gold underline-offset-4 hover:underline">
              去登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
