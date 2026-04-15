import "server-only";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { computeUnlockDate, generateVesting } from "./vesting";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "trust.db");

let dbInstance: Database.Database | null = null;

function migrate(db: Database.Database) {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('TRUSTEE', 'BENEFICIARY'))
    );
    CREATE TABLE IF NOT EXISTS funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trustee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      beneficiary_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_amount REAL NOT NULL,
      years_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vesting_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      year_index INTEGER NOT NULL,
      amount REAL NOT NULL,
      unlock_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('LOCKED', 'UNLOCKED'))
    );
  `);
}

function seedIfEmpty(db: Database.Database) {
  const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as {
    c: number;
  };
  if (row.c > 0) return;

  const pwd =
    process.env.SEED_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    "TrustFlow2026!";
  const hash = bcrypt.hashSync(pwd, 10);

  const insertUser = db.prepare(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)"
  );
  const admin = insertUser.run("admin", hash, "TRUSTEE");
  const ben = insertUser.run("Alexander", hash, "BENEFICIARY");

  const total = Math.floor(1_000_000 + Math.random() * 4_000_000);
  const years = 3 + Math.floor(Math.random() * 5);
  const createdAt = new Date();
  const fund = db
    .prepare(
      `INSERT INTO funds (trustee_id, beneficiary_id, total_amount, years_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      Number(admin.lastInsertRowid),
      Number(ben.lastInsertRowid),
      total,
      years,
      createdAt.toISOString()
    );

  const fundId = Number(fund.lastInsertRowid);
  const schedule = generateVesting(total, years);
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
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  dbInstance = new Database(DB_PATH);
  migrate(dbInstance);
  seedIfEmpty(dbInstance);
  return dbInstance;
}
