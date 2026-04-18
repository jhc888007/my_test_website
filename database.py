import json
import os
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_RULES_JSON = json.dumps(
    {
        "3": [1 / 3, 1 / 3, 1 / 3],
        "5": [0.10, 0.15, 0.20, 0.25, 0.30],
        "10": [0.10] * 10,
    },
    ensure_ascii=False,
)

TABLE_PREFIX = "rxt_"
T_USERS = TABLE_PREFIX + "users"
T_VESTING_RULES = TABLE_PREFIX + "vesting_rules"
T_FUNDS = TABLE_PREFIX + "funds"
T_VESTING_SCHEDULE = TABLE_PREFIX + "vesting_schedule"


def _normalize_database_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql+psycopg2://"):
        url = "postgresql://" + url[len("postgresql+psycopg2://") :]
    return url


def _database_url_raw() -> str:
    return (os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or "").strip()


def _is_postgres() -> bool:
    return bool(_database_url_raw())


def _build_postgres_dsn() -> str:
    url = _normalize_database_url(_database_url_raw())
    if not url:
        raise ValueError("DATABASE_URL / POSTGRES_URL 未配置")
    if "sslmode=" not in url.lower():
        url = url + ("&" if "?" in url else "?") + "sslmode=require"
    return url


@contextmanager
def get_connection():
    if _is_postgres():
        import psycopg2

        conn = psycopg2.connect(_build_postgres_dsn(), connect_timeout=15)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        import sqlite3

        if os.environ.get("VERCEL"):
            path = "/tmp/trust_local.db"
        else:
            os.makedirs(os.path.join(os.path.dirname(__file__), "database"), exist_ok=True)
            path = os.path.join(os.path.dirname(__file__), "database", "local.db")
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def _execute(conn, sql: str, params: Tuple = ()) -> None:
    cur = conn.cursor()
    cur.execute(sql, params)
    cur.close()


def init_db() -> None:
    with get_connection() as conn:
        if _is_postgres():
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_USERS} (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(128) UNIQUE NOT NULL,
                    password VARCHAR(256) NOT NULL,
                    role CHAR(1) NOT NULL CHECK (role IN ('A', 'B')),
                    status VARCHAR(32) NOT NULL DEFAULT 'active'
                )
                """,
            )
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_VESTING_RULES} (
                    id SERIAL PRIMARY KEY,
                    rules_json TEXT NOT NULL
                )
                """,
            )
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_FUNDS} (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES {T_USERS}(id),
                    receiver_id INTEGER NOT NULL REFERENCES {T_USERS}(id),
                    amount DOUBLE PRECISION NOT NULL,
                    fund_date DATE NOT NULL,
                    vesting_cycle INTEGER NOT NULL,
                    note TEXT,
                    vesting_rule_id INTEGER REFERENCES {T_VESTING_RULES}(id)
                )
                """,
            )
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_VESTING_SCHEDULE} (
                    id SERIAL PRIMARY KEY,
                    fund_id INTEGER NOT NULL REFERENCES {T_FUNDS}(id) ON DELETE CASCADE,
                    year_index INTEGER NOT NULL,
                    vested_amount DOUBLE PRECISION NOT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
                )
                """,
            )
        else:
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_USERS} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('A', 'B')),
                    status TEXT NOT NULL DEFAULT 'active'
                )
                """,
            )
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_VESTING_RULES} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rules_json TEXT NOT NULL
                )
                """,
            )
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_FUNDS} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL REFERENCES {T_USERS}(id),
                    receiver_id INTEGER NOT NULL REFERENCES {T_USERS}(id),
                    amount REAL NOT NULL,
                    fund_date TEXT NOT NULL,
                    vesting_cycle INTEGER NOT NULL,
                    note TEXT,
                    vesting_rule_id INTEGER REFERENCES {T_VESTING_RULES}(id)
                )
                """,
            )
            _execute(
                conn,
                f"""
                CREATE TABLE IF NOT EXISTS {T_VESTING_SCHEDULE} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fund_id INTEGER NOT NULL REFERENCES {T_FUNDS}(id) ON DELETE CASCADE,
                    year_index INTEGER NOT NULL,
                    vested_amount REAL NOT NULL,
                    status TEXT NOT NULL DEFAULT 'scheduled'
                )
                """,
            )

        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {T_VESTING_RULES}")
        c = cur.fetchone()[0]
        cur.close()
        if c == 0:
            ph = "%s" if _is_postgres() else "?"
            _execute(conn, f"INSERT INTO {T_VESTING_RULES} (rules_json) VALUES ({ph})", (DEFAULT_RULES_JSON,))


def get_rules(conn) -> Dict[str, List[float]]:
    cur = conn.cursor()
    cur.execute(f"SELECT rules_json FROM {T_VESTING_RULES} ORDER BY id LIMIT 1")
    row = cur.fetchone()
    cur.close()
    if not row:
        return json.loads(DEFAULT_RULES_JSON)
    data = json.loads(row[0])
    out = {}
    for k, v in data.items():
        out[str(k)] = [float(x) for x in v]
    return out


def set_rules(conn, rules: Dict[str, List[float]]) -> None:
    payload = json.dumps({str(k): [float(x) for x in v] for k, v in rules.items()}, ensure_ascii=False)
    cur = conn.cursor()
    cur.execute(f"SELECT id FROM {T_VESTING_RULES} ORDER BY id LIMIT 1")
    row = cur.fetchone()
    if row:
        if _is_postgres():
            cur.execute(f"UPDATE {T_VESTING_RULES} SET rules_json = %s WHERE id = %s", (payload, row[0]))
        else:
            cur.execute(f"UPDATE {T_VESTING_RULES} SET rules_json = ? WHERE id = ?", (payload, row[0]))
    else:
        if _is_postgres():
            cur.execute(f"INSERT INTO {T_VESTING_RULES} (rules_json) VALUES (%s)", (payload,))
        else:
            cur.execute(f"INSERT INTO {T_VESTING_RULES} (rules_json) VALUES (?)", (payload,))
    cur.close()


def parse_fund_date(value: str) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return datetime.strptime(value[:10], "%Y-%m-%d").date()


def vesting_calendar_year(grant: date, year_index: int) -> int:
    return grant.year + year_index - 1


def current_year_vested_total(schedule_rows: List[Dict], grant_date: date, today: Optional[date] = None) -> float:
    t = today or date.today()
    cy = t.year
    s = 0.0
    for r in schedule_rows:
        yi = int(r["year_index"])
        vy = vesting_calendar_year(grant_date, yi)
        if vy == cy:
            s += float(r["vested_amount"])
    return s


def cumulative_vested_amount(schedule_rows: List[Dict], grant_date: date, today: Optional[date] = None) -> float:
    t = today or date.today()
    cy = t.year
    s = 0.0
    for r in schedule_rows:
        yi = int(r["year_index"])
        vy = vesting_calendar_year(grant_date, yi)
        if vy <= cy:
            s += float(r["vested_amount"])
    return s


def build_schedule_rows(amount: float, percentages: List[float]) -> List[Tuple[int, float]]:
    rows = []
    for i, p in enumerate(percentages, start=1):
        rows.append((i, round(amount * float(p), 2)))
    total = sum(x[1] for x in rows)
    diff = round(amount - total, 2)
    if rows and diff != 0:
        last = list(rows[-1])
        last = (last[0], round(last[1] + diff, 2))
        rows[-1] = last
    return rows
