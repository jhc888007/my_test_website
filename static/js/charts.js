(function (global) {
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function svgEl(name, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        n.setAttribute(k, attrs[k]);
      });
    }
    return n;
  }

  function renderTimeline(host, data) {
    clear(host);
    if (!data || !data.points || !data.points.length) {
      host.appendChild(document.createTextNode("暂无数据"));
      return;
    }
    var w = 720;
    var h = 200;
    var pad = 40;
    var svg = svgEl("svg", { width: "100%", viewBox: "0 0 " + w + " " + h, role: "img" });
    var defs = svgEl("defs");
    var grad = svgEl("linearGradient", { id: "tlg", x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#a8863f" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#e5d4a1" }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    var pts = data.points;
    var n = pts.length;
    var x0 = pad;
    var x1 = w - pad;
    var step = n > 1 ? (x1 - x0) / (n - 1) : 0;
    for (var i = 0; i < n; i++) {
      var x = x0 + step * i;
      var y = h / 2;
      var c = svgEl("circle", { cx: x, cy: y, r: 6, fill: "#c9a962", stroke: "#0d0d0d", "stroke-width": 2 });
      svg.appendChild(c);
      var t = svgEl("text", {
        x: x,
        y: y - 14,
        fill: "#e5d4a1",
        "font-size": "11",
        "text-anchor": "middle",
      });
      t.textContent = pts[i].year + "年";
      svg.appendChild(t);
      var t2 = svgEl("text", {
        x: x,
        y: y + 28,
        fill: "#b3b3b3",
        "font-size": "11",
        "text-anchor": "middle",
      });
      t2.textContent = pts[i].ratio + "%";
      svg.appendChild(t2);
    }
    if (n > 1) {
      var hl = svgEl("line", {
        x1: x0,
        y1: h / 2,
        x2: x0 + step * (n - 1),
        y2: h / 2,
        stroke: "url(#tlg)",
        "stroke-width": 2,
      });
      svg.insertBefore(hl, svg.children[2] || null);
    }
    host.appendChild(svg);
  }

  function renderFlow(host, flow) {
    clear(host);
    if (!flow || !flow.nodes || flow.nodes.length < 2) {
      host.appendChild(document.createTextNode("暂无数据"));
      return;
    }
    var w = 720;
    var h = 220;
    var svg = svgEl("svg", { width: "100%", viewBox: "0 0 " + w + " " + h, role: "img" });
    var defs = svgEl("defs");
    var mk = svgEl("marker", {
      id: "arrow",
      markerWidth: "8",
      markerHeight: "8",
      refX: "6",
      refY: "3",
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    mk.appendChild(svgEl("path", { d: "M0,0 L8,3 L0,6 z", fill: "#c9a962" }));
    defs.appendChild(mk);
    svg.appendChild(defs);
    var ax = w * 0.28;
    var bx = w * 0.72;
    var ay = h * 0.45;
    var by = h * 0.45;
    var na = flow.nodes[0];
    var nb = flow.nodes[1];
    var ca = svgEl("circle", { cx: ax, cy: ay, r: 36, fill: "#1a1a1a", stroke: "#c9a962", "stroke-width": 2 });
    var cb = svgEl("circle", { cx: bx, cy: by, r: 36, fill: "#1a1a1a", stroke: "#e5d4a1", "stroke-width": 2 });
    svg.appendChild(ca);
    svg.appendChild(cb);
    var ta = svgEl("text", { x: ax, y: ay + 5, fill: "#ffffff", "font-size": "13", "text-anchor": "middle" });
    ta.textContent = na.label || "A";
    svg.appendChild(ta);
    var tb = svgEl("text", { x: bx, y: by + 5, fill: "#ffffff", "font-size": "13", "text-anchor": "middle" });
    tb.textContent = nb.label || "B";
    svg.appendChild(tb);
    var arr = svgEl("line", {
      x1: ax + 38,
      y1: ay,
      x2: bx - 38,
      y2: by,
      stroke: "#c9a962",
      "stroke-width": 2,
      "marker-end": "url(#arrow)",
    });
    svg.appendChild(arr);
    var lk = flow.links && flow.links[0];
    var amt = lk && lk.amount != null ? lk.amount : "";
    var tm = svgEl("text", {
      x: (ax + bx) / 2,
      y: ay - 18,
      fill: "#c9a962",
      "font-size": "12",
      "text-anchor": "middle",
    });
    tm.textContent = amt !== "" ? String(amt) : "";
    svg.appendChild(tm);
    host.appendChild(svg);
  }

  function renderFamily(host, family) {
    clear(host);
    if (!family || !family.levels || !family.levels.length) {
      host.appendChild(document.createTextNode("暂无数据"));
      return;
    }
    var w = 720;
    var h = 260;
    var svg = svgEl("svg", { width: "100%", viewBox: "0 0 " + w + " " + h, role: "img" });
    var levels = family.levels;
    var rowH = 72;
    var y0 = 32;
    for (var r = 0; r < levels.length; r++) {
      var row = levels[r];
      var count = row.length;
      var gap = w / (count + 1);
      for (var i = 0; i < count; i++) {
        var cx = gap * (i + 1);
        var cy = y0 + r * rowH;
        var node = row[i];
        var circ = svgEl("circle", {
          cx: cx,
          cy: cy,
          r: 30,
          fill: "#1a1a1a",
          stroke: "#c9a962",
          "stroke-width": 2,
        });
        svg.appendChild(circ);
        var tx = svgEl("text", {
          x: cx,
          y: cy + 4,
          fill: "#ffffff",
          "font-size": "11",
          "text-anchor": "middle",
        });
        tx.textContent = (node.label || "").slice(0, 6);
        svg.appendChild(tx);
        var tg = svgEl("text", {
          x: cx,
          y: cy + 44,
          fill: "#666666",
          "font-size": "10",
          "text-anchor": "middle",
        });
        tg.textContent = node.tag || "";
        svg.appendChild(tg);
        if (r < levels.length - 1) {
          var nx = gap * (i + 1);
          var ny = y0 + (r + 1) * rowH;
          svg.appendChild(
            svgEl("line", {
              x1: nx,
              y1: cy + 30,
              x2: nx,
              y2: ny - 30,
              stroke: "#c9a962",
              "stroke-width": 1.5,
              opacity: 0.6,
            })
          );
        }
      }
    }
    host.appendChild(svg);
  }

  function renderRuleCurve(host) {
    clear(host);
    var w = 560;
    var h = 180;
    var svg = svgEl("svg", { width: "100%", viewBox: "0 0 " + w + " " + h, role: "img" });
    var pts = [
      [40, 140],
      [140, 120],
      [240, 95],
      [340, 70],
      [440, 45],
    ];
    var d = "M " + pts.map(function (p) {
      return p[0] + " " + p[1];
    }).join(" L ");
    var path = svgEl("path", {
      d: d,
      fill: "none",
      stroke: "#c9a962",
      "stroke-width": 2,
    });
    svg.appendChild(path);
    pts.forEach(function (p, i) {
      svg.appendChild(svgEl("circle", { cx: p[0], cy: p[1], r: 4, fill: "#e5d4a1" }));
      var t = svgEl("text", {
        x: p[0],
        y: p[1] - 10,
        fill: "#b3b3b3",
        "font-size": "10",
        "text-anchor": "middle",
      });
      t.textContent = "Y" + (i + 1);
      svg.appendChild(t);
    });
    host.appendChild(svg);
  }

  global.TMCharts = {
    renderTimeline: renderTimeline,
    renderFlow: renderFlow,
    renderFamily: renderFamily,
    renderRuleCurve: renderRuleCurve,
  };
})(window);
