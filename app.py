import json
import os
from datetime import date
from functools import wraps
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

from database import (
    _is_postgres,
    T_FUNDS,
    T_USERS,
    T_VESTING_RULES,
    T_VESTING_SCHEDULE,
    build_schedule_rows,
    cumulative_vested_amount,
    current_year_vested_total,
    get_connection,
    get_rules,
    init_db,
    parse_fund_date,
    set_rules,
    vesting_calendar_year,
)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "demo-local-secret-change-in-production")


def _ph() -> str:
    return "%s" if _is_postgres() else "?"


def _dict_rows(cur, rows) -> List[Dict[str, Any]]:
    if not rows:
        return []
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in rows]


def _run_query(conn, sql: str, params: Tuple = ()) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    out = _dict_rows(cur, rows)
    cur.close()
    return out


def _run_one(conn, sql: str, params: Tuple = ()) -> Optional[Dict[str, Any]]:
    r = _run_query(conn, sql, params)
    return r[0] if r else None


def _exec(conn, sql: str, params: Tuple = ()) -> None:
    cur = conn.cursor()
    cur.execute(sql, params)
    cur.close()


def login_required(f):
    @wraps(f)
    def w(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "message": "未登录"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)

    return w


def role_required(role: str):
    def deco(f):
        @wraps(f)
        def w(*args, **kwargs):
            if session.get("role") != role:
                return jsonify({"ok": False, "message": "无权限"}), 403
            return f(*args, **kwargs)

        return w

    return deco


def ensure_active_user(conn, uid: int) -> Optional[Dict[str, Any]]:
    u = _run_one(conn, f"SELECT id, username, role, status FROM {T_USERS} WHERE id = {_ph()}", (uid,))
    if not u:
        return None
    if u.get("status") == "disabled" and u.get("role") == "B":
        session.clear()
        return None
    return u


@app.before_request
def _before():
    pass


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register")
def register_page():
    return render_template("register.html")


@app.route("/login")
def login_page():
    return render_template("login.html")


@app.route("/dashboard/a")
@login_required
def dashboard_a():
    if session.get("role") != "A":
        return redirect(url_for("dashboard_b") if session.get("role") == "B" else url_for("login_page"))
    return render_template("dashboard_a.html")


@app.route("/dashboard/b")
@login_required
def dashboard_b():
    if session.get("role") != "B":
        return redirect(url_for("dashboard_a") if session.get("role") == "A" else url_for("login_page"))
    return render_template("dashboard_b.html")


@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip().upper()
    if not username or not password:
        return jsonify({"ok": False, "message": "用户名和密码不能为空"}), 400
    if role not in ("A", "B"):
        return jsonify({"ok": False, "message": "请选择角色"}), 400
    ph = _ph()
    with get_connection() as conn:
        ex = _run_one(conn, f"SELECT id FROM {T_USERS} WHERE username = {ph}", (username,))
        if ex:
            return jsonify({"ok": False, "message": "用户名已存在"}), 400
        _exec(
            conn,
            f"INSERT INTO {T_USERS} (username, password, role, status) VALUES ({ph}, {ph}, {ph}, 'active')",
            (username, password, role),
        )
    return jsonify({"ok": True, "message": "注册成功！请登录"})


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    ph = _ph()
    with get_connection() as conn:
        u = _run_one(
            conn,
            f"SELECT id, username, password, role, status FROM {T_USERS} WHERE username = {ph}",
            (username,),
        )
    if not u or u["password"] != password:
        return jsonify({"ok": False, "message": "用户名或密码错误"}), 401
    if u.get("status") == "disabled":
        return jsonify({"ok": False, "message": "用户名或密码错误"}), 401
    session["user_id"] = u["id"]
    session["role"] = u["role"]
    session["username"] = u["username"]
    return jsonify({"ok": True, "role": u["role"], "message": "登录成功"})


@app.route("/api/logout", methods=["GET"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/stats/a", methods=["GET"])
@login_required
def api_stats_a():
    if session.get("role") != "A":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    ph = _ph()
    with get_connection() as conn:
        total_row = _run_one(
            conn,
            f"SELECT COALESCE(SUM(amount), 0) AS s FROM {T_FUNDS} WHERE sender_id = {ph}",
            (uid,),
        )
        cnt_row = _run_one(
            conn,
            f"SELECT COUNT(*) AS c FROM {T_FUNDS} WHERE sender_id = {ph}",
            (uid,),
        )
        b_cnt = _run_one(conn, f"SELECT COUNT(*) AS c FROM {T_USERS} WHERE role = 'B'", ())
        funds = _run_query(conn, f"SELECT id, amount, fund_date FROM {T_FUNDS} WHERE sender_id = {ph}", (uid,))
        cy = date.today().year
        year_vest = 0.0
        for fd in funds:
            fd_date = parse_fund_date(str(fd["fund_date"]))
            sch = _run_query(conn, f"SELECT year_index, vested_amount FROM {T_VESTING_SCHEDULE} WHERE fund_id = {ph}", (fd["id"],))
            for r in sch:
                yi = int(r["year_index"])
                if vesting_calendar_year(fd_date, yi) == cy:
                    year_vest += float(r["vested_amount"])
    return jsonify(
        {
            "ok": True,
            "total_amount": float(total_row["s"] if total_row else 0),
            "fund_count": int(cnt_row["c"] if cnt_row else 0),
            "b_user_count": int(b_cnt["c"] if b_cnt else 0),
            "current_year_vesting_total": round(year_vest, 2),
        }
    )


@app.route("/api/funds", methods=["GET", "POST"])
@login_required
def api_funds():
    if session.get("role") != "A":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    ph = _ph()
    if request.method == "GET":
        with get_connection() as conn:
            rows = _run_query(
                conn,
                f"""
                SELECT f.id, f.amount, f.fund_date, f.vesting_cycle, f.note, f.receiver_id,
                       u.username AS receiver_name
                FROM {T_FUNDS} f
                JOIN {T_USERS} u ON u.id = f.receiver_id
                WHERE f.sender_id = {ph}
                ORDER BY f.id DESC
                """,
                (uid,),
            )
        for r in rows:
            r["amount"] = float(r["amount"])
            r["fund_date"] = str(r["fund_date"])[:10]
        return jsonify({"ok": True, "items": rows})
    data = request.get_json(force=True, silent=True) or {}
    receiver_id = data.get("receiver_id")
    amount = data.get("amount")
    fund_date = data.get("date") or date.today().isoformat()[:10]
    vesting_cycle = int(data.get("vesting_cycle") or 5)
    note = (data.get("note") or "").strip()
    if receiver_id is None or amount is None:
        return jsonify({"ok": False, "message": "金额不能为空"}), 400
    try:
        amount_f = float(amount)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "金额不能为空"}), 400
    if amount_f <= 0:
        return jsonify({"ok": False, "message": "金额不能为空"}), 400
    if vesting_cycle not in (3, 5, 10):
        vesting_cycle = 5
    with get_connection() as conn:
        ru = _run_one(conn, f"SELECT id, role FROM {T_USERS} WHERE id = {ph}", (int(receiver_id),))
        if not ru or ru["role"] != "B":
            return jsonify({"ok": False, "message": "请选择有效受益人"}), 400
        rules = get_rules(conn)
        key = str(vesting_cycle)
        if key not in rules or len(rules[key]) != vesting_cycle:
            return jsonify({"ok": False, "message": "归属规则未配置"}), 400
        percentages = rules[key]
        vr = _run_one(conn, f"SELECT id FROM {T_VESTING_RULES} ORDER BY id LIMIT 1", ())
        vr_id = vr["id"] if vr else None
        fd = parse_fund_date(fund_date)
        fd_str = fd.isoformat()
        if _is_postgres():
            cur = conn.cursor()
            cur.execute(
                f"""
                INSERT INTO {T_FUNDS} (sender_id, receiver_id, amount, fund_date, vesting_cycle, note, vesting_rule_id)
                VALUES (%s, %s, %s, %s::date, %s, %s, %s)
                RETURNING id
                """,
                (uid, int(receiver_id), amount_f, fd_str, vesting_cycle, note or None, vr_id),
            )
            fid = cur.fetchone()[0]
            cur.close()
        else:
            cur = conn.cursor()
            cur.execute(
                f"""
                INSERT INTO {T_FUNDS} (sender_id, receiver_id, amount, fund_date, vesting_cycle, note, vesting_rule_id)
                VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                """,
                (uid, int(receiver_id), amount_f, fd_str, vesting_cycle, note or None, vr_id),
            )
            fid = cur.lastrowid
            cur.close()
        sched = build_schedule_rows(amount_f, percentages)
        for yi, va in sched:
            _exec(
                conn,
                f"INSERT INTO {T_VESTING_SCHEDULE} (fund_id, year_index, vested_amount, status) VALUES ({ph}, {ph}, {ph}, 'scheduled')",
                (fid, yi, va),
            )
    return jsonify({"ok": True, "message": "发放成功！"})


@app.route("/api/funds/<int:fund_id>", methods=["PUT", "DELETE"])
@login_required
def api_fund_one(fund_id: int):
    if session.get("role") != "A":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    ph = _ph()
    if request.method == "DELETE":
        with get_connection() as conn:
            frow = _run_one(
                conn,
                f"SELECT id FROM {T_FUNDS} WHERE id = {ph} AND sender_id = {ph}",
                (fund_id, uid),
            )
            if not frow:
                return jsonify({"ok": False, "message": "记录不存在"}), 404
            _exec(conn, f"DELETE FROM {T_FUNDS} WHERE id = {ph}", (fund_id,))
        return jsonify({"ok": True, "message": "已删除"})
    data = request.get_json(force=True, silent=True) or {}
    amount = data.get("amount")
    vesting_cycle = data.get("vesting_cycle")
    note = data.get("note")
    if amount is None:
        return jsonify({"ok": False, "message": "金额不能为空"}), 400
    try:
        amount_f = float(amount)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "金额不能为空"}), 400
    if amount_f <= 0:
        return jsonify({"ok": False, "message": "金额不能为空"}), 400
    vc = int(vesting_cycle or 5)
    if vc not in (3, 5, 10):
        vc = 5
    ph = _ph()
    with get_connection() as conn:
        frow = _run_one(
            conn,
            f"SELECT id, receiver_id, fund_date FROM {T_FUNDS} WHERE id = {ph} AND sender_id = {ph}",
            (fund_id, uid),
        )
        if not frow:
            return jsonify({"ok": False, "message": "记录不存在"}), 404
        rules = get_rules(conn)
        key = str(vc)
        if key not in rules or len(rules[key]) != vc:
            return jsonify({"ok": False, "message": "归属规则未配置"}), 400
        percentages = rules[key]
        vr = _run_one(conn, f"SELECT id FROM {T_VESTING_RULES} ORDER BY id LIMIT 1", ())
        vr_id = vr["id"] if vr else None
        fd = parse_fund_date(str(frow["fund_date"]))
        fd_str = fd.isoformat()
        if _is_postgres():
            _exec(
                conn,
                f"""
                UPDATE {T_FUNDS} SET amount = %s, vesting_cycle = %s, note = %s, vesting_rule_id = %s, fund_date = %s::date
                WHERE id = %s
                """,
                (amount_f, vc, (note or "").strip() or None, vr_id, fd_str, fund_id),
            )
        else:
            _exec(
                conn,
                f"""
                UPDATE {T_FUNDS} SET amount = {ph}, vesting_cycle = {ph}, note = {ph}, vesting_rule_id = {ph}, fund_date = {ph}
                WHERE id = {ph}
                """,
                (amount_f, vc, (note or "").strip() or None, vr_id, fd_str, fund_id),
            )
        _exec(conn, f"DELETE FROM {T_VESTING_SCHEDULE} WHERE fund_id = {ph}", (fund_id,))
        sched = build_schedule_rows(amount_f, percentages)
        for yi, va in sched:
            _exec(
                conn,
                f"INSERT INTO {T_VESTING_SCHEDULE} (fund_id, year_index, vested_amount, status) VALUES ({ph}, {ph}, {ph}, 'scheduled')",
                (fund_id, yi, va),
            )
    return jsonify({"ok": True, "message": "已更新"})


@app.route("/api/users/b", methods=["GET"])
@login_required
def api_users_b():
    if session.get("role") != "A":
        return jsonify({"ok": False, "message": "无权限"}), 403
    with get_connection() as conn:
        users = _run_query(conn, f"SELECT id, username, status FROM {T_USERS} WHERE role = 'B' ORDER BY id", ())
        out = []
        for u in users:
            uid = u["id"]
            ph = _ph()
            total_row = _run_one(
                conn,
                f"SELECT COALESCE(SUM(amount), 0) AS s FROM {T_FUNDS} WHERE receiver_id = {ph}",
                (uid,),
            )
            funds = _run_query(conn, f"SELECT id, amount, fund_date FROM {T_FUNDS} WHERE receiver_id = {ph}", (uid,))
            vested = 0.0
            for fd in funds:
                sch = _run_query(
                    conn,
                    f"SELECT year_index, vested_amount FROM {T_VESTING_SCHEDULE} WHERE fund_id = {ph}",
                    (fd["id"],),
                )
                fd_date = parse_fund_date(str(fd["fund_date"]))
                vested += cumulative_vested_amount(sch, fd_date)
            out.append(
                {
                    "id": uid,
                    "username": u["username"],
                    "total_amount": float(total_row["s"] if total_row else 0),
                    "vested_amount": round(vested, 2),
                    "status": u["status"],
                }
            )
    return jsonify({"ok": True, "items": out})


@app.route("/api/users/<int:user_id>/status", methods=["PUT"])
@login_required
def api_user_status(user_id: int):
    if session.get("role") != "A":
        return jsonify({"ok": False, "message": "无权限"}), 403
    data = request.get_json(force=True, silent=True) or {}
    st = (data.get("status") or "").strip()
    if st not in ("active", "disabled"):
        return jsonify({"ok": False, "message": "参数错误"}), 400
    ph = _ph()
    with get_connection() as conn:
        u = _run_one(conn, f"SELECT id, role FROM {T_USERS} WHERE id = {ph}", (user_id,))
        if not u or u["role"] != "B":
            return jsonify({"ok": False, "message": "用户不存在"}), 404
        _exec(conn, f"UPDATE {T_USERS} SET status = {ph} WHERE id = {ph}", (st, user_id))
    return jsonify({"ok": True})


@app.route("/api/rules", methods=["GET", "PUT"])
@login_required
def api_rules():
    if session.get("role") != "A":
        return jsonify({"ok": False, "message": "无权限"}), 403
    if request.method == "GET":
        with get_connection() as conn:
            rules = get_rules(conn)
        return jsonify({"ok": True, "rules": rules})
    data = request.get_json(force=True, silent=True) or {}
    raw = data.get("rules")
    if not isinstance(raw, dict):
        return jsonify({"ok": False, "message": "参数错误"}), 400
    norm: Dict[str, List[float]] = {}
    for k, v in raw.items():
        key = str(k)
        if key not in ("3", "5", "10"):
            continue
        if not isinstance(v, list):
            return jsonify({"ok": False, "message": "参数错误"}), 400
        exp = int(key)
        if len(v) != exp:
            return jsonify({"ok": False, "message": "各年比例数量与周期不一致"}), 400
        nums = [float(x) for x in v]
        if abs(sum(nums) - 1.0) > 0.02:
            return jsonify({"ok": False, "message": "各年比例之和需为 100%"}), 400
        norm[key] = nums
    if len(norm) != 3:
        return jsonify({"ok": False, "message": "需包含 3/5/10 年规则"}), 400
    with get_connection() as conn:
        set_rules(conn, norm)
    return jsonify({"ok": True, "message": "已保存"})


def _b_overview(uid: int) -> Dict[str, Any]:
    ph = _ph()
    with get_connection() as conn:
        u = ensure_active_user(conn, uid)
        if not u:
            return {"error": "disabled", "message": "账号已禁用"}
        total_row = _run_one(
            conn,
            f"SELECT COALESCE(SUM(amount), 0) AS s FROM {T_FUNDS} WHERE receiver_id = {ph}",
            (uid,),
        )
        total_amt = float(total_row["s"] if total_row else 0)
        funds = _run_query(conn, f"SELECT id, amount, fund_date FROM {T_FUNDS} WHERE receiver_id = {ph}", (uid,))
        vested = 0.0
        current_year = 0.0
        for fd in funds:
            sch = _run_query(
                conn,
                f"SELECT year_index, vested_amount FROM {T_VESTING_SCHEDULE} WHERE fund_id = {ph}",
                (fd["id"],),
            )
            fd_date = parse_fund_date(str(fd["fund_date"]))
            vested += cumulative_vested_amount(sch, fd_date)
            current_year += current_year_vested_total(sch, fd_date)
        unvested = max(0.0, total_amt - vested)
        pct = (vested / total_amt * 100.0) if total_amt > 0 else 0.0
    return {
        "total_amount": round(total_amt, 2),
        "vested_amount": round(vested, 2),
        "unvested_amount": round(unvested, 2),
        "current_year_vesting": round(current_year, 2),
        "progress_percent": round(pct, 2),
    }


@app.route("/api/me/overview", methods=["GET"])
@login_required
def api_me_overview():
    if session.get("role") != "B":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    with get_connection() as conn:
        u = ensure_active_user(conn, uid)
        if not u:
            return jsonify({"ok": False, "message": "账号已禁用"}), 403
    data = _b_overview(uid)
    if data.get("error"):
        return jsonify({"ok": False, "message": "账号已禁用"}), 403
    return jsonify({"ok": True, **data})


@app.route("/api/me/funds", methods=["GET"])
@login_required
def api_me_funds():
    if session.get("role") != "B":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    ph = _ph()
    with get_connection() as conn:
        u = ensure_active_user(conn, uid)
        if not u:
            return jsonify({"ok": False, "message": "账号已禁用"}), 403
        rows = _run_query(
            conn,
            f"""
            SELECT f.id, f.amount, f.fund_date, f.vesting_cycle, f.note,
                   u.username AS sender_name
            FROM {T_FUNDS} f
            JOIN {T_USERS} u ON u.id = f.sender_id
            WHERE f.receiver_id = {ph}
            ORDER BY f.id DESC
            """,
            (uid,),
        )
    for r in rows:
        r["amount"] = float(r["amount"])
        r["fund_date"] = str(r["fund_date"])[:10]
    return jsonify({"ok": True, "items": rows})


@app.route("/api/me/vesting", methods=["GET"])
@login_required
def api_me_vesting():
    if session.get("role") != "B":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    ph = _ph()
    with get_connection() as conn:
        u = ensure_active_user(conn, uid)
        if not u:
            return jsonify({"ok": False, "message": "账号已禁用"}), 403
        funds = _run_query(
            conn,
            f"""
            SELECT f.id, f.amount, f.fund_date, f.vesting_cycle, f.note, u.username AS sender_name
            FROM {T_FUNDS} f
            JOIN {T_USERS} u ON u.id = f.sender_id
            WHERE f.receiver_id = {ph}
            ORDER BY f.id DESC
            """,
            (uid,),
        )
        out = []
        for fd in funds:
            fid = fd["id"]
            sch = _run_query(
                conn,
                f"SELECT year_index, vested_amount FROM {T_VESTING_SCHEDULE} WHERE fund_id = {ph} ORDER BY year_index",
                (fid,),
            )
            fd_date = parse_fund_date(str(fd["fund_date"]))
            timeline = []
            for s in sch:
                yi = int(s["year_index"])
                vy = vesting_calendar_year(fd_date, yi)
                timeline.append(
                    {
                        "year_index": yi,
                        "calendar_year": vy,
                        "amount": float(s["vested_amount"]),
                        "vested": date.today().year >= vy,
                    }
                )
            out.append(
                {
                    "fund_id": fid,
                    "sender_name": fd["sender_name"],
                    "amount": float(fd["amount"]),
                    "fund_date": str(fd["fund_date"])[:10],
                    "vesting_cycle": int(fd["vesting_cycle"]),
                    "note": fd["note"] or "",
                    "schedule": timeline,
                }
            )
    return jsonify({"ok": True, "items": out})


@app.route("/api/me/charts", methods=["GET"])
@login_required
def api_me_charts():
    if session.get("role") != "B":
        return jsonify({"ok": False, "message": "无权限"}), 403
    uid = session["user_id"]
    fund_id = request.args.get("fund_id", type=int)
    ph = _ph()
    with get_connection() as conn:
        u = ensure_active_user(conn, uid)
        if not u:
            return jsonify({"ok": False, "message": "账号已禁用"}), 403
        funds = _run_query(
            conn,
            f"""
            SELECT f.id, f.amount, f.fund_date, f.vesting_cycle, us.username AS sender_name, ur.username AS receiver_name
            FROM {T_FUNDS} f
            JOIN {T_USERS} us ON us.id = f.sender_id
            JOIN {T_USERS} ur ON ur.id = f.receiver_id
            WHERE f.receiver_id = {ph}
            ORDER BY f.id DESC
            """,
            (uid,),
        )
    if not funds:
        return jsonify(
            {
                "ok": True,
                "timeline": None,
                "flow": {"nodes": [], "links": []},
                "family": {"levels": []},
            }
        )
    target = funds[0]
    for f in funds:
        if fund_id and f["id"] == fund_id:
            target = f
            break
    fid = target["id"]
    with get_connection() as conn:
        sch = _run_query(
            conn,
            f"SELECT year_index, vested_amount FROM {T_VESTING_SCHEDULE} WHERE fund_id = {ph} ORDER BY year_index",
            (fid,),
        )
    fd_date = parse_fund_date(str(target["fund_date"]))
    pts = []
    for s in sch:
        yi = int(s["year_index"])
        vy = vesting_calendar_year(fd_date, yi)
        pct = float(s["vested_amount"]) / float(target["amount"]) if float(target["amount"]) else 0
        pts.append({"year": vy, "index": yi, "amount": float(s["vested_amount"]), "ratio": round(pct * 100, 2)})
    flow = {
        "nodes": [
            {"id": "a", "label": target["sender_name"], "role": "A"},
            {"id": "b", "label": target["receiver_name"], "role": "B"},
        ],
        "links": [{"from": "a", "to": "b", "amount": float(target["amount"])}],
    }
    family = {
        "levels": [
            [{"id": "p", "label": target["sender_name"], "tag": "信托发放方"}],
            [{"id": "c", "label": target["receiver_name"], "tag": "受益人"}],
            [{"id": "g", "label": "继承人（演示）", "tag": "下一代"}],
        ]
    }
    return jsonify({"ok": True, "timeline": {"fund_id": fid, "points": pts}, "flow": flow, "family": family})


init_db()


@app.route("/api/health", methods=["GET"])
def health():
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"ok": False}), 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)), debug=os.environ.get("FLASK_DEBUG") == "1")
