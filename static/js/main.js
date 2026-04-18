(function () {
  var TM = {};

  function api(path, opt) {
    opt = opt || {};
    opt.credentials = "include";
    opt.headers = opt.headers || {};
    if (opt.body && typeof opt.body === "object" && !(opt.body instanceof FormData)) {
      opt.headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(opt.body);
    }
    return fetch(path, opt).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: "数据加载失败，请刷新重试" };
      });
    });
  }

  function showErr(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = "var(--error)";
  }

  function navActivate(links, hash) {
    var h = hash.replace("#", "") || "overview";
    links.forEach(function (a) {
      var t = (a.getAttribute("href") || "").replace("#", "");
      a.classList.toggle("is-active", t === h);
    });
  }

  function showPanel(panels, name, attr) {
    attr = attr || "data-panel";
    panels.forEach(function (p) {
      p.classList.toggle("is-active", p.getAttribute(attr) === name);
    });
  }

  TM.initRegister = function () {
    var form = document.getElementById("form-register");
    var msg = document.getElementById("reg-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showErr(msg, "");
      var fd = new FormData(form);
      api("/api/register", {
        method: "POST",
        body: {
          username: fd.get("username"),
          password: fd.get("password"),
          role: fd.get("role"),
        },
      })
        .then(function (data) {
          if (data.ok) {
            window.location.href = "/login";
          } else {
            showErr(msg, data.message || "注册失败");
          }
        })
        .catch(function () {
          showErr(msg, "网络连接异常");
        });
    });
  };

  TM.initLogin = function () {
    var form = document.getElementById("form-login");
    var msg = document.getElementById("login-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showErr(msg, "");
      var fd = new FormData(form);
      api("/api/login", {
        method: "POST",
        body: { username: fd.get("username"), password: fd.get("password") },
      })
        .then(function (data) {
          if (data.ok) {
            window.location.href = data.role === "A" ? "/dashboard/a" : "/dashboard/b";
          } else {
            showErr(msg, data.message || "用户名或密码错误");
          }
        })
        .catch(function () {
          showErr(msg, "网络连接异常");
        });
    });
  };

  function bindLogout(btn) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      api("/api/logout", { method: "GET" }).then(function () {
        window.location.href = "/login";
      });
    });
  }

  TM.initDashboardA = function () {
    var sidebar = document.getElementById("sidebar");
    var btnMenu = document.getElementById("btn-menu");
    var links = document.querySelectorAll("[data-nav]");
    var panels = document.querySelectorAll("[data-panel]");
    bindLogout(document.getElementById("btn-logout-a"));

    if (btnMenu && sidebar) {
      btnMenu.addEventListener("click", function () {
        sidebar.classList.toggle("is-open-mobile");
      });
    }

    function go(hash) {
      var name = (hash || "").replace("#", "") || "overview";
      showPanel(panels, name);
      navActivate(Array.prototype.slice.call(links), "#" + name);
      if (name === "overview") loadStats();
      if (name === "distribute") loadReceivers();
      if (name === "records") loadRecords();
      if (name === "users") loadUsers();
      if (name === "rules") loadRulesEditor();
    }

    window.addEventListener("hashchange", function () {
      go(location.hash);
    });
    links.forEach(function (a) {
      a.addEventListener("click", function () {
        if (sidebar) sidebar.classList.remove("is-open-mobile");
      });
    });
    document.querySelectorAll("[data-jump]").forEach(function (a) {
      a.addEventListener("click", function () {
        location.hash = a.getAttribute("href");
      });
    });

    go(location.hash || "#overview");

    var fd = document.getElementById("fund_date");
    if (fd) {
      fd.valueAsDate = new Date();
    }

    function loadStats() {
      api("/api/stats/a")
        .then(function (d) {
          if (!d.ok) throw new Error();
          document.getElementById("stat-total").textContent = fmtMoney(d.total_amount);
          document.getElementById("stat-count").textContent = d.fund_count;
          document.getElementById("stat-b").textContent = d.b_user_count;
          document.getElementById("stat-year-vest").textContent = fmtMoney(d.current_year_vesting_total);
        })
        .catch(function () {
          alert("数据加载失败，请刷新重试");
        });
    }

    function loadReceivers() {
      api("/api/users/b")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var sel = document.getElementById("receiver_id");
          sel.innerHTML = "";
          d.items.forEach(function (u) {
            var o = document.createElement("option");
            o.value = u.id;
            o.textContent = u.username;
            sel.appendChild(o);
          });
        })
        .catch(function () {});
    }

    var formFund = document.getElementById("form-fund");
    if (formFund) {
      formFund.addEventListener("submit", function (e) {
        e.preventDefault();
        var m = document.getElementById("fund-msg");
        showErr(m, "");
        api("/api/funds", {
          method: "POST",
          body: {
            receiver_id: parseInt(document.getElementById("receiver_id").value, 10),
            amount: document.getElementById("amount").value,
            date: document.getElementById("fund_date").value,
            vesting_cycle: parseInt(document.getElementById("vesting_cycle").value, 10),
            note: document.getElementById("note").value,
          },
        })
          .then(function (d) {
            if (d.ok) {
              alert(d.message || "发放成功！");
              location.hash = "#records";
              loadRecords();
              loadStats();
            } else {
              showErr(m, d.message || "发放失败");
            }
          })
          .catch(function () {
            showErr(m, "网络连接异常");
          });
      });
    }

    function loadRecords() {
      api("/api/funds")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var tb = document.querySelector("#table-records tbody");
          var empty = document.getElementById("records-empty");
          tb.innerHTML = "";
          if (!d.items.length) {
            empty.style.display = "block";
            return;
          }
          empty.style.display = "none";
          d.items.forEach(function (r) {
            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td>" +
              esc(r.receiver_name) +
              "</td><td>" +
              fmtMoney(r.amount) +
              "</td><td>" +
              esc(r.fund_date) +
              "</td><td>" +
              r.vesting_cycle +
              "年</td><td>" +
              esc(r.note || "") +
              '</td><td><button type="button" class="btn btn-sm btn-secondary" data-edit="' +
              r.id +
              '">编辑</button> <button type="button" class="btn btn-sm btn-danger" data-del="' +
              r.id +
              '">删除</button></td>';
            tb.appendChild(tr);
          });
          tb.querySelectorAll("[data-edit]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              openEdit(parseInt(btn.getAttribute("data-edit"), 10), d.items);
            });
          });
          tb.querySelectorAll("[data-del]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              openDel(parseInt(btn.getAttribute("data-del"), 10));
            });
          });
        })
        .catch(function () {
          document.getElementById("records-empty").textContent = "数据加载失败，请刷新重试";
          document.getElementById("records-empty").style.display = "block";
        });
    }

    function openEdit(id, items) {
      var row = items.filter(function (x) {
        return x.id === id;
      })[0];
      if (!row) return;
      document.getElementById("edit_id").value = id;
      document.getElementById("edit_amount").value = row.amount;
      document.getElementById("edit_cycle").value = String(row.vesting_cycle);
      document.getElementById("edit_note").value = row.note || "";
      document.getElementById("modal-edit").classList.add("is-open");
    }

    function openDel(id) {
      document.getElementById("del_id").value = id;
      document.getElementById("modal-del").classList.add("is-open");
    }

    document.getElementById("btn-edit-cancel").addEventListener("click", function () {
      document.getElementById("modal-edit").classList.remove("is-open");
    });
    document.getElementById("btn-edit-save").addEventListener("click", function () {
      var id = parseInt(document.getElementById("edit_id").value, 10);
      var em = document.getElementById("edit-msg");
      showErr(em, "");
      api("/api/funds/" + id, {
        method: "PUT",
        body: {
          amount: document.getElementById("edit_amount").value,
          vesting_cycle: parseInt(document.getElementById("edit_cycle").value, 10),
          note: document.getElementById("edit_note").value,
        },
      })
        .then(function (d) {
          if (d.ok) {
            document.getElementById("modal-edit").classList.remove("is-open");
            loadRecords();
            loadStats();
          } else {
            showErr(em, d.message || "保存失败");
          }
        })
        .catch(function () {
          showErr(em, "网络连接异常");
        });
    });

    document.getElementById("btn-del-cancel").addEventListener("click", function () {
      document.getElementById("modal-del").classList.remove("is-open");
    });
    document.getElementById("btn-del-ok").addEventListener("click", function () {
      var id = parseInt(document.getElementById("del_id").value, 10);
      api("/api/funds/" + id, { method: "DELETE" }).then(function (d) {
        document.getElementById("modal-del").classList.remove("is-open");
        if (d.ok) loadRecords();
        loadStats();
      });
    });

    function loadUsers() {
      api("/api/users/b")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var tb = document.querySelector("#table-users tbody");
          var empty = document.getElementById("users-empty");
          tb.innerHTML = "";
          if (!d.items.length) {
            empty.style.display = "block";
            return;
          }
          empty.style.display = "none";
          d.items.forEach(function (u) {
            var tr = document.createElement("tr");
            var st = u.status === "disabled" ? "已禁用" : "正常";
            var badge = u.status === "disabled" ? "badge-warn" : "badge-ok";
            var btn =
              u.status === "disabled"
                ? '<button type="button" class="btn btn-sm btn-secondary" data-en="' + u.id + '">启用</button>'
                : '<button type="button" class="btn btn-sm btn-danger" data-dis="' + u.id + '">禁用</button>';
            tr.innerHTML =
              "<td>" +
              esc(u.username) +
              "</td><td>" +
              fmtMoney(u.total_amount) +
              "</td><td>" +
              fmtMoney(u.vested_amount) +
              '</td><td><span class="badge ' +
              badge +
              '">' +
              st +
              "</span></td><td>" +
              btn +
              "</td>";
            tb.appendChild(tr);
          });
          tb.querySelectorAll("[data-dis]").forEach(function (b) {
            b.addEventListener("click", function () {
              setUserStatus(parseInt(b.getAttribute("data-dis"), 10), "disabled");
            });
          });
          tb.querySelectorAll("[data-en]").forEach(function (b) {
            b.addEventListener("click", function () {
              setUserStatus(parseInt(b.getAttribute("data-en"), 10), "active");
            });
          });
        })
        .catch(function () {
          document.getElementById("users-empty").textContent = "数据加载失败，请刷新重试";
          document.getElementById("users-empty").style.display = "block";
        });
    }

    function setUserStatus(id, status) {
      api("/api/users/" + id + "/status", { method: "PUT", body: { status: status } }).then(function () {
        loadUsers();
      });
    }

    function loadRulesEditor() {
      api("/api/rules")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var form = document.getElementById("form-rules");
          form.innerHTML = "";
          ["3", "5", "10"].forEach(function (key) {
            var block = document.createElement("div");
            block.className = "rule-block";
            var h = document.createElement("h3");
            h.textContent = key + "年周期各年比例（%）";
            block.appendChild(h);
            var row = document.createElement("div");
            row.className = "pct-row";
            var arr = d.rules[key] || [];
            for (var i = 0; i < arr.length; i++) {
              var lab = document.createElement("label");
              lab.textContent = "第" + (i + 1) + "年";
              var inp = document.createElement("input");
              inp.className = "input";
              inp.type = "number";
              inp.step = "0.1";
              inp.dataset.ruleKey = key;
              inp.dataset.idx = String(i);
              inp.value = String(Math.round(arr[i] * 1000) / 10);
              lab.appendChild(inp);
              row.appendChild(lab);
            }
            block.appendChild(row);
            form.appendChild(block);
          });
        })
        .catch(function () {});
    }

    document.getElementById("btn-save-rules").addEventListener("click", function () {
      var msg = document.getElementById("rules-msg");
      showErr(msg, "");
      var inputs = document.querySelectorAll("#form-rules input[data-rule-key]");
      var rules = { 3: [], 5: [], 10: [] };
      inputs.forEach(function (inp) {
        var k = inp.dataset.ruleKey;
        var v = parseFloat(inp.value);
        if (isNaN(v)) v = 0;
        rules[k].push(v / 100);
      });
      api("/api/rules", { method: "PUT", body: { rules: rules } })
        .then(function (d) {
          if (d.ok) {
            msg.style.color = "var(--success)";
            msg.textContent = "已保存";
          } else {
            showErr(msg, d.message || "保存失败");
          }
        })
        .catch(function () {
          showErr(msg, "网络连接异常");
        });
    });
  };

  TM.initDashboardB = function () {
    var sidebar = document.getElementById("sidebar-b");
    var btnMenu = document.getElementById("btn-menu-b");
    var links = document.querySelectorAll("[data-nav-b]");
    var panels = document.querySelectorAll("[data-panel-b]");
    bindLogout(document.getElementById("btn-logout-b"));

    if (btnMenu && sidebar) {
      btnMenu.addEventListener("click", function () {
        sidebar.classList.toggle("is-open-mobile");
      });
    }

    function go(hash) {
      var name = (hash || "").replace("#", "") || "funds";
      showPanel(panels, name, "data-panel-b");
      navActivate(Array.prototype.slice.call(links), "#" + name);
      if (name === "funds") loadOverview();
      if (name === "records") loadBRecords();
      if (name === "vesting") loadBVesting();
      if (name === "charts") loadCharts();
      if (name === "rules") renderRuleCurveHost();
    }

    window.addEventListener("hashchange", function () {
      go(location.hash);
    });
    links.forEach(function (a) {
      a.addEventListener("click", function () {
        if (sidebar) sidebar.classList.remove("is-open-mobile");
      });
    });
    go(location.hash || "#funds");

    function loadOverview() {
      api("/api/me/overview")
        .then(function (d) {
          if (!d.ok) {
            if (d.message) alert(d.message);
            return;
          }
          document.getElementById("b-total").textContent = fmtMoney(d.total_amount);
          document.getElementById("b-vested").textContent = fmtMoney(d.vested_amount);
          document.getElementById("b-unvested").textContent = fmtMoney(d.unvested_amount);
          document.getElementById("b-year").textContent = fmtMoney(d.current_year_vesting);
          document.getElementById("b-pct-label").textContent = d.progress_percent + "%";
          var bar = document.getElementById("b-progress");
          bar.style.width = Math.min(100, d.progress_percent) + "%";
        })
        .catch(function () {
          alert("数据加载失败，请刷新重试");
        });
    }

    function loadBRecords() {
      api("/api/me/funds")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var tb = document.querySelector("#b-table-rec tbody");
          var empty = document.getElementById("b-rec-empty");
          tb.innerHTML = "";
          if (!d.items.length) {
            empty.style.display = "block";
            return;
          }
          empty.style.display = "none";
          d.items.forEach(function (r) {
            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td>" +
              esc(r.sender_name) +
              "</td><td>" +
              fmtMoney(r.amount) +
              "</td><td>" +
              esc(r.fund_date) +
              "</td><td>" +
              r.vesting_cycle +
              "年</td><td>" +
              esc(r.note || "") +
              "</td>";
            tb.appendChild(tr);
          });
        })
        .catch(function () {
          document.getElementById("b-rec-empty").textContent = "数据加载失败，请刷新重试";
          document.getElementById("b-rec-empty").style.display = "block";
        });
    }

    function loadBVesting() {
      api("/api/me/vesting")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var host = document.getElementById("b-vesting-acc");
          var empty = document.getElementById("b-vest-empty");
          host.innerHTML = "";
          if (!d.items.length) {
            empty.style.display = "block";
            return;
          }
          empty.style.display = "none";
          d.items.forEach(function (it, idx) {
            var acc = document.createElement("div");
            acc.className = "timeline-acc" + (idx === 0 ? " is-open" : "");
            var hd = document.createElement("div");
            hd.className = "timeline-acc-hd";
            hd.innerHTML =
              "<span>发放方 " +
              esc(it.sender_name) +
              " · 金额 " +
              fmtMoney(it.amount) +
              "</span><span>" +
              (acc.classList.contains("is-open") ? "−" : "+") +
              "</span>";
            hd.addEventListener("click", function () {
              acc.classList.toggle("is-open");
              hd.querySelector("span:last-child").textContent = acc.classList.contains("is-open") ? "−" : "+";
            });
            var bd = document.createElement("div");
            bd.className = "timeline-acc-bd";
            var table = document.createElement("table");
            table.className = "data-table";
            table.innerHTML =
              "<thead><tr><th>归属年度</th><th>第几年</th><th>金额</th><th>状态</th></tr></thead><tbody></tbody>";
            var tb = table.querySelector("tbody");
            it.schedule.forEach(function (s) {
              var tr = document.createElement("tr");
              tr.innerHTML =
                "<td>" +
                s.calendar_year +
                "</td><td>第" +
                s.year_index +
                "年</td><td>" +
                fmtMoney(s.amount) +
                "</td><td>" +
                (s.vested ? "已归属" : "未归属") +
                "</td>";
              tb.appendChild(tr);
            });
            bd.appendChild(table);
            var chartHost = document.createElement("div");
            chartHost.style.marginTop = "12px";
            bd.appendChild(chartHost);
            acc.appendChild(hd);
            acc.appendChild(bd);
            host.appendChild(acc);
            if (window.TMCharts) {
              window.TMCharts.renderTimeline(chartHost, {
                points: it.schedule.map(function (s) {
                  return { year: s.calendar_year, ratio: ((s.amount / it.amount) * 100).toFixed(1) };
                }),
              });
            }
          });
        })
        .catch(function () {
          document.getElementById("b-vest-empty").textContent = "数据加载失败，请刷新重试";
          document.getElementById("b-vest-empty").style.display = "block";
        });
    }

    var chartMode = "timeline";
    var chartFundId = null;

    document.querySelectorAll("[data-chart-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        chartMode = b.getAttribute("data-chart-tab");
        paintCharts();
      });
    });
    var chartSel = document.getElementById("chart-fund-select");
    if (chartSel) {
      chartSel.addEventListener("change", function () {
        chartFundId = parseInt(chartSel.value, 10);
        paintCharts();
      });
    }

    function loadCharts() {
      api("/api/me/funds")
        .then(function (d) {
          if (!d.ok) throw new Error();
          var sel = document.getElementById("chart-fund-select");
          sel.innerHTML = "";
          d.items.forEach(function (r, i) {
            var o = document.createElement("option");
            o.value = r.id;
            o.textContent = r.sender_name + " · " + fmtMoney(r.amount);
            sel.appendChild(o);
            if (i === 0) chartFundId = r.id;
          });
          if (d.items.length) chartFundId = d.items[0].id;
          paintCharts();
        })
        .catch(function () {});
    }

    function paintCharts() {
      var host = document.getElementById("chart-host");
      if (!host || !chartFundId) {
        if (host) host.textContent = "暂无数据";
        return;
      }
      api("/api/me/charts?fund_id=" + chartFundId).then(function (d) {
        if (!d.ok || !window.TMCharts) return;
        host.innerHTML = "";
        var wrap = document.createElement("div");
        host.appendChild(wrap);
        if (chartMode === "timeline") {
          window.TMCharts.renderTimeline(wrap, d.timeline);
        } else if (chartMode === "flow") {
          window.TMCharts.renderFlow(wrap, d.flow);
        } else {
          window.TMCharts.renderFamily(wrap, d.family);
        }
      });
    }

    function renderRuleCurveHost() {
      var h = document.getElementById("rule-curve-host");
      if (h && window.TMCharts) window.TMCharts.renderRuleCurve(h);
    }
  };

  function fmtMoney(n) {
    var x = Number(n);
    if (isNaN(x)) return "-";
    return x.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.TM = TM;
})();
