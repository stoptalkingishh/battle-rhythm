/* Battle Rhythm run-event track/route visualizer. */
(function (window) {
  var AFT = window.BR_AFT_2MR || null;

  var RED = "#E2574C";
  var GREEN = "#4BBF73";
  var GOLD = "#D4A644";
  var MUTED = "#9AA3B2";
  var BORDER = "#262B36";
  var BLUE = "#4C8BF5";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Oval track geometry. Perimeter = 2L + 2*pi*R. */
  var L = 150, R = 55;
  var P = 2 * L + 2 * Math.PI * R;
  var CX = 210, CY = 132;

  function trackPoint(t) {
    var d = (t % 1) * P;
    if (d < L) return [CX - L / 2 + d, CY - R];
    if (d < L + Math.PI * R) {
      var a = (d - L) / R;
      return [CX + L / 2 + Math.sin(a) * R, CY - Math.cos(a) * R];
    }
    if (d < L + Math.PI * R + L) {
      var b = d - (L + Math.PI * R);
      return [CX + L / 2 - b, CY + R];
    }
    var c = d - (L + Math.PI * R + L);
    var a2 = c / R;
    return [CX - L / 2 - Math.sin(a2) * R, CY + Math.cos(a2) * R];
  }

  function tracePath(t0, t1, steps) {
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var p = trackPoint(t0 + (t1 - t0) * i / steps);
      pts.push(p[0].toFixed(1) + "," + p[1].toFixed(1));
    }
    return "M " + pts.join(" L ");
  }

  function fullOvalPath(inset) {
    var pts = [];
    var n = 160;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var d = t * P;
      var x, y;
      var r = R - inset;
      var l = L - inset * 0.5;
      if (d < l) { x = CX - l / 2 + d; y = CY - r; }
      else if (d < l + Math.PI * r) { var a = (d - l) / r; x = CX + l / 2 + Math.sin(a) * r; y = CY - Math.cos(a) * r; }
      else if (d < l + Math.PI * r + l) { var b = d - (l + Math.PI * r); x = CX + l / 2 - b; y = CY + r; }
      else { var c = d - (l + Math.PI * r + l); var a2 = c / r; x = CX - l / 2 - Math.sin(a2) * r; y = CY + Math.cos(a2) * r; }
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    return "M " + pts.join(" L ") + " Z";
  }

  function insetOvalGeometry(inset) {
    var r = R - inset;
    var l = L - inset * 0.5;
    var per = 2 * l + 2 * Math.PI * r;
    return { r: r, l: l, per: per };
  }

  function insetOvalPoint(inset, t) {
    var g = insetOvalGeometry(inset);
    var d = (t % 1) * g.per;
    if (d < g.l) return [CX - g.l / 2 + d, CY - g.r];
    if (d < g.l + Math.PI * g.r) {
      var a = (d - g.l) / g.r;
      return [CX + g.l / 2 + Math.sin(a) * g.r, CY - Math.cos(a) * g.r];
    }
    if (d < g.l + Math.PI * g.r + g.l) {
      var b = d - (g.l + Math.PI * g.r);
      return [CX + g.l / 2 - b, CY + g.r];
    }
    var c = d - (g.l + Math.PI * g.r + g.l);
    var a2 = c / g.r;
    return [CX - g.l / 2 - Math.sin(a2) * g.r, CY + Math.cos(a2) * g.r];
  }

  function insetOvalPath(inset) {
    var g = insetOvalGeometry(inset);
    var pts = [];
    var n = 160;
    for (var i = 0; i <= n; i++) {
      var d = (i / n) * g.per;
      var x, y;
      if (d < g.l) { x = CX - g.l / 2 + d; y = CY - g.r; }
      else if (d < g.l + Math.PI * g.r) { var a = (d - g.l) / g.r; x = CX + g.l / 2 + Math.sin(a) * g.r; y = CY - Math.cos(a) * g.r; }
      else if (d < g.l + Math.PI * g.r + g.l) { var b = d - (g.l + Math.PI * g.r); x = CX + g.l / 2 - b; y = CY + g.r; }
      else { var c = d - (g.l + Math.PI * g.r + g.l); var a2 = c / g.r; x = CX - g.l / 2 - Math.sin(a2) * g.r; y = CY + Math.cos(a2) * g.r; }
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    return "M " + pts.join(" L ") + " Z";
  }

  function laneMarkers(count) {
    var group = svg("g", {});
    for (var i = 0; i < count; i++) {
      var p = trackPoint(i / count);
      var next = trackPoint((i + 0.5) / count);
      var dx = next[0] - p[0], dy = next[1] - p[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      var nx = -dy / len, ny = dx / len;
      group.appendChild(svg("line", {
        x1: (p[0] + nx * 14).toFixed(1), y1: (p[1] + ny * 14).toFixed(1),
        x2: (p[0] - nx * 14).toFixed(1), y2: (p[1] - ny * 14).toFixed(1),
        stroke: MUTED, "stroke-width": 1.4, opacity: 0.55
      }));
    }
    return group;
  }

  function baseTrack() {
    var sv = svg("svg", { viewBox: "0 0 420 264", class: "run-track-svg", role: "img", "aria-label": "Running track" });
    sv.appendChild(svg("path", { d: fullOvalPath(0), fill: "none", stroke: BORDER, "stroke-width": 14, opacity: 0.9 }));
    sv.appendChild(svg("path", { d: fullOvalPath(12), fill: "none", stroke: BORDER, "stroke-width": 1, opacity: 0.5 }));
    return sv;
  }

  function centerText(svgRoot, lines) {
    lines.forEach(function (line, i) {
      var t = svg("text", { x: CX, y: CY - 6 + i * 16, "text-anchor": "middle", class: "run-track-label" });
      t.appendChild(document.createTextNode(line.text));
      svgRoot.appendChild(t);
    });
  }

  function startLine(svgRoot) {
    var p = trackPoint(0);
    svgRoot.appendChild(svg("line", {
      x1: p[0].toFixed(1), y1: (p[1] - 16).toFixed(1),
      x2: p[0].toFixed(1), y2: (p[1] + 16).toFixed(1),
      stroke: GOLD, "stroke-width": 2.2
    }));
  }

  function segmentLayer(segments) {
    var group = svg("g", {});
    segments.forEach(function (seg) {
      group.appendChild(svg("path", {
        d: tracePath(seg.t0, seg.t1, 48),
        fill: "none", stroke: seg.color, "stroke-width": 7,
        "stroke-linecap": "round", opacity: 0.95
      }));
    });
    return group;
  }

  /* Build red/green effort segments around the loop.
     loopDef: array of {color, frac}; cycles = number of times repeated. */
  function loopSegments(loopDef, cycles) {
    var segs = [];
    var cycle = 0;
    for (var c = 0; c < cycles; c++) {
      loopDef.forEach(function (def) {
        var t0 = cycle;
        var t1 = cycle + def.frac / cycles;
        segs.push({ color: def.color, t0: t0, t1: t1 });
        cycle = t1;
      });
    }
    return segs;
  }

  function legend(items) {
    var box = el("div", "run-legend");
    items.forEach(function (item) {
      var dot = el("span", "run-legend-dot");
      dot.style.background = item.color;
      box.appendChild(dot);
      box.appendChild(el("span", "run-legend-text", item.label));
    });
    return box;
  }

  function infoLines(exercise, extra) {
    var box = el("div", "run-info");
    var rows = [];
    if (exercise && exercise.programming) rows.push(["Programming", exercise.programming]);
    (extra || []).forEach(function (row) { rows.push(row); });
    rows.forEach(function (row) {
      var line = el("p", "run-info-line");
      line.appendChild(el("strong", null, row[0] + ": "));
      line.appendChild(document.createTextNode(row[1]));
      box.appendChild(line);
    });
    return box;
  }

  function desiredBlock(text) {
    var box = el("div", "run-desired");
    box.appendChild(el("strong", null, "Desired state"));
    box.appendChild(el("p", null, text));
    return box;
  }

  function sourceBlock(text) {
    var box = el("div", "run-source");
    box.appendChild(el("strong", null, "Source"));
    box.appendChild(el("p", null, text));
    return box;
  }

  function container() {
    return el("div", "run-visual");
  }

  /* ---------------- timed / distance ---------------- */
  function timed(exercise, spec) {
    var root = container();
    var sv = baseTrack();
    startLine(sv);
    sv.appendChild(svg("path", {
      d: tracePath(0, 1, 160), fill: "none",
      stroke: spec.color || GOLD, "stroke-width": 5, "stroke-linecap": "round"
    }));
    sv.appendChild(laneMarkers(8));
    centerText(sv, spec.center || [{ text: spec.distance || "" }]);
    root.appendChild(sv);
    root.appendChild(legend([
      { color: spec.color || GOLD, label: spec.lineLabel || "Target effort" },
      { color: MUTED, label: "Lap markers (400 m)" }
    ]));
    root.appendChild(infoLines(exercise, spec.extra));
    if (spec.desired) root.appendChild(desiredBlock(spec.desired));
    if (spec.source) root.appendChild(sourceBlock(spec.source));
    return root;
  }

  /* ---------------- interval ---------------- */
  function interval(exercise, spec) {
    var root = container();
    var sv = baseTrack();
    startLine(sv);
    var workFrac = spec.work / (spec.work + spec.rest);
    var segs = loopSegments([
      { color: RED, frac: workFrac },
      { color: GREEN, frac: 1 - workFrac }
    ], spec.cycles || 3);
    sv.appendChild(segmentLayer(segs));
    centerText(sv, spec.center || [{ text: spec.work + "s : " + spec.rest + "s" }]);
    root.appendChild(sv);
    root.appendChild(legend([
      { color: RED, label: spec.highLabel || "High effort (sprint)" },
      { color: GREEN, label: spec.lowLabel || "Low effort (walk / jog)" }
    ]));
    root.appendChild(infoLines(exercise, spec.extra));
    if (spec.desired) root.appendChild(desiredBlock(spec.desired));
    if (spec.source) root.appendChild(sourceBlock(spec.source));
    return root;
  }

  /* ---------------- hill repeats ---------------- */
  function hill(exercise, spec) {
    var root = container();
    var sv = svg("svg", { viewBox: "0 0 420 220", class: "run-track-svg", role: "img", "aria-label": "Hill repeat route" });
    sv.appendChild(svg("path", {
      d: "M 60 60 C 140 40, 180 130, 250 120 C 300 114, 330 90, 360 80",
      fill: "none", stroke: BORDER, "stroke-width": 10, "stroke-linecap": "round"
    }));
    sv.appendChild(svg("path", {
      d: "M 60 60 C 140 40, 180 130, 250 120", fill: "none",
      stroke: RED, "stroke-width": 6, "stroke-linecap": "round"
    }));
    sv.appendChild(svg("path", {
      d: "M 250 120 C 300 114, 330 90, 360 80", fill: "none",
      stroke: GREEN, "stroke-width": 6, "stroke-linecap": "round"
    }));
    (function () {
      var t1 = svg("text", { x: 150, y: 55, "text-anchor": "middle", fill: RED, class: "run-track-label" });
      t1.appendChild(document.createTextNode("Sprint up"));
      sv.appendChild(t1);
      var t2 = svg("text", { x: 320, y: 70, "text-anchor": "middle", fill: GREEN, class: "run-track-label" });
      t2.appendChild(document.createTextNode("Jog / walk down"));
      sv.appendChild(t2);
    })();
    root.appendChild(sv);
    root.appendChild(legend([
      { color: RED, label: "High effort uphill" },
      { color: GREEN, label: "Controlled recovery downhill" }
    ]));
    root.appendChild(infoLines(exercise, spec.extra));
    if (spec.desired) root.appendChild(desiredBlock(spec.desired));
    if (spec.source) root.appendChild(sourceBlock(spec.source));
    return root;
  }

  /* ---------------- shuttle ---------------- */
  function shuttle(exercise, spec) {
    var root = container();
    var sv = svg("svg", { viewBox: "0 0 420 200", class: "run-track-svg", role: "img", "aria-label": "Shuttle run lane" });
    sv.appendChild(svg("line", { x1: 60, y1: 60, x2: 360, y2: 60, stroke: BORDER, "stroke-width": 12, "stroke-linecap": "round" }));
    sv.appendChild(svg("path", {
      d: "M 80 60 L 320 60", fill: "none",
      stroke: RED, "stroke-width": 5, "stroke-linecap": "round", "stroke-dasharray": "18 10"
    }));
    sv.appendChild(svg("path", {
      d: "M 320 60 L 80 60", fill: "none",
      stroke: GREEN, "stroke-width": 5, "stroke-linecap": "round", "stroke-dasharray": "18 10", opacity: 0.7
    }));
    sv.appendChild(svg("line", { x1: 80, y1: 40, x2: 80, y2: 80, stroke: GOLD, "stroke-width": 2.5 }));
    sv.appendChild(svg("line", { x1: 320, y1: 40, x2: 320, y2: 80, stroke: GOLD, "stroke-width": 2.5 }));
    (function () {
      var t1 = svg("text", { x: 80, y: 34, "text-anchor": "middle", fill: GOLD, class: "run-track-label" });
      t1.appendChild(document.createTextNode("Start / turn"));
      sv.appendChild(t1);
      var t2 = svg("text", { x: 320, y: 34, "text-anchor": "middle", fill: GOLD, class: "run-track-label" });
      t2.appendChild(document.createTextNode("Turn"));
      sv.appendChild(t2);
    })();
    root.appendChild(sv);
    root.appendChild(legend([
      { color: RED, label: "Sprint leg" },
      { color: GREEN, label: "Return / reset leg" },
      { color: GOLD, label: "Turn line" }
    ]));
    root.appendChild(infoLines(exercise, spec.extra));
    if (spec.desired) root.appendChild(desiredBlock(spec.desired));
    if (spec.source) root.appendChild(sourceBlock(spec.source));
    return root;
  }

  /* ---------------- ability groups ---------------- */
  function abilityGroups(exercise, spec) {
    var root = container();
    var sv = svg("svg", { viewBox: "0 0 420 264", class: "run-track-svg", role: "img", "aria-label": "Ability group run lanes" });
    sv.appendChild(svg("path", { d: insetOvalPath(4), fill: "none", stroke: BORDER, "stroke-width": 1, opacity: 0.4 }));
    var n = spec.groups.length;
    var insetStart = 10, insetStep = 11;
    spec.groups.forEach(function (g, i) {
      var inset = insetStart + i * insetStep;
      sv.appendChild(svg("path", {
        d: insetOvalPath(inset), fill: "none",
        stroke: g.color, "stroke-width": 6, "stroke-linecap": "round", opacity: 0.9
      }));
    });
    startLine(sv);
    spec.groups.forEach(function (g, i) {
      var inset = insetStart + i * insetStep;
      var p = insetOvalPoint(inset, 0.13);
      var label = svg("text", {
        x: p[0], y: p[1], "text-anchor": "start",
        fill: g.color, class: "run-track-label", "font-size": "12px", "font-weight": 700
      });
      label.appendChild(document.createTextNode(g.label + "  " + g.pace));
      sv.appendChild(label);
    });
    root.appendChild(sv);
    root.appendChild(legend(spec.groups.map(function (g) {
      return { color: g.color, label: g.label + " — " + g.pace };
    })));
    root.appendChild(infoLines(exercise, spec.extra));
    if (spec.desired) root.appendChild(desiredBlock(spec.desired));
    if (spec.source) root.appendChild(sourceBlock(spec.source));
    return root;
  }

  /* ---------------- AFT 2MR standards table ---------------- */
  function standardsTable() {
    if (!AFT) return null;
    var wrap = el("div", "run-standards-wrap");
    wrap.appendChild(el("p", "run-standards-title", "AFT 2-Mile Run (2MR) — overall time by age band"));
    var table = el("table", "run-standards");
    var thead = table.createTHead();
    var headRow = thead.insertRow();
    ["Age", "60 M", "60 F", "75 M", "75 F", "90 M", "90 F", "100 M", "100 F"].forEach(function (h, i) {
      var th = document.createElement("th");
      th.textContent = h;
      if (i === 1 || i === 2) th.className = "run-pass";
      if (i === 7 || i === 8) th.className = "run-max";
      headRow.appendChild(th);
    });
    var body = table.createTBody();
    AFT.ageGroups.forEach(function (age, i) {
      var row = body.insertRow();
      var ageCell = document.createElement("th");
      ageCell.textContent = age;
      row.appendChild(ageCell);
      [60, 75, 90, 100].forEach(function (pts) {
        ["m", "f"].forEach(function (sex) {
          var td = document.createElement("td");
          td.textContent = AFT.scores[pts][sex][i];
          if (pts === 60) td.className = "run-pass";
          if (pts === 100) td.className = "run-max";
          row.appendChild(td);
        });
      });
    });
    wrap.appendChild(table);
    wrap.appendChild(el("p", "run-standards-note",
      "60 = minimum passing score. 75 = solid baseline, 90 = excellent, 100 = top band. " +
      "M = male / combat; F = female."));
    return wrap;
  }

  /* ---------------- per-exercise specs ---------------- */
  var SPECS = {
    "a5-2-mile-run": {
      kind: "timed",
      distance: "2 miles",
      color: GOLD,
      lineLabel: "Target race effort",
      extra: [["Suggested split strategy", "Even pace; aim for a slightly faster second mile (negative split)"]],
      desired: "Cover the full 2 miles at an even, controlled pace. Start slightly conservative so the second mile can be held or slightly faster. The minimum passing score is 60 points for your age and gender band; target the 60-point time at a minimum and build toward the 75, 90, and 100-point times as you progress.",
      source: "Army Fitness Test (AFT) Score Tables — Two-Mile Run (2MR), Army Directive 2025-06. Approved 15 May 2025; effective 1 June 2025. Source: army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf"
    },
    "a1-unit-formation-run": {
      kind: "timed",
      distance: "20-30 min steady",
      color: GREEN,
      lineLabel: "Formation pace (RPE 4-5)",
      extra: [["Cadence", "Whole unit holds one pace; slower Soldiers set the pace"]],
      desired: "Keep the entire formation together at one conversational pace for the full duration. No one gets dropped; the slowest Soldier sets the unit pace.",
      source: "QUOTE: FM 7-22 Table 7-1 abbrev."
    },
    "a2-ability-group-run": {
      kind: "groups",
      groups: [
        { label: "A", pace: "8:00/mi", t: 0.72, color: RED },
        { label: "B", pace: "9:00/mi", t: 0.52, color: GOLD },
        { label: "C", pace: "9:30/mi", t: 0.32, color: GREEN },
        { label: "D", pace: "10:30/mi", t: 0.12, color: BLUE }
      ],
      extra: [["Grouping", "Soldiers run with their ability group so effort stays controlled"]],
      desired: "Run with your ability group at a controlled, steady effort for the full session. Each group holds its own pace: A 8:00/mile, B 9:00/mile, C 9:30/mile, D 10:30/mile. Push within your own band without dropping below conversational control.",
      source: "QUOTE: FM 7-22 ability group run"
    },
    "a3-release-run": {
      kind: "timed",
      distance: "20-40 min",
      color: GREEN,
      lineLabel: "Conversational effort (RPE 3-5)",
      desired: "Run the full duration at a conversational effort — you should be able to speak in short sentences the whole way. Start together, then control pace on your own within the pre-briefed route.",
      source: "QUOTE: FM 7-22 release run"
    },
    "a6-sustained-run": {
      kind: "timed",
      distance: "12-30 min",
      color: GOLD,
      lineLabel: "Sustained effort (RPE 4-6)",
      desired: "Maintain one constant pace for the entire run. Do not surge early; save enough to hold the same pace to the finish.",
      source: "PAR: FSP/BCT schedules"
    },
    "a7-etm-session": {
      kind: "timed",
      distance: "30-45 min",
      color: GOLD,
      lineLabel: "Zones 1-3 target HR",
      extra: [["HR target", "Work in Zones 1-3 of Table 6-5"]],
      desired: "Keep the heart rate in the prescribed zone range for the whole session. Use the machine display to stay in zone rather than chasing pace.",
      source: "PAR: FM 7-22 schedules, e.g., Table 14-14"
    },
    "a4-foot-march-ruck-march": {
      kind: "timed",
      distance: "e.g., 2 mi / 35 min",
      color: GOLD,
      lineLabel: "March pace discipline",
      extra: [["Progression rule", "Change one variable per week: load, distance, speed, or gradient (Table 7-3)"],
        ["Load guidance", "Loads above 30% body weight only with caution (para 7-9)"]],
      desired: "Hold a steady march pace for the full distance, with a natural stride and disciplined pacing. Progress load, distance, speed, or gradient one variable at a time, and do not schedule long marches on consecutive days.",
      source: "QUOTE: FM 7-22 paras 7-9, Table 7-3"
    },
    "n1-30-60s": {
      kind: "interval",
      work: 30, rest: 60,
      center: [{ text: "30s max" }, { text: "60s walk" }],
      extra: [["Reps", "4-10 reps per session (per FM 7-22 Table 6-2)"]],
      desired: "Sprint segments are all-out for 30 seconds with a full 60-second walk between them. Keep the sprint technically clean and let the walk recovery be nearly complete so every rep is at max effort.",
      source: "QUOTE: FM 7-22 Table 6-2 / para 3-5"
    },
    "n2-60-120s": {
      kind: "interval",
      work: 60, rest: 120,
      center: [{ text: "60s hard" }, { text: "120s walk" }],
      extra: [["Reps", "3-10 reps"]],
      desired: "Run hard for 60 seconds, then walk for 120 seconds so the next hard rep starts fresh. Keep the hard segments controlled and repeatable.",
      source: "QUOTE: FM 7-22 60:120s"
    },
    "n7-sprint-intervals": {
      kind: "interval",
      work: 200, rest: 400,
      center: [{ text: "200m sprint" }, { text: "400m jog" }],
      extra: [["Distance", "Sprint 200 m; recover 400 m"]],
      desired: "Sprint the 200-meter segment at max sustainable effort, then jog the 400-meter recovery. Use the recovery to fully reset before the next repeat.",
      source: "QUOTE: FM 7-22 sprint intervals"
    },
    "n5-hill-repeats": {
      kind: "hill",
      extra: [["Reps", "6-10 reps (per FM 7-22 Table 6-2 Hill Repeats Up and Down)"]],
      desired: "Sprint up the hill with strong drive and form, then descend under control at a jog or walk. The descent is recovery — do not rush it.",
      source: "QUOTE: FM 7-22 Table 6-2 Hill Repeats (Up and Down)"
    },
    "n3-300-meter-shuttle-run": {
      kind: "shuttle",
      extra: [["Distance", "25-m shuttles; 300 m total per rep"],
        ["Reps", "1-4 reps, per FUA/BCT schedules"]],
      desired: "Sprint 25 meters, touch the line, plant and accelerate out of the turn. Maintain direction-change speed and clean footwork through the whole shuttle.",
      source: "QUOTE: FM 7-22 para 3-5"
    },
    "n4-shuttle-sprint": {
      kind: "shuttle",
      extra: [["Distance", "Sprint 25 m; plant and touch ground"]],
      desired: "Sprint the 25-meter leg, plant and touch the ground at the line, then accelerate back out. Stay low through the plant and keep the turn clean.",
      source: "QUOTE: MMD1 Ex 3"
    }
  };

  function render(exercise) {
    if (!exercise) return null;
    var spec = SPECS[exercise.id];
    if (!spec) return null;
    var node;
    switch (spec.kind) {
      case "interval": node = interval(exercise, spec); break;
      case "hill": node = hill(exercise, spec); break;
      case "shuttle": node = shuttle(exercise, spec); break;
      case "groups": node = abilityGroups(exercise, spec); break;
      default: node = timed(exercise, spec); break;
    }
    if (exercise.id === "a5-2-mile-run") {
      var table = standardsTable();
      if (table) node.appendChild(table);
    }
    return node;
  }

  window.BRRunVisual = { render: render };
})(window);