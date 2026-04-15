import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "TRUSTEE") redirect("/trustee");
  redirect("/beneficiary");
}
