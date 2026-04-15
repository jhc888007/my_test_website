import "server-only";
import { getDb } from "./db";

export type UserRow = {
  id: number;
  username: string;
  role: "TRUSTEE" | "BENEFICIARY";
};

export function listUsers(): UserRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, username, role FROM users ORDER BY role DESC, username ASC"
    )
    .all() as UserRow[];
}

export function countTrustees(): number {
  const db = getDb();
  const r = db
    .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'TRUSTEE'")
    .get() as { c: number };
  return r.c;
}

export function getBeneficiaryDashboard(userId: number) {
  const db = getDb();
  const totalRow = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) as t FROM funds WHERE beneficiary_id = ?`
    )
    .get(userId) as { t: number };

  const rows = db
    .prepare(
      `SELECT vs.year_index, vs.amount, vs.unlock_date, vs.status
       FROM vesting_schedules vs
       JOIN funds f ON f.id = vs.fund_id
       WHERE f.beneficiary_id = ?
       ORDER BY vs.unlock_date ASC, vs.year_index ASC`
    )
    .all(userId) as {
    year_index: number;
    amount: number;
    unlock_date: string;
    status: string;
  }[];

  let cum = 0;
  const chartData = rows.map((r) => {
    cum += r.amount;
    return {
      name: `第${r.year_index}年`,
      unlock: r.unlock_date,
      amount: r.amount,
      cumulative: cum,
    };
  });

  const vested = rows
    .filter((r) => r.status === "UNLOCKED")
    .reduce((s, r) => s + r.amount, 0);
  const progressPct =
    totalRow.t > 0 ? Math.min(100, (vested / totalRow.t) * 100) : 0;

  return {
    totalAssets: totalRow.t,
    vestedAmount: vested,
    progressPct,
    vestingRows: rows,
    chartData,
  };
}

export function getTopology() {
  const db = getDb();
  const trustees = db
    .prepare("SELECT id, username FROM users WHERE role = 'TRUSTEE' ORDER BY id ASC")
    .all() as { id: number; username: string }[];
  const beneficiaries = db
    .prepare(
      "SELECT id, username FROM users WHERE role = 'BENEFICIARY' ORDER BY username ASC"
    )
    .all() as { id: number; username: string }[];
  return { trustees, beneficiaries };
}
