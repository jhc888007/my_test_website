import os
import sqlite3
from functools import wraps

from flask import (
    Flask,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "app.db")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-trust-desk-secret")


@app.context_processor
def inject_user():
    return {"user": current_user()}


def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('A', 'B'))
            );
            CREATE TABLE IF NOT EXISTS trust_fund (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                b_user_id INTEGER UNIQUE NOT NULL,
                total_amount REAL NOT NULL DEFAULT 0,
                FOREIGN KEY (b_user_id) REFERENCES user(id)
            );
            CREATE TABLE IF NOT EXISTS vesting_record (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                b_user_id INTEGER NOT NULL,
                year INTEGER NOT NULL,
                amount REAL NOT NULL,
                FOREIGN KEY (b_user_id) REFERENCES user(id),
                UNIQUE (b_user_id, year)
            );
            """
        )
        db.commit()
    finally:
        db.close()


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    row = get_db().execute("SELECT * FROM user WHERE id = ?", (uid,)).fetchone()
    return dict(row) if row else None


def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not current_user():
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return wrapped


def api_login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)

    return wrapped


def role_required(role):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            u = current_user()
            if not u:
                return jsonify({"error": "unauthorized"}), 401
            if u["role"] != role:
                return jsonify({"error": "forbidden"}), 403
            return f(*args, **kwargs)

        return wrapped

    return decorator


@app.route("/")
def index():
    if current_user():
        return redirect(url_for("dashboard"))
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user():
        return redirect(url_for("dashboard"))
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        role = request.form.get("role") or ""
        if not username:
            flash("请输入用户名", "error")
            return render_template("register.html"), 400
        if role not in ("A", "B"):
            flash("请选择角色", "error")
            return render_template("register.html"), 400
        db = get_db()
        try:
            db.execute(
                "INSERT INTO user (username, role) VALUES (?, ?)", (username, role)
            )
            db.commit()
        except sqlite3.IntegrityError:
            flash("用户名已存在", "error")
            return render_template("register.html"), 400
        flash("注册成功，请登录", "success")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("dashboard"))
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        role = request.form.get("role") or ""
        if not username:
            flash("请输入用户名", "error")
            return render_template("login.html"), 400
        if role not in ("A", "B"):
            flash("请选择角色", "error")
            return render_template("login.html"), 400
        row = get_db().execute(
            "SELECT * FROM user WHERE username = ? AND role = ?",
            (username, role),
        ).fetchone()
        if not row:
            flash("用户不存在或角色不匹配", "error")
            return render_template("login.html"), 400
        session["user_id"] = row["id"]
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/dashboard")
@login_required
def dashboard():
    u = current_user()
    ctx = {"user": u}
    if u["role"] == "B":
        db = get_db()
        tf = db.execute(
            "SELECT total_amount FROM trust_fund WHERE b_user_id = ?", (u["id"],)
        ).fetchone()
        total = float(tf["total_amount"]) if tf else 0.0
        rows = db.execute(
            "SELECT year, amount FROM vesting_record WHERE b_user_id = ? ORDER BY year DESC",
            (u["id"],),
        ).fetchall()
        vested = sum(float(r["amount"]) for r in rows)
        ctx["b_total"] = total
        ctx["b_vested_total"] = vested
        ctx["b_records"] = [{"year": r["year"], "amount": float(r["amount"])} for r in rows]
    return render_template("dashboard.html", **ctx)


@app.get("/api/beneficiaries")
@api_login_required
@role_required("A")
def api_beneficiaries():
    db = get_db()
    rows = db.execute(
        "SELECT id, username FROM user WHERE role = 'B' ORDER BY username"
    ).fetchall()
    out = []
    for r in rows:
        tid = r["id"]
        tf = db.execute(
            "SELECT total_amount FROM trust_fund WHERE b_user_id = ?", (tid,)
        ).fetchone()
        amt = float(tf["total_amount"]) if tf else 0.0
        out.append({"id": tid, "username": r["username"], "total_amount": amt})
    return jsonify(out)


@app.get("/api/beneficiary/<int:b_id>")
@api_login_required
@role_required("A")
def api_beneficiary(b_id):
    db = get_db()
    u = db.execute(
        "SELECT id, username FROM user WHERE id = ? AND role = 'B'", (b_id,)
    ).fetchone()
    if not u:
        return jsonify({"error": "not found"}), 404
    tf = db.execute(
        "SELECT total_amount FROM trust_fund WHERE b_user_id = ?", (b_id,)
    ).fetchone()
    total = float(tf["total_amount"]) if tf else 0.0
    vrows = db.execute(
        "SELECT year, amount FROM vesting_record WHERE b_user_id = ? ORDER BY year DESC",
        (b_id,),
    ).fetchall()
    records = [{"year": vr["year"], "amount": float(vr["amount"])} for vr in vrows]
    return jsonify(
        {
            "id": u["id"],
            "username": u["username"],
            "total_amount": total,
            "vesting_records": records,
        }
    )


@app.post("/api/trust-fund")
@api_login_required
@role_required("A")
def api_trust_fund():
    data = request.get_json(silent=True) or {}
    try:
        b_user_id = int(data.get("b_user_id"))
        total_amount = float(data.get("total_amount"))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid payload"}), 400
    db = get_db()
    exists = db.execute(
        "SELECT id FROM user WHERE id = ? AND role = 'B'", (b_user_id,)
    ).fetchone()
    if not exists:
        return jsonify({"error": "beneficiary not found"}), 404
    row = db.execute(
        "SELECT id FROM trust_fund WHERE b_user_id = ?", (b_user_id,)
    ).fetchone()
    if row:
        db.execute(
            "UPDATE trust_fund SET total_amount = ? WHERE b_user_id = ?",
            (total_amount, b_user_id),
        )
    else:
        db.execute(
            "INSERT INTO trust_fund (b_user_id, total_amount) VALUES (?, ?)",
            (b_user_id, total_amount),
        )
    db.commit()
    return jsonify({"ok": True, "total_amount": total_amount})


@app.post("/api/vesting")
@api_login_required
@role_required("A")
def api_vesting():
    data = request.get_json(silent=True) or {}
    try:
        b_user_id = int(data.get("b_user_id"))
        year = int(data.get("year"))
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid payload"}), 400
    db = get_db()
    exists = db.execute(
        "SELECT id FROM user WHERE id = ? AND role = 'B'", (b_user_id,)
    ).fetchone()
    if not exists:
        return jsonify({"error": "beneficiary not found"}), 404
    db.execute(
        """
        INSERT INTO vesting_record (b_user_id, year, amount)
        VALUES (?, ?, ?)
        ON CONFLICT(b_user_id, year) DO UPDATE SET amount = excluded.amount
        """,
        (b_user_id, year, amount),
    )
    db.commit()
    return jsonify({"ok": True, "year": year, "amount": amount})


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
