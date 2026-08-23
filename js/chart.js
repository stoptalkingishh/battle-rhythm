"use strict";
/* Tiny vanilla SVG line-chart renderer for Battle Rhythm. Adapted from
 * openGym's React LineChart (reference only), rewritten as a dependency-free,
 * DOM-agnostic module. The pure scale math (computeScale) is unit-tested; the
 * DOM renderer stays thin.
 *
 * points: [{ t (ms), y (num), d? (iso date) }] sorted by t.
 * opts:   { h, unit, color, goal, emptyLabel }
 *   goal   an optional target y — drawn as a dashed line and folded into the
 *          y-domain so the target is always on screen.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BRChart = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var W = 340; /* viewBox width; the svg scales to its container */

  function toNum(v) { return Number(v); }

  /* Pure domain + mapping math. Exported for tests; the renderer uses it. */
  function computeScale(points, goal) {
    var pts = (points || []).slice();
    var single = pts.length === 1;
    var use = single ? [pts[0], pts[0]] : pts;
    var ys = use.map(function (p) { return toNum(p.y); });
    var ymin = Math.min.apply(null, ys);
    var ymax = Math.max.apply(null, ys);
    if (isFinite(goal)) { ymin = Math.min(ymin, goal); ymax = Math.max(ymax, goal); }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    var pad = (ymax - ymin) * 0.12;
    ymin -= pad; ymax += pad;
    var t0 = toNum(use[0].t);
    var t1 = use.length ? toNum(use[use.length - 1].t) : (t0 + 1);
    if (!isFinite(t1)) t1 = t0 + 1;
    var span = t1 - t0;
    function X(t) {
      if (span === 0) return (16 + W - 8) / 2;
      return 16 + ((t - t0) / span) * (W - 16 - 8);
    }
    function Y(y, H) {
      var f = (y - ymin) / (ymax - ymin);
      return 8 + (1 - f) * (H - 8 - 20);
    }
    return {
      ymin: ymin, ymax: ymax, t0: t0, t1: t1, single: single, W: W,
      X: X, Y: Y
    };
  }

  function fmtAxis(v) {
    return v >= 100 ? Math.round(v) : (Math.round(v * 10) / 10);
  }

  /* Render an inline <svg> into container. Returns the container element. */
  function lineChart(container, opts) {
    if (!container) return container;
    opts = opts || {};
    var pts = opts.points || [];
    if (!pts.length) {
      container.innerHTML = '<div class="chart-empty">' +
        (opts.emptyLabel || "No progress logged yet.") + "</div>";
      return container;
    }
    var H = opts.h || 150;
    var unit = opts.unit ? " " + opts.unit : "";
    var color = opts.color || "var(--gold)";
    var goal = opts.goal;
    var s = computeScale(pts, goal);
    var path = pts.map(function (p, i) {
      return (i ? "L" : "M") + s.X(p.t).toFixed(1) + " " + s.Y(p.y, H).toFixed(1);
    }).join(" ");
    var dots = pts.map(function (p) {
      return '<circle cx="' + s.X(p.t).toFixed(1) + '" cy="' + s.Y(p.y, H).toFixed(1) +
        '" r="3" fill="' + color + '" />';
    }).join("");
    var goalLine = isFinite(goal)
      ? '<line x1="16" x2="' + (W - 8) + '" y1="' + s.Y(goal, H).toFixed(1) + '" y2="' + s.Y(goal, H).toFixed(1) +
        '" stroke="var(--gold)" stroke-dasharray="4 4" stroke-width="1" opacity="0.7" />'
      : "";
    var ticks = cs(s.ymin, s.ymax);
    var yAxis = ticks.map(function (v) {
      return '<text x="10" y="' + (s.Y(v, H) + 3).toFixed(1) + '" font-size="9" fill="var(--text-muted)">' +
        fmtAxis(v) + unit + "</text>" +
        '<line x1="16" x2="' + (W - 8) + '" y1="' + s.Y(v, H).toFixed(1) + '" y2="' + s.Y(v, H).toFixed(1) +
        '" stroke="var(--border)" stroke-width="0.5" />';
    }).join("");
    container.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" class="chart-svg" role="img" ' +
      'aria-label="' + (opts.ariaLabel || "progress chart") + '">' +
      yAxis + goalLine +
      '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />' +
      dots +
      xLabels(pts, s, H) +
      "</svg>";
    return container;
  }

  /* 3 evenly-ish spaced numeric ticks across [lo, hi]. */
  function cs(lo, hi) {
    var n = 3;
    var out = [];
    for (var i = 0; i < n; i++) out.push(lo + ((hi - lo) * i) / (n - 1));
    return out;
  }

  /* First/last point-date labels along the bottom axis. */
  function xLabels(pts, s, H) {
    var first = pts[0].d ? pts[0].d.slice(0, 7) : shortT(pts[0].t);
    var last = pts[pts.length - 1].d ? pts[pts.length - 1].d.slice(0, 7) : shortT(pts[pts.length - 1].t);
    var ly = H - 5;
    function el(x, anchor, txt) {
      return '<text x="' + x + '" y="' + ly + '" text-anchor="' + anchor +
        '" font-size="9" fill="var(--text-muted)">' + txt + "</text>";
    }
    return el(16, "start", first) + el(W - 8, "end", last);
  }

  function shortT(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
  }

  return { computeScale: computeScale, lineChart: lineChart };
});