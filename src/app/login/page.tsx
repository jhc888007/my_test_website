import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/trust-flow/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-gold/40 bg-white/5 shadow-[0_0_60px_-12px_rgba(212,175,55,0.35)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-center text-xl tracking-[0.2em] text-gold">
            Trust-Flow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm action={loginAction} />
          <p className="text-center text-sm text-white/55">
            还没有账号？{" "}
            <Link href="/register" className="text-gold underline-offset-4 hover:underline">
              注册账号
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
