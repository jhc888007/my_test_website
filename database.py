import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "trust.db"

DDL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('TRUSTEE', 'BENEFICIARY'))
);

CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trustee_id INTEGER NOT NULL,
    beneficiary_id INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    years_count INTEGER NOT NULL,
    FOREIGN KEY(beneficiary_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vesting_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    year_index INTEGER NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY(fund_id) REFERENCES funds(id) ON DELETE CASCADE
);
"""


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.executescript(DDL)
        conn.execute(
            "INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin', 'TRUSTEE')"
        )
        conn.commit()
    finally:
        conn.close()


def generate_vesting_schedules(total_amount, years_count):
    sum_of_years = sum(range(1, years_count + 1))
    schedules = []
    for year in range(1, years_count + 1):
        amount_for_year = (year / sum_of_years) * total_amount
        schedules.append({"year_index": year, "amount": amount_for_year})
    return schedules


def get_user_by_username(username):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, username, password, role FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, username, password, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_user(username, password, role):
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            (username, password, role),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def list_beneficiaries():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, username FROM users WHERE role = 'BENEFICIARY' ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_users_for_audit():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, username, role FROM users WHERE username != 'admin' ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def allocate_funds(trustee_id, beneficiary_id, total_amount, years_count):
    schedules = generate_vesting_schedules(total_amount, years_count)
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO funds (trustee_id, beneficiary_id, total_amount, years_count)
            VALUES (?, ?, ?, ?)
            """,
            (trustee_id, beneficiary_id, total_amount, years_count),
        )
        fund_id = cur.lastrowid
        for s in schedules:
            conn.execute(
                """
                INSERT INTO vesting_schedules (fund_id, year_index, amount)
                VALUES (?, ?, ?)
                """,
                (fund_id, s["year_index"], s["amount"]),
            )
        conn.commit()
        return fund_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_user(user_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()


def beneficiary_total_amount(beneficiary_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COALESCE(SUM(total_amount), 0) AS t FROM funds WHERE beneficiary_id = ?",
            (beneficiary_id,),
        ).fetchone()
        return float(row["t"]) if row else 0.0
    finally:
        conn.close()


def beneficiary_vesting_by_year(beneficiary_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT vs.year_index AS year_index, SUM(vs.amount) AS amount
            FROM vesting_schedules vs
            JOIN funds f ON f.id = vs.fund_id
            WHERE f.beneficiary_id = ?
            GROUP BY vs.year_index
            ORDER BY vs.year_index
            """,
            (beneficiary_id,),
        ).fetchall()
        return [{"year_index": r["year_index"], "amount": float(r["amount"])} for r in rows]
    finally:
        conn.close()
