"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession, loginWithPassword, logoutSession } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { computeUnlockDate, generateVesting } from "@/lib/vesting";
import { countTrustees } from "@/lib/queries";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function loginAction(_: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "请输入用户名和密码" };
  }
  const res = await loginWithPassword(parsed.data.username, parsed.data.password);
  if (!res.ok) return { error: res.error };
  redirect("/");
}

const registerSchema = z.object({
  username: z.string().trim().min(2, "用户名至少 2 个字符").max(32),
  password: z.string().min(6, "密码至少 6 位"),
  confirm: z.string(),
  role: z.enum(["TRUSTEE", "BENEFICIARY"], {
    message: "请选择角色",
  }),
});

export async function registerAction(_: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "请检查输入";
    return { error: msg };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { error: "两次密码不一致" };
  }
  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(parsed.data.username) as { id: number } | undefined;
  if (exists) {
    return { error: "该用户名已被注册" };
  }
  const hash = bcrypt.hashSync(parsed.data.password, 10);
  db.prepare(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)"
  ).run(parsed.data.username, hash, parsed.data.role);
  const res = await loginWithPassword(
    parsed.data.username,
    parsed.data.password
  );
  if (!res.ok) return { error: res.error };
  redirect("/");
}

const fundSchema = z.object({
  beneficiaryUsername: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  yearsCount: z.coerce.number().int().min(1).max(50),
});

export async function createFundAction(_: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "TRUSTEE") {
    return { error: "无权限", success: false };
  }
  const parsed = fundSchema.safeParse({
    beneficiaryUsername: formData.get("beneficiaryUsername"),
    totalAmount: formData.get("totalAmount"),
    yearsCount: formData.get("yearsCount"),
  });
  if (!parsed.success) {
    return { error: "请填写有效的受益人、金额与年限", success: false };
  }
  const db = getDb();
  const ben = db
    .prepare(
      "SELECT id FROM users WHERE username = ? AND role = 'BENEFICIARY'"
    )
    .get(parsed.data.beneficiaryUsername.trim()) as { id: number } | undefined;
  if (!ben) {
    return { error: "未找到该受益人用户", success: false };
  }
  const trusteeId = Number(session.sub);
  const createdAt = new Date();
  const fund = db
    .prepare(
      `INSERT INTO funds (trustee_id, beneficiary_id, total_amount, years_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      trusteeId,
      ben.id,
      parsed.data.totalAmount,
      parsed.data.yearsCount,
      createdAt.toISOString()
    );
  const fundId = Number(fund.lastInsertRowid);
  const schedule = generateVesting(
    parsed.data.totalAmount,
    parsed.data.yearsCount
  );
  const today = new Date().toISOString().slice(0, 10);
  const ins = db.prepare(
    `INSERT INTO vesting_schedules (fund_id, year_index, amount, unlock_date, status)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const v of schedule) {
    const unlock = computeUnlockDate(createdAt, v.year_index);
    const status = unlock <= today ? "UNLOCKED" : "LOCKED";
    ins.run(fundId, v.year_index, v.amount, unlock, status);
  }
  revalidatePath("/trustee");
  revalidatePath("/beneficiary");
  return { error: null, success: true };
}

export async function deleteUserAction(userId: number) {
  const session = await getSession();
  if (!session || session.role !== "TRUSTEE") {
    return { error: "无权限" };
  }
  if (userId === Number(session.sub)) {
    return { error: "不能注销当前登录账号" };
  }
  const db = getDb();
  const row = db
    .prepare("SELECT role FROM users WHERE id = ?")
    .get(userId) as { role: string } | undefined;
  if (!row) return { error: "用户不存在" };
  if (row.role === "TRUSTEE" && countTrustees() <= 1) {
    return { error: "不能删除最后一个信托管理人" };
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  revalidatePath("/trustee/users");
  revalidatePath("/beneficiary");
  return { error: null as string | null };
}

export async function deleteUserFormAction(
  _: unknown,
  formData: FormData
): Promise<{ error: string | null }> {
  const raw = formData.get("userId");
  const id = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(id)) return { error: "无效操作" };
  return deleteUserAction(id);
}

export async function logoutAction() {
  await logoutSession();
  redirect("/login");
}
