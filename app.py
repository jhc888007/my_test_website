import os
from functools import wraps

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

import database as db

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-trust-demo-secret")


def ensure_db():
    db.init_db()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated


def trustee_required(f):
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if session.get("role") != "TRUSTEE":
            return redirect(url_for("beneficiary"))
        return f(*args, **kwargs)

    return decorated


def beneficiary_required(f):
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if session.get("role") != "BENEFICIARY":
            return redirect(url_for("trustee"))
        return f(*args, **kwargs)

    return decorated


_db_initialized = False


@app.before_request
def before_request():
    global _db_initialized
    if not _db_initialized:
        ensure_db()
        _db_initialized = True


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        role = request.form.get("role") or ""
        if role not in ("TRUSTEE", "BENEFICIARY"):
            return render_template("register.html", error="请选择有效身份")
        if not username or not password:
            return render_template("register.html", error="用户名和密码不能为空")
        if username.lower() == "admin":
            return render_template("register.html", error="该用户名不可用")
        if db.get_user_by_username(username):
            return render_template("register.html", error="用户名已存在")
        db.create_user(username, password, role)
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        user = db.get_user_by_username(username)
        if not user or user["password"] != password:
            return render_template("login.html", error="用户名或密码错误")
        session["user_id"] = user["id"]
        session["role"] = user["role"]
        if user["role"] == "TRUSTEE":
            return redirect(url_for("trustee"))
        return redirect(url_for("beneficiary"))
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/trustee")
@trustee_required
def trustee():
    beneficiaries = db.list_beneficiaries()
    users = db.list_users_for_audit()
    return render_template("trustee.html", beneficiaries=beneficiaries, users=users)


@app.route("/api/allocate", methods=["POST"])
@trustee_required
def api_allocate():
    data = request.get_json(silent=True) or {}
    try:
        beneficiary_id = int(data.get("beneficiary_id"))
        total_amount = float(data.get("total_amount"))
        years_count = int(data.get("years_count"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "参数无效"}), 400
    if years_count < 1 or total_amount <= 0:
        return jsonify({"ok": False, "error": "总额与年限不合法"}), 400
    b = db.get_user_by_id(beneficiary_id)
    if not b or b["role"] != "BENEFICIARY":
        return jsonify({"ok": False, "error": "受益人不存在"}), 400
    trustee_id = session["user_id"]
    db.allocate_funds(trustee_id, beneficiary_id, total_amount, years_count)
    return jsonify({"ok": True})


@app.route("/api/delete_user/<int:user_id>", methods=["POST"])
@trustee_required
def api_delete_user(user_id):
    target = db.get_user_by_id(user_id)
    if not target:
        return jsonify({"ok": False, "error": "用户不存在"}), 404
    if target["username"] == "admin":
        return jsonify({"ok": False, "error": "不能注销 admin"}), 403
    if user_id == session["user_id"]:
        return jsonify({"ok": False, "error": "不能注销当前账号"}), 403
    db.delete_user(user_id)
    return jsonify({"ok": True})


@app.route("/beneficiary")
@beneficiary_required
def beneficiary():
    uid = session["user_id"]
    total = db.beneficiary_total_amount(uid)
    vesting = db.beneficiary_vesting_by_year(uid)
    chart_labels = [f"第{y['year_index']}年" for y in vesting]
    chart_values = [y["amount"] for y in vesting]
    return render_template(
        "beneficiary.html",
        total_amount=total,
        chart_labels=chart_labels,
        chart_values=chart_values,
    )


@app.route("/")
def index():
    if "user_id" in session:
        if session.get("role") == "TRUSTEE":
            return redirect(url_for("trustee"))
        return redirect(url_for("beneficiary"))
    return redirect(url_for("login"))


if __name__ == "__main__":
    app.run(debug=True, port=5000)
