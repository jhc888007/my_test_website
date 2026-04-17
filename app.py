import json
import os
from collections import defaultdict
from functools import wraps

from flask import Flask, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from database import create_fund_with_vesting, delete_user_cascade, get_db, init_app_db

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "trust-flow-demo-secret-change-in-production")
init_app_db()


def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("login", next=request.path))
        return f(*args, **kwargs)

    return wrapped


def trustee_only(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if session.get("role") != "TRUSTEE":
            if session.get("role") == "BENEFICIARY":
                return redirect(url_for("beneficiary_dashboard"))
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return wrapped


def beneficiary_only(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if session.get("role") != "BENEFICIARY":
            if session.get("role") == "TRUSTEE":
                return redirect(url_for("trustee_allocation"))
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return wrapped


@app.route("/")
def index():
    if not session.get("user_id"):
        return redirect(url_for("login"))
    if session.get("role") == "TRUSTEE":
        return redirect(url_for("trustee_allocation"))
    return redirect(url_for("beneficiary_dashboard"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT id, password_hash, role FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        finally:
            conn.close()
        if row and check_password_hash(row["password_hash"], password):
            session["user_id"] = row["id"]
            session["role"] = row["role"]
            session["username"] = username
            nxt = request.args.get("next") or request.form.get("next")
            if nxt and nxt.startswith("/"):
                return redirect(nxt)
            return redirect(url_for("index"))
        return render_template("login.html", error="用户名或密码错误")
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        role = request.form.get("role") or "BENEFICIARY"
        if role not in ("TRUSTEE", "BENEFICIARY"):
            role = "BENEFICIARY"
        if not username or not password:
            return render_template("register.html", error="请填写用户名与密码")
        conn = get_db()
        try:
            if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                return render_template("register.html", error="用户名已存在")
            conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, generate_password_hash(password, method="pbkdf2:sha256"), role),
            )
            conn.commit()
        finally:
            conn.close()
        return redirect(url_for("login"))
    return render_template("register.html")


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/trustee/allocation", methods=["GET", "POST"])
@login_required
@trustee_only
def trustee_allocation():
    success = False
    if request.method == "POST":
        bid = request.form.get("beneficiary_id")
        try:
            total = float(request.form.get("total_amount") or 0)
            years_n = int(request.form.get("years_n") or 0)
        except (TypeError, ValueError):
            return render_template(
                "trustee_allocation.html",
                beneficiaries=_list_beneficiaries(),
                error="金额或年限格式无效",
            )
        if not bid or years_n < 1 or total <= 0:
            return render_template(
                "trustee_allocation.html",
                beneficiaries=_list_beneficiaries(),
                error="请选择受益人并填写有效金额与年限",
            )
        bid = int(bid)
        conn = get_db()
        try:
            r = conn.execute(
                "SELECT id FROM users WHERE id = ? AND role = 'BENEFICIARY'",
                (bid,),
            ).fetchone()
        finally:
            conn.close()
        if not r:
            return render_template(
                "trustee_allocation.html",
                beneficiaries=_list_beneficiaries(),
                error="受益人无效",
            )
        create_fund_with_vesting(session["user_id"], bid, total, years_n)
        success = True
    return render_template(
        "trustee_allocation.html",
        beneficiaries=_list_beneficiaries(),
        success=bool(success),
    )


def _list_beneficiaries():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, username FROM users WHERE role = 'BENEFICIARY' ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.route("/trustee/audit")
@login_required
@trustee_only
def trustee_audit():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, username, role, created_at FROM users ORDER BY id"
        ).fetchall()
        users = [dict(r) for r in rows]
    finally:
        conn.close()
    return render_template("trustee_audit.html", users=users)


@app.delete("/api/users/<int:uid>")
@login_required
@trustee_only
def api_delete_user(uid):
    if uid == session.get("user_id"):
        return {"ok": False, "error": "不能注销当前登录账号"}, 400
    if delete_user_cascade(uid):
        return {"ok": True}
    return {"ok": False, "error": "用户不存在"}, 404


@app.route("/trustee/tree")
@login_required
@trustee_only
def trustee_tree():
    conn = get_db()
    try:
        ben = conn.execute(
            "SELECT username FROM users WHERE role = 'BENEFICIARY' ORDER BY id"
        ).fetchall()
        names = [r["username"] for r in ben]
    finally:
        conn.close()
    tree_payload = {
        "name": "Trustee (管理人)",
        "children": [{"name": n} for n in names],
    }
    return render_template("trustee_tree.html", tree_data=tree_payload)


@app.route("/beneficiary/dashboard")
@login_required
@beneficiary_only
def beneficiary_dashboard():
    uid = session["user_id"]
    conn = get_db()
    try:
        total_row = conn.execute(
            "SELECT COALESCE(SUM(total_amount), 0) AS t FROM funds WHERE beneficiary_id = ?",
            (uid,),
        ).fetchone()
        total_assets = float(total_row["t"] or 0)

        vest_rows = conn.execute(
            """
            SELECT v.year_index, v.planned_unlock_at, v.proportion, v.unlock_amount, v.status,
                   f.id AS fund_id
            FROM vesting_schedules v
            JOIN funds f ON f.id = v.fund_id
            WHERE f.beneficiary_id = ?
            ORDER BY v.planned_unlock_at, v.id
            """,
            (uid,),
        ).fetchall()

        by_year = defaultdict(float)
        for r in vest_rows:
            by_year[r["year_index"]] += float(r["unlock_amount"])

        chart_years = sorted(by_year.keys())
        chart_amounts = [round(by_year[y], 2) for y in chart_years]
        chart_labels = [f"第{y}年" for y in chart_years]

        details = []
        for r in vest_rows:
            details.append(
                {
                    "year_label": f"第{r['year_index']}年",
                    "planned_unlock_at": r["planned_unlock_at"],
                    "proportion_pct": round(float(r["proportion"]) * 100, 4),
                    "unlock_amount": r["unlock_amount"],
                    "status": r["status"],
                }
            )
    finally:
        conn.close()

    return render_template(
        "beneficiary_dashboard.html",
        total_assets=total_assets,
        total_assets_fmt=f"{total_assets:,.0f}",
        chart_labels=json.dumps(chart_labels, ensure_ascii=False),
        chart_amounts=json.dumps(chart_amounts, ensure_ascii=False),
        details=details,
    )


@app.route("/beneficiary/macro")
@login_required
@beneficiary_only
def beneficiary_macro():
    return render_template("beneficiary_macro.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", "5001")))
