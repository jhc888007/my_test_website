import { deleteUserFormAction } from "@/app/actions";
import { getSession } from "@/lib/auth-server";
import { listUsers } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserDeleteRow } from "@/components/trust-flow/user-delete-row";

export default async function TrusteeUsersPage() {
  const session = await getSession();
  const users = listUsers();
  const selfId = session ? Number(session.sub) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-wide text-gold">用户管理</h1>
        <p className="mt-2 text-sm text-white/60">审计全部注册用户及角色，可一键注销（级联删除其信托与归属数据）。</p>
      </div>
      <Card className="border-gold/35 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base text-white/90">用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gold/20 hover:bg-transparent">
                <TableHead className="text-gold/90">用户名</TableHead>
                <TableHead className="text-gold/90">角色</TableHead>
                <TableHead className="text-right text-gold/90">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="border-gold/15">
                  <TableCell className="font-medium text-white/90">{u.username}</TableCell>
                  <TableCell className="text-white/70">
                    {u.role === "TRUSTEE" ? "信托管理人" : "信托受益人"}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserDeleteRow
                      userId={u.id}
                      disabled={u.id === selfId}
                      action={deleteUserFormAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
