import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "trust_flow.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _arithmetic_vesting_rows(total_amount: float, years_n: int, base_dt: datetime):
    if years_n < 1:
        return []
    s = years_n * (years_n + 1) / 2
    rows = []
    for i in range(1, years_n + 1):
        prop = i / s
        amt = total_amount * i / s
        unlock_at = base_dt + timedelta(days=365 * (i - 1))
        rows.append(
            {
                "year_index": i,
                "planned_unlock_at": unlock_at.isoformat(sep=" ", timespec="seconds"),
                "proportion": prop,
                "unlock_amount": amt,
                "status": "待解锁",
            }
        )
    return rows


def init_db():
    conn = get_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('TRUSTEE', 'BENEFICIARY')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS funds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trustee_id INTEGER NOT NULL REFERENCES users(id),
                beneficiary_id INTEGER NOT NULL REFERENCES users(id),
                total_amount REAL NOT NULL,
                years_n INTEGER NOT NULL CHECK (years_n >= 1),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS vesting_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
                year_index INTEGER NOT NULL,
                planned_unlock_at TEXT NOT NULL,
                proportion REAL NOT NULL,
                unlock_amount REAL NOT NULL,
                status TEXT NOT NULL DEFAULT '待解锁'
            );

            CREATE INDEX IF NOT EXISTS idx_funds_beneficiary ON funds(beneficiary_id);
            CREATE INDEX IF NOT EXISTS idx_funds_trustee ON funds(trustee_id);
            CREATE INDEX IF NOT EXISTS idx_vesting_fund ON vesting_schedules(fund_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def _user_id_by_name(conn, username: str):
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    return row["id"] if row else None


def _fund_exists_for_pair(conn, trustee_id: int, beneficiary_id: int, total: float, years: int):
    row = conn.execute(
        """
        SELECT id FROM funds
        WHERE trustee_id = ? AND beneficiary_id = ? AND total_amount = ? AND years_n = ?
        """,
        (trustee_id, beneficiary_id, total, years),
    ).fetchone()
    return row is not None


def seed_if_needed():
    conn = get_db()
    try:
        now = datetime.utcnow()
        users_seed = [
            ("admin", "admin", "TRUSTEE"),
            ("Alexander", "123", "BENEFICIARY"),
            ("Isabella", "123", "BENEFICIARY"),
        ]
        for uname, pwd, role in users_seed:
            if conn.execute("SELECT 1 FROM users WHERE username = ?", (uname,)).fetchone():
                continue
            conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (uname, generate_password_hash(pwd, method="pbkdf2:sha256"), role),
            )
        conn.commit()

        admin_id = _user_id_by_name(conn, "admin")
        alex_id = _user_id_by_name(conn, "Alexander")
        isa_id = _user_id_by_name(conn, "Isabella")
        if not admin_id or not alex_id or not isa_id:
            return

        seeds = [
            (admin_id, alex_id, 500_000_000.0, 5),
            (admin_id, isa_id, 200_000_000.0, 3),
        ]
        for tid, bid, total, yn in seeds:
            if _fund_exists_for_pair(conn, tid, bid, total, yn):
                continue
            created = now.isoformat(sep=" ", timespec="seconds")
            cur = conn.execute(
                """
                INSERT INTO funds (trustee_id, beneficiary_id, total_amount, years_n, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (tid, bid, total, yn, created),
            )
            fund_id = cur.lastrowid
            base_dt = now
            for row in _arithmetic_vesting_rows(total, yn, base_dt):
                conn.execute(
                    """
                    INSERT INTO vesting_schedules
                    (fund_id, year_index, planned_unlock_at, proportion, unlock_amount, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        fund_id,
                        row["year_index"],
                        row["planned_unlock_at"],
                        row["proportion"],
                        row["unlock_amount"],
                        row["status"],
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def create_fund_with_vesting(trustee_id: int, beneficiary_id: int, total_amount: float, years_n: int):
    conn = get_db()
    try:
        now = datetime.utcnow()
        created = now.isoformat(sep=" ", timespec="seconds")
        cur = conn.execute(
            """
            INSERT INTO funds (trustee_id, beneficiary_id, total_amount, years_n, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (trustee_id, beneficiary_id, total_amount, years_n, created),
        )
        fund_id = cur.lastrowid
        base_dt = now
        for row in _arithmetic_vesting_rows(total_amount, years_n, base_dt):
            conn.execute(
                """
                INSERT INTO vesting_schedules
                (fund_id, year_index, planned_unlock_at, proportion, unlock_amount, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    fund_id,
                    row["year_index"],
                    row["planned_unlock_at"],
                    row["proportion"],
                    row["unlock_amount"],
                    row["status"],
                ),
            )
        conn.commit()
        return fund_id
    finally:
        conn.close()


def delete_user_cascade(user_id: int) -> bool:
    conn = get_db()
    try:
        conn.execute("DELETE FROM funds WHERE beneficiary_id = ? OR trustee_id = ?", (user_id, user_id))
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def init_app_db():
    init_db()
    seed_if_needed()
