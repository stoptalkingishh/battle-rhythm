"use strict";

(function () {
  var EX = (window.BR_EXERCISES || []).concat(window.BR_ATP_EXERCISES || []);
  var DOC = window.BR_DOCTRINE || {};
  var GUIDES = window.BR_MOVEMENT_GUIDES || {};

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var KEYS = { sessions: "br_sessions", regiments: "br_regiments", logs: "br_tracker", aft: "br_aft_results", trackerActive: "br_tracker_active" };
  var TS = window.BRTrackerSchema || {};
  var AFT_RESULTS = window.BRAFTResults || null;
  var TRACKER_SCHEMA = (TS && TS.SCHEMA_VERSION) || 2;
  var TS_OK = TS && typeof TS.newEntry === "function";

  /* openGym-adoption modules (load lazily; view guards for their absence). */
  var SET_H = window.BR_SET_HISTORY || null;
  var ONE_RM = window.BR_ONE_RM || null;
  var MUSC = window.BR_MUSCLE_GROUPS || null;
  var ADAPT = window.BR_HISTORY_ADAPTER || null;
  var PROG = window.BR_PROGRESSION || null;
  var WLOCK = window.BR_WAKELOCK || null;
  var CHART = window.BRChart || null;

  var COMPONENTS = {
    "muscular-strength": { label: "Muscular Strength", badge: "badge-ms" },
    "muscular-endurance": { label: "Muscular Endurance", badge: "badge-me" },
    "aerobic-endurance": { label: "Aerobic Endurance", badge: "badge-ae" },
    "anaerobic-endurance": { label: "Anaerobic Endurance", badge: "badge-an" },
    "power": { label: "Power", badge: "badge-pw" },
    "mobility-stability": { label: "Mobility & Stability", badge: "badge-mo" }
  };

  var PHASE_ORDER = ["prep", "activity", "recovery"];
  var PHASE_LABEL = { prep: "Preparation", activity: "Activity", recovery: "Recovery" };

  var MACHINE_OPTIONS = [
    { value: "none", label: "No machine (free weight / bodyweight)" },
    { value: "barbell", label: "Barbell rig" },
    { value: "hex-bar", label: "MDL hex bar" },
    { value: "cable", label: "Cable pulley column" },
    { value: "leg-press", label: "Leg press machine" },
    { value: "lat-pulldown", label: "Lat pulldown machine" },
    { value: "smith", label: "Smith machine" },
    { value: "treadmill", label: "Treadmill" },
    { value: "stationary-bike", label: "Stationary cycle" },
    { value: "erg-rower", label: "Rowing ergometer" }
  ];
  function machineLabel(value) {
    if (!value || value === "none") return "";
    var m = MACHINE_OPTIONS.find(function (o) { return o.value === value; });
    return m ? m.label : value;
  }

  var STATE = {
    view: "home",
    filter: { q: "", component: "all", aft: "all", equipment: "all" },
    session: null,
    sessionReadOnly: false,
    regiment: null,
    groupFilter: null,
    editingGroup: null,
    date: todayStr()
  };

  var STOPWATCH = { elapsed: 0, startedAt: 0, frame: null, laps: [], running: false };

  /* Reusable guided-workout timers. TIMER_CREATE inits a widget (js/timer.js)
   * per item; activeTimers lets us tear down every instance when the tracker
   * re-renders so intervals never leak or run against detached DOM. */
  var TIMER_CORE = window.BRTimerCore || null;
  var TIMER_CREATE = (window.BRTimer && typeof window.BRTimer.create === "function") ? window.BRTimer.create : null;
  var activeTimers = [];

  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    if (window.BRCloud && window.BRCloud.isActive()) {
      try { window.BRCloud.mirror(key); } catch (e) {}
    }
  }
  function load(key, def) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
  function uid() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayStr() {
    var d = new Date();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[(+p[1]) - 1] + " " + (+p[2]) + ", " + p[0];
  }
  function stripQuotes(str) { return String(str || "").replace(/^“|”$/g, ""); }
  function stripPar(str) {
    return String(str || "")
      .replace(/^\[PAR\] ?/g, "")
      .replace(/\[PAR\] ?/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function badge(component) {
    var c = COMPONENTS[component];
    if (!c) return el("span", { class: "badge", text: component });
    return el("span", { class: "badge " + c.badge, text: c.label });
  }
  function tag(text) { return el("span", { class: "tags", text: text }); }
  function componentLabel(id) {
    var c = COMPONENTS[id];
    return c ? c.label : id;
  }
  function sourceLabel(ex) {
    var s = ex.source || "";
    if (s.indexOf("QUOTE") === 0) return "Doctrinal - quoted";
    if (s.indexOf("PAR - adapted") === 0) return "Adapted / common H2F practice";
    if (s.indexOf("PAR") === 0) return "Paraphrased from doctrine";
    return "Reference";
  }
  function rowEl(icon, title, sub, actions) {
    var act = actions || [];
    var kids = [el("div", { class: "lead" }, [icon])];
    var contentKids = [Array.isArray(title) ? el("h4", {}, title) : el("h4", { text: title })];
    if (sub) contentKids.push(el("p", { class: "card-muted", style: "margin:0;font-size:.78rem;", text: sub }));
    kids.push(el("div", { class: "content" }, contentKids));
    if (act.length) kids.push(el("div", { class: "actions", style: "display:flex;gap:6px;flex-wrap:wrap;" }, act));
    return el("div", { class: "list-item" }, kids);
  }

  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) toastEl = $("#toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }

  function nav(name) {
    STATE.view = name;
    $$(".view").forEach(function (v) { v.classList.toggle("active", v.dataset.view === name); });
    $$(".nav-btn").forEach(function (b) {
      var active = b.dataset.view === name;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (name === "home") renderHome();
    else if (name === "library") renderLibrary();
    else if (name === "builder") renderBuilder();
    else if (name === "tracker") renderTracker();
    else if (name === "doctrine") renderDoctrine();
    else if (name === "progress") renderProgress();
    try { if (window.location.hash !== "#" + name) history.replaceState(null, "", "#" + name); } catch (e) {}
  }
  function initialView() {
    var h = (window.location.hash || "").replace("#", "");
    var valid = ["home", "library", "builder", "tracker", "doctrine", "progress"];
    return valid.indexOf(h) !== -1 ? h : "home";
  }

  /* ==================== COPY TO NOTES ==================== */

  var copyModalText = "";
  var lastModalFocus = null;

  function hasOpenModal() {
    return $$(".modal").some(function (modal) { return !modal.classList.contains("hidden"); });
  }
  function rememberModalFocus() {
    if (!hasOpenModal()) lastModalFocus = document.activeElement;
  }

  function openCopyModal(text) {
    rememberModalFocus();
    copyModalText = text;
    $("#copy-area").textContent = text;
    $("#copy-modal").classList.remove("hidden");
    $("#copy-btn").focus();
  }
  function closeCopyModal() {
    $("#copy-modal").classList.add("hidden");
    if (lastModalFocus && lastModalFocus.focus) lastModalFocus.focus();
  }

  function doCopy(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Copied to clipboard"); }
      catch (e) { toast("Copy failed - select the text manually"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); }, fallback);
    } else fallback();
  }

  function exercisePlainText(ex) {
    var lines = [];
    lines.push(ex.name.toUpperCase());
    lines.push("Component: " + componentLabel(ex.component) + "  |  Equipment: " + (ex.equipment || "None"));
    if (ex.drill) lines.push("Drill: " + ex.drill);
    lines.push("");
    lines.push("FORM:");
    (ex.cues || []).forEach(function (c, i) { lines.push("  " + (i + 1) + ". " + c); });
    lines.push("");
    lines.push("PROGRAMMING:");
    lines.push("  " + (ex.programming || ""));
    lines.push("MUSCLES:");
    lines.push("  " + (ex.muscles || ""));
    lines.push("SAFETY:");
    lines.push("  " + (ex.safety || ""));
    if ((ex.aft || []).length) lines.push("AFT: " + ex.aft.join(", "));
    lines.push("SOURCE: " + (ex.source || "") + "  [" + sourceLabel(ex) + "]");
    return lines.join("\n");
  }

  function drillPlainText(drill) {
    var lines = [];
    lines.push(drill.name.toUpperCase());
    lines.push("Doctrine Drill");
    lines.push("");
    if (drill.description) { lines.push("PURPOSE:"); lines.push("  " + drill.description); }
    if (drill.exercises) { lines.push("EXERCISES:"); lines.push("  " + drill.exercises); }
    if (drill.citation) { lines.push("CITATION: " + drill.citation); }
    return lines.join("\n");
  }

  function itemText(item) {
    var parts = [];
    if (item.sets) parts.push(item.sets + " sets");
    if (item.reps) parts.push(item.reps + " reps");
    if (item.duration) parts.push(item.duration);
    if (item.rest) parts.push("rest " + item.rest);
    var machine = machineLabel(item.machine);
    if (machine) parts.push("machine: " + machine);
    return parts.join(", ");
  }

  function sessionPlainText(s, dateLabel) {
    var lines = [];
    lines.push("BATTLE RHYTHM - SESSION");
    if (dateLabel) lines.push("Date: " + dateLabel);
    lines.push(s.name.toUpperCase());
    lines.push(s.duration + " min  |  Focus: " + componentLabel(s.focus) + "  |  RPE " + s.rpe);
    if (s.format === "circuit") {
      lines.push("Format: Active-Recovery Circuit | " + s.circuit.rounds + " rounds | " + s.circuit.work + " work | " + s.circuit.rest + " transition/rest");
    }
    if (s.notes) { lines.push("Notes: " + s.notes); }
    lines.push("------------------------------------");
    PHASE_ORDER.forEach(function (key) {
      var phase = s.phases[key];
      if (!phase || !phase.items.length) return;
      lines.push("");
      lines.push(PHASE_LABEL[key].toUpperCase() + ":");
      phase.items.forEach(function (item, i) {
        var t = itemText(item);
        var head = (i + 1) + ". " + item.label + (t ? "  [" + t + "]" : "");
        lines.push(head);
        var ex = EX.find(function (e) { return e.id === item.ref; });
        if (ex) {
          (ex.cues || []).slice(0, 3).forEach(function (c) { lines.push("     - " + c); });
        }
      });
    });
    lines.push("");
    lines.push("Safety confirmation: profile, supervision, risk controls, and environmental conditions reviewed.");
    lines.push("Sourced from FM 7-22 and ATP 7-22.02 (H2F doctrine).");
    lines.push("Safety: apply risk management (ATP 5-19); respect profiles (DA 3349/DD 689) and environmental guidance (TB MED 507/508).");
    return lines.join("\n");
  }

  function trackedSessionPlainText(s, date, entry) {
    var lines = sessionPlainText(s, fmtDate(date)).split("\n");
    var results = (entry && entry.results) || {};
    lines.splice(4, 0, "Tracker status: " + (entry && entry.complete ? "Completed" : "In progress"));
    lines.push("");
    lines.push("TRACKED RESULTS:");
    PHASE_ORDER.forEach(function (key) {
      var phase = s.phases[key];
      if (!phase || !phase.items.length) return;
      phase.items.forEach(function (item) {
        var r = results[item.id];
        var done = !!(r && r.done);
        var line = (done ? "[x] " : "[ ] ") + item.label;
        var act = TS_OK && r ? TS.actualSummary(r) : "";
        if (act) line += " - actual: " + act;
        else if (itemText(item)) line += " - " + itemText(item);
        lines.push(line);
      });
    });
    if (entry) {
      var meta = [];
      if (entry.rpeActual) meta.push("RPE actual: " + entry.rpeActual);
      if (entry.durationActual) meta.push("Duration actual: " + entry.durationActual);
      if (entry.notes) meta.push("Notes: " + entry.notes);
      if (meta.length) { lines.push(""); lines.push("SESSION RESULTS: " + meta.join("  |  ")); }
    }
    return lines.join("\n");
  }

  function regimentPlainText(r) {
    var sessions = load(KEYS.sessions, []);
    var lines = [];
    lines.push("BATTLE RHYTHM - REGIMENT");
    lines.push(r.name.toUpperCase());
    lines.push("Period: " + r.period);
    lines.push("------------------------------------");
    r.days.forEach(function (day) {
      if (!day.sessions.length) return;
      lines.push("");
      lines.push(day.name.toUpperCase() + ":");
      day.sessions.forEach(function (sid) {
        var s = sessions.find(function (x) { return x.id === sid; });
        if (s) lines.push("  - " + s.name + " (" + s.duration + " min, RPE " + s.rpe + ")");
      });
    });
    lines.push("");
    lines.push("Regiment grouped with Battle Rhythm, informed by FM 7-22 periodization (base/build/peak/recovery).");
    return lines.join("\n");
  }

  /* ==================== HOME ==================== */

  function renderHome() {
    if (!DOC.overview) return;
    var first = DOC.overview[0];
    $("#home-hero-sub").textContent = first.text;
    var quote = DOC.overview.find(function (o) { return /movement lethality/i.test(o.title || ""); }) || DOC.overview[1];
    $("#home-hero-quote").innerHTML = '<p>' + esc(stripQuotes(quote.text)) + '</p><footer>&mdash; ' + esc(quote.citation) + '</footer>';

    var stats = $("#home-stats");
    stats.innerHTML = "";
    [
      { n: EX.length, l: "Library exercises" },
      { n: (DOC.drills || []).length, l: "Doctrine drills" },
      { n: (DOC.aft.events || []).filter(function (e) { return e.code !== "cft"; }).length, l: "AFT events" },
      { n: (DOC.components || []).length, l: "Physical components" }
    ].forEach(function (s) {
      stats.appendChild(el("div", { class: "stat" }, [
        el("div", { class: "stat-num", text: String(s.n) }),
        el("div", { class: "stat-label", text: s.l })
      ]));
    });

    var dom = $("#home-domains");
    dom.innerHTML = "";
    (DOC.components || []).forEach(function (c) {
      dom.appendChild(el("div", { class: "card" }, [
        badge(c.id),
        el("h3", { class: "card-title", style: "margin-top:10px;", text: c.name }),
        el("p", { class: "card-muted", text: stripQuotes(stripPar(c.definition)) }),
        el("p", { class: "card-muted", style: "font-size:.74rem;margin:10px 0 0;", text: c.citation })
      ]));
    });

    var pr = $("#home-principles");
    pr.innerHTML = "";
    (DOC.principles || []).forEach(function (p) {
      pr.appendChild(el("div", { class: "card card-accent" }, [
        el("h3", { class: "card-title", text: p.title }),
        el("p", { class: "card-muted", text: stripQuotes(stripPar(p.text)) }),
        el("p", { class: "card-muted", style: "font-size:.74rem;margin:10px 0 0;", text: p.citation })
      ]));
    });

    var sess = $("#home-session");
    sess.innerHTML = "";
    sess.appendChild(el("h3", { class: "card-title", text: "One session, three elements" }));
    sess.appendChild(el("p", { class: "card-muted", text: "Every training session is built from preparation, activity, and recovery. Build yours in the Builder tab." }));
    (DOC.sessionStructure || []).forEach(function (s) {
      sess.appendChild(el("div", { style: "padding:10px 0;border-bottom:1px solid var(--border);" }, [
        el("div", { style: "display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;" }, [
          el("h4", { style: "margin:0;font-family:var(--font-display);text-transform:uppercase;letter-spacing:.05em;", text: s.name }),
          el("span", { class: "tags", text: s.duration })
        ]),
        el("p", { class: "card-muted", style: "margin:6px 0 0;", text: stripQuotes(stripPar(s.description)) }),
        el("p", { class: "card-muted", style: "font-size:.72rem;margin:4px 0 0;", text: s.citation })
      ]));
    });

    renderGroupFilter("#home-group-filter", renderHome);

    var savedHost = $("#home-saved-sessions");
    savedHost.innerHTML = "";
    var saved = filteredSessions();
    $("#home-sessions-empty").classList.toggle("hidden", saved.length > 0);
    saved.forEach(function (s) {
      var count = 0;
      PHASE_ORDER.forEach(function (k) { if (s.phases[k]) count += s.phases[k].items.length; });
      var tags = sessionTags(s);
      var titleEl = [el("span", { text: s.name }), isPreset(s) ? el("span", { class: "tags tag-preset", text: "Preset" }) : null].filter(Boolean);
      if (tags.length) titleEl = titleEl.concat(tags.slice(0, 3).map(function (t) { return el("span", { class: "tags", text: t }); }));
      savedHost.appendChild(rowEl(
        el("span", { text: "S", style: "font-family:var(--font-display);font-size:1.2rem;" }),
        titleEl,
        s.duration + " min | RPE " + s.rpe + " | " + componentLabel(s.focus) + " | " + count + " items",
        sessionActions(s, true)
      ));
    });
  }

  function sessionActions(s, inHome) {
    if (isPreset(s)) {
      return [
        el("button", { class: "btn btn-ghost btn-sm", text: "View", onclick: function () { STATE.session = s; STATE.sessionReadOnly = true; nav("builder"); } }),
        el("button", { class: "btn btn-ghost btn-sm", text: "Duplicate", onclick: function () { STATE.session = duplicateSession(s); STATE.sessionReadOnly = false; nav("builder"); } }),
        el("button", { class: "btn btn-ghost btn-sm", text: "Copy", onclick: function () { openCopyModal(sessionPlainText(s)); } })
      ];
    }
    return [
      el("button", { class: "btn btn-ghost btn-sm", text: "Edit", onclick: function () { STATE.session = s; STATE.sessionReadOnly = false; nav("builder"); } }),
      el("button", { class: "btn btn-ghost btn-sm", text: "Copy", onclick: function () { openCopyModal(sessionPlainText(s)); } }),
      el("button", { class: "btn btn-danger btn-sm", text: "x", title: "Delete", "aria-label": "Delete " + s.name, onclick: function () {
        saveSessions(getSessions().filter(function (x) { return x.id !== s.id; }));
        saveRegiments(getRegiments().map(function (regiment) {
          regiment.days.forEach(function (day) {
            day.sessions = day.sessions.filter(function (sessionId) { return sessionId !== s.id; });
          });
          return regiment;
        }));
        if (inHome) renderHome(); else renderBuilder();
      } })
    ];
  }

  /* ==================== LIBRARY ==================== */

  function fillSelect(sel, opts, selected) {
    if (sel.dataset.filled) { sel.value = selected; return; }
    sel.dataset.filled = "1";
    sel.innerHTML = "";
    opts.forEach(function (o) {
      sel.appendChild(el("option", { value: o[0], text: o[1] }));
    });
    sel.value = selected;
  }

  function populateSelects() {
    fillSelect($("#filter-component"),
      [["all", "All components"]].concat(Object.keys(COMPONENTS).map(function (k) { return [k, COMPONENTS[k].label]; })),
      STATE.filter.component);
    fillSelect($("#filter-aft"),
      [["all", "All AFT events"], ["MDL", "MDL"], ["HRP", "HRP"], ["SDC", "SDC"], ["PLK", "PLK"], ["2MR", "2MR"]],
      STATE.filter.aft);
    var eq = {};
    EX.forEach(function (e) { if (e.equipment) eq[e.equipment] = 1; });
    fillSelect($("#filter-equipment"),
      [["all", "All equipment"]].concat(Object.keys(eq).sort().map(function (k) { return [k, k]; })),
      STATE.filter.equipment);
  }

  function filteredExercises() {
    var f = STATE.filter;
    return EX.filter(function (e) {
      if (f.component !== "all" && e.component !== f.component) return false;
      if (f.aft !== "all" && !(e.aft || []).some(function (a) { return a === f.aft; })) return false;
      if (f.equipment !== "all" && e.equipment !== f.equipment) return false;
      if (f.q) {
        var q = expandAliases(f.q.toLowerCase());
        var hay = (e.name + " " + (e.muscles || "") + " " + (e.drill || "") + " " + (e.equipment || "") + " " + (e.cues || []).join(" ") + " " + (e.programming || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function expandAliases(q) {
    return ALIASES.reduce(function (memo, pair) { return memo.replace(pair[0], pair[1]); }, q);
  }
  var ALIASES = [
    [/med ?ball/g, "medicine ball"],
    [/tricep/g, "triceps"],
    [/lat ?pulldown|lat ?pull ?down/g, "lat pulldown"],
    [/ohp|overhead press/g, "overhead push-press"],
    [/bw/g, "bodyweight"],
    [/pullup|pull ?up/g, "pull-up"],
    [/plank/g, "plank"],
    [/sqt|squats/g, "squat"],
    [/dumbbell/g, "dumbbell"],
    [/db /g, "dumbbell"]
  ];

  function exerciseCard(ex) {
    var cues = (ex.cues || []).slice(0, 2).map(function (c) { return "&bull; " + esc(c); }).join("<br>");
    var card = el("div", { class: "card exercise-tile", role: "button", tabindex: "0", "aria-label": "Open workout guide for " + ex.name }, [
      el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;" }, [
        badge(ex.component),
        tag(ex.equipment || "No equipment"),
        (ex.drill ? tag(ex.drill) : null)
      ]),
      el("h3", { class: "card-title", text: ex.name }),
      el("p", { class: "card-muted", html: cues, style: "font-size:.82rem;" }),
      el("div", { class: "tag-row", style: "margin-top:10px;" }, (ex.aft || []).map(function (a) { return tag("AFT " + a); })),
      muscleTagRow(ex),
      el("p", { class: "card-muted", style: "font-size:.74rem;margin:14px 0 0;color:var(--gold);", text: "Open workout guide" })
    ]);
    card.addEventListener("click", function () { openExerciseModal(ex.id); });
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openExerciseModal(ex.id);
      }
    });
    return card;
  }

  /* Muscle-target tags for an exercise card (openGym-style body-part highlight). */
  function muscleTagRow(ex) {
    if (!MUSC) return null;
    var mus = MUSC.musclesOf(ex);
    var tags = (mus.primary || []).map(function (id) { return tag(MUSC.labelOf(id)); })
      .concat((mus.secondary || []).map(function (id) { return tag(MUSC.labelOf(id) + " (secondary)"); }));
    if (!tags.length) return null;
    return el("div", { class: "tag-row", style: "margin-top:8px;" }, tags);
  }

  function renderLibrary() {
    populateSelects();
    var chips = $("#component-chips");
    chips.innerHTML = "";
    var addChip = function (label, val) {
      var chip = el("button", {
        class: "chip" + (STATE.filter.component === val ? " active" : ""),
        "aria-pressed": String(STATE.filter.component === val),
        text: label,
        onclick: function () { STATE.filter.component = val; renderLibrary(); }
      });
      chips.appendChild(chip);
    };
    addChip("All", "all");
    Object.keys(COMPONENTS).forEach(function (k) { addChip(COMPONENTS[k].label, k); });

    var list = filteredExercises();
    var grid = $("#exercise-grid");
    grid.innerHTML = "";
    list.forEach(function (ex) { grid.appendChild(exerciseCard(ex)); });
    $("#library-empty").classList.toggle("hidden", list.length > 0);
    $("#lib-count").textContent = list.length + " of " + EX.length + " exercises";
  }

  function openExerciseModal(id) {
    openGuideModal("exercise", id);
  }

  function openDrillModal(id) {
    openGuideModal("drill", id);
  }

  function drillPhase(drillId) {
    var prep = ["pd", "4c", "ssd", "hsd", "mmd1", "mmd2"];
    var recovery = ["rd", "pmcs"];
    if (prep.indexOf(drillId) !== -1) return "prep";
    if (recovery.indexOf(drillId) !== -1) return "recovery";
    return "activity";
  }

  function openGuideModal(kind, id) {
    var ex = kind === "exercise" ? EX.find(function (e) { return e.id === id; }) : null;
    var drill = kind === "drill" ? (DOC.drills || []).find(function (d) { return d.id === id; }) : null;
    var item = ex || drill;
    if (!item) return;
    rememberModalFocus();
    $("#ex-modal-name").textContent = item.name;
    var tags = $("#ex-modal-tags");
    tags.innerHTML = "";
    if (ex) {
      tags.appendChild(badge(ex.component));
      tags.appendChild(tag(ex.equipment || "No equipment"));
      if (ex.drill) tags.appendChild(tag(ex.drill));
      (ex.aft || []).forEach(function (a) { tags.appendChild(tag("AFT " + a)); });
      tags.appendChild(tag(sourceLabel(ex)));
    } else {
      (drill.components || [drill.component]).forEach(function (c) { tags.appendChild(badge(c)); });
      tags.appendChild(tag("Doctrine Drill"));
    }

    var body = $("#ex-modal-body");
    body.innerHTML = "";
    if (ex && window.BRExerciseCoach && window.BRExerciseCoach.render) {
      body.appendChild(window.BRExerciseCoach.render(ex, GUIDES[ex.id]));
    }
    var row = function (label, value) {
      body.appendChild(el("div", { style: "padding:10px 0;border-bottom:1px solid var(--border);" }, [
        el("p", { style: "font-size:.66rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin:0 0 6px;", text: label }),
        el("p", { style: "margin:0;font-size:.88rem;line-height:1.6;white-space:pre-line;", text: value })
      ]));
    };
    if (ex) {
      row("Form", (ex.cues || []).map(function (c, i) { return (i + 1) + ". " + c; }).join("\n"));
      row("Programming", ex.programming);
      row("Muscles", ex.muscles);
      row("Safety", ex.safety);
      row("Source", ex.source + "  [" + sourceLabel(ex) + "]");
    } else {
      row("Purpose", drill.description || "");
      row("Exercises", drill.exercises || "");
      row("Citation", drill.citation || "");
    }
    $("#ex-modal-add").onclick = function () {
      if (ex) { addToSession(ex.id); }
      else { addDrillToSession(drill.id); }
      $("#ex-modal").classList.add("hidden");
    };
    $("#ex-modal-copy").onclick = function () {
      openCopyModal(ex ? exercisePlainText(ex) : drillPlainText(drill));
      $("#ex-modal").classList.add("hidden");
    };
    $("#ex-modal").classList.remove("hidden");
    $("#ex-modal-close").focus();
  }

  /* ==================== BUILDER ==================== */

  function getSessions() { return load(KEYS.sessions, []); }
  function saveSessions(list) { store(KEYS.sessions, list); }
  function seedPresets() {
    var presets = window.BR_PRESET_WORKOUTS || [];
    if (!presets.length) return;
    var hidden = load("br_presets_hidden", []);
    var existing = getSessions();
    var ids = {};
    existing.forEach(function (s) { ids[s.id] = true; });
    var added = false;
    presets.forEach(function (p) {
      if (ids[p.id] || hidden.indexOf(p.id) !== -1) return;
      existing.push(JSON.parse(JSON.stringify(p)));
      ids[p.id] = true;
      added = true;
    });
    if (added) saveSessions(existing);
  }
  function getRegiments() { return load(KEYS.regiments, []); }
  function saveRegiments(list) { store(KEYS.regiments, list); }

  /* ---- password protection ---- */
  function getSettings() { return load("br_settings", {}); }
  function saveSettings(s) { store("br_settings", s); }
  function getAftResults() { return AFT_RESULTS ? AFT_RESULTS.normalizeList(load(KEYS.aft, [])) : []; }
  function saveAftResults(list) { store(KEYS.aft, list); }
  function hashPw(str) {
    var h = 5381;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h = h & h; }
    return "h" + (h >>> 0).toString(36) + "." + s.length;
  }
  function hasPassword() { return !!getSettings().pwHash; }
  function passwordMatches(input) {
    var cfg = getSettings();
    return !!cfg.pwHash && hashPw(input) === cfg.pwHash;
  }
  var pendingAuth = null;
  function requirePassword(onSuccess) {
    pendingAuth = onSuccess;
    if (!hasPassword()) {
      toast("Set a master password in Settings first");
      openSettings();
      return;
    }
    showPw();
  }
  function openSettings() {
    var has = hasPassword();
    $("#settings-status").textContent = has ? "A master password is set." : "No master password yet. Set one to protect builder changes.";
    $("#settings-new-pw").value = "";
    $("#settings-confirm-pw").value = "";
    renderDriveSection();
    $("#settings-modal").classList.remove("hidden");
  }

  /* ---- Google Drive backup section (Settings modal) ---- */
  function renderDriveSection() {
    var statusEl = $("#drive-status");
    var areaEl = $("#drive-auth-area");
    if (!statusEl || !areaEl) return;
    var cloud = window.BRCloud;
    if (!cloud || !window.BRDrive || !window.BRDrive.isDriveConfigured()) {
      statusEl.textContent = "Not configured on this build. Add Google API keys in js/config.js to back up workouts to your Drive.";
      areaEl.innerHTML = "";
      return;
    }
    var st = cloud.getStatus();
    var user = cloud.user();
    if (st === "syncing") {
      statusEl.textContent = "Syncing with Google Drive…";
      areaEl.innerHTML = "";
      return;
    }
    if (user) {
      areaEl.innerHTML = "";
      var info = document.createElement("div");
      info.style.cssText = "display:flex;align-items:center;gap:10px;";
      if (user.picture) {
        var img = document.createElement("img");
        img.src = user.picture;
        img.alt = "";
        img.width = 28;
        img.height = 28;
        img.style.cssText = "border-radius:50%;";
        info.appendChild(img);
      }
      info.appendChild(el("span", { text: user.name || user.email || "Google user" }));
      statusEl.textContent = "";
      areaEl.appendChild(info);
      var meta = document.createElement("span");
      meta.className = "card-muted";
      meta.style.cssText = "font-size:.72rem;";
      var pending = 0;
      if (cloud.getPendingCount) { try { pending = cloud.getPendingCount() || 0; } catch (e) {} }
      if (pending > 0) {
        meta.textContent = pending + " offline change" + (pending === 1 ? "" : "s") +
          " pending — saved on this device, syncing to Drive when back online.";
        var syncNowBtn = document.createElement("button");
        syncNowBtn.className = "btn btn-gold btn-sm";
        syncNowBtn.textContent = "Sync now";
        syncNowBtn.addEventListener("click", function () {
          syncNowBtn.disabled = true;
          syncNowBtn.textContent = "Syncing…";
          (cloud.flushPending ? cloud.flushPending() : cloud.syncNow()).then(function () {
            renderDriveSection();
          }).catch(function () { renderDriveSection(); });
        });
        areaEl.appendChild(meta);
        areaEl.appendChild(syncNowBtn);
      } else {
        meta.textContent = cloud.getLastSync()
          ? "Last synced " + new Date(cloud.getLastSync()).toLocaleTimeString()
          : (st === "error" ? "Sync failed (offline?) — will retry on next save." : "Backups go to your private “Battle Rhythm” Drive folder.");
        areaEl.appendChild(meta);
      }
      var signOutBtn = document.createElement("button");
      signOutBtn.className = "btn btn-ghost btn-sm";
      signOutBtn.textContent = "Sign out";
      signOutBtn.addEventListener("click", function () {
        cloud.signOut().catch(function () {});
      });
      areaEl.appendChild(signOutBtn);
    } else {
      statusEl.textContent = "Sign in to back up your workouts to your own Google Drive in a private “Battle Rhythm” folder.";
      var signInBtn = document.createElement("button");
      signInBtn.className = "btn btn-gold btn-sm";
      signInBtn.textContent = "Continue with Google";
      signInBtn.addEventListener("click", function () {
        signInBtn.disabled = true;
        signInBtn.textContent = "Signing in…";
        cloud.signIn().then(function () {
          renderDriveSection();
        }).catch(function (err) {
          statusEl.textContent = (err && err.message) ? err.message : "Sign-in failed. Try again.";
          renderDriveSection();
        });
      });
      areaEl.innerHTML = "";
      areaEl.appendChild(signInBtn);
    }
  }

  function refreshView() {
    var v = STATE.view;
    if (v === "home") renderHome();
    else if (v === "library") renderLibrary();
    else if (v === "builder") renderBuilder();
    else if (v === "tracker") renderTracker();
    else if (v === "doctrine") renderDoctrine();
    else if (v === "progress") renderProgress();
  }

  /* ---- groups (saved tag bundles) ---- */
  function getGroups() { return load("br_groups", []); }
  function saveGroups(list) { store("br_groups", list); }
  function isPreset(s) { return (window.BR_PRESET_WORKOUTS || []).some(function (p) { return p.id === s.id; }); }
  function sessionTags(s) {
    var t = s && s.tags ? s.tags : [];
    return t.map(function (x) { return String(x).trim(); }).filter(Boolean);
  }
  function allTags() {
    var seen = {};
    getSessions().forEach(function (s) { sessionTags(s).forEach(function (t) { seen[t] = 1; }); });
    return Object.keys(seen).sort();
  }
  function sessionMatchesGroup(s, group) {
    if (!group || !group.tags || !group.tags.length) return true;
    var st = sessionTags(s);
    return group.tags.some(function (t) { return st.indexOf(t) !== -1; });
  }
  function filteredSessions() {
    var all = getSessions();
    if (!STATE.groupFilter) return all;
    var group = getGroups().find(function (g) { return g.id === STATE.groupFilter; });
    return all.filter(function (s) { return sessionMatchesGroup(s, group); });
  }

  function duplicateSession(s) {
    var copy = JSON.parse(JSON.stringify(s));
    copy.id = uid();
    copy.name = (s.name || "Session") + " (copy)";
    copy.safetyConfirmed = false;
    return copy;
  }

  function showPw() {
    $("#pw-input").value = "";
    $("#pw-error").textContent = "";
    $("#pw-modal").classList.remove("hidden");
    setTimeout(function () { $("#pw-input").focus(); }, 30);
  }

  /* ---- groups modal ---- */
  function openGroupsModal() {
    STATE.editingGroup = null;
    resetGroupForm();
    renderGroupsModal();
    $("#groups-modal").classList.remove("hidden");
  }
  function selectedGroupTags() {
    return Array.prototype.slice.call($("#group-tag-picker").querySelectorAll("button.chip.active"))
      .map(function (c) { return c.getAttribute("data-tag"); });
  }
  function resetGroupForm() {
    $("#group-name").value = "";
    var cfg = getSettings();
    var chips = el("div", {});
    allTags().forEach(function (t) {
      chips.appendChild(el("button", { class: "chip", "data-tag": t, "aria-pressed": "false", text: t, onclick: function () { this.classList.toggle("active"); this.setAttribute("aria-pressed", this.classList.contains("active")); } }));
    });
    $("#group-tag-picker").innerHTML = "";
    $("#group-tag-picker").appendChild(chips);
    renderBuilder();
    renderHome();
  }
  function renderGroupsModal() {
    var host = $("#groups-list");
    host.innerHTML = "";
    var groups = getGroups();
    if (!groups.length) { host.appendChild(el("p", { class: "card-muted", text: "No groups yet." })); return; }
    groups.forEach(function (g) {
      host.appendChild(rowEl(
        el("span", { text: "G", style: "font-family:var(--font-display);font-size:1.1rem;" }),
        el("span", { text: g.name }),
        (g.tags || []).join(", "),
        [
          el("button", { class: "btn btn-ghost btn-sm", text: "Select", onclick: function () {
            STATE.editingGroup = g.id;
            STATE.groupFilter = g.id;
            $("#group-name").value = g.name;
            Array.prototype.slice.call($("#group-tag-picker").querySelectorAll(".chip")).forEach(function (c) {
              var on = (g.tags || []).indexOf(c.getAttribute("data-tag")) !== -1;
              c.classList.toggle("active", on);
              c.setAttribute("aria-pressed", String(on));
            });
          } })
        ]
      ));
    });
  }


  function blankSession() {
    return {
      id: uid(),
      name: "",
      duration: 60,
      focus: "muscular-strength",
      rpe: 7,
      format: "session",
      circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
      notes: "",
      tags: [],
      safetyConfirmed: false,
      phases: {
        prep: { name: "Preparation", items: [newItemFromDrill("pd", "prep")] },
        activity: { name: "Activity", items: [] },
        recovery: { name: "Recovery", items: [newItemFromDrill("rd", "recovery"), newItemFromDrill("pmcs", "recovery")] }
      }
    };
  }

  function addItemToPhase(session, key, item) {
    if (!session.phases[key]) session.phases[key] = { name: PHASE_LABEL[key], items: [] };
    session.phases[key].items.push(item);
  }

  function newItemFromExercise(ex) {
    return {
      id: uid(), type: "exercise", ref: ex.id, label: ex.name,
      sets: "3", reps: "10", duration: "", rest: "60s", machine: "none"
    };
  }

  function newItemFromDrill(drillId, phase) {
    var drill = (DOC.drills || []).find(function (d) { return d.id === drillId; });
    var duration = phase === "recovery" ? "20-30 sec" : phase === "prep" ? "5-10 reps" : "Per drill";
    return {
      id: uid(), type: "drill", ref: drillId,
      label: drill ? drill.name : "Doctrine Drill",
      sets: "", reps: "", duration: duration, rest: ""
    };
  }

  function addToSession(exId) {
    var ex = EX.find(function (e) { return e.id === exId; });
    if (!ex) return;
    if (!STATE.session) STATE.session = blankSession();
    var key = ex.id === "mb8-recovery-drill-stretches" ? "recovery" : ex.component === "mobility-stability" ? "prep" : "activity";
    addItemToPhase(STATE.session, key, newItemFromExercise(ex));
    nav("builder");
    toast("Added " + ex.name + " to " + PHASE_LABEL[key]);
  }

  function addDrillToSession(drillId) {
    var drill = (DOC.drills || []).find(function (d) { return d.id === drillId; });
    if (!drill) return;
    if (!STATE.session) STATE.session = blankSession();
    var key = drillPhase(drillId);
    addItemToPhase(STATE.session, key, newItemFromDrill(drillId, key));
    nav("builder");
    toast("Added " + drill.name + " to " + PHASE_LABEL[key]);
  }

  function fillFocusSelect() {
    var sel = $("#session-focus");
    if (sel.dataset.filled) return;
    sel.dataset.filled = "1";
    sel.innerHTML = "";
    Object.keys(COMPONENTS).forEach(function (k) {
      sel.appendChild(el("option", { value: k, text: COMPONENTS[k].label }));
    });
  }
  function fillRpeSelect() {
    var sel = $("#session-rpe");
    if (sel.dataset.filled) return;
    sel.dataset.filled = "1";
    sel.innerHTML = "";
    (DOC.programming && DOC.programming.rpe && DOC.programming.rpe.levels || []).forEach(function (r) {
      sel.appendChild(el("option", { value: r.value, text: r.value + " - " + r.label }));
    });
  }
  function fillPeriodSelect() {
    var sel = $("#regiment-period");
    if (sel.dataset.filled) return;
    sel.dataset.filled = "1";
    sel.innerHTML = "";
    (DOC.programming && DOC.programming.periods || []).forEach(function (p) {
      sel.appendChild(el("option", { value: p.name, text: p.name }));
    });
  }

  function itemField(item, field, placeholder, readOnly) {
    var input = el("input", {
      class: "input", type: "text", value: item[field] || "", placeholder: placeholder,
      disabled: !!readOnly,
      oninput: function () { item[field] = input.value; }
    });
    return el("label", { style: "display:flex;flex-direction:column;gap:3px;font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);" }, [
      document.createTextNode(placeholder), input
    ]);
  }

  function machineField(item, readOnly) {
    var select = el("select", { class: "select", "aria-label": "Target machine for " + item.label, disabled: !!readOnly });
    select.appendChild(el("option", { value: "none", text: "No machine (free weight / bodyweight)" }));
    MACHINE_OPTIONS.forEach(function (o) {
      var opt = el("option", { value: o.value, text: o.label });
      opt.selected = item.machine === o.value;
      select.appendChild(opt);
    });
    select.addEventListener("change", function () { item.machine = select.value; });
    return el("label", { style: "display:flex;flex-direction:column;gap:3px;font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);" }, [
      document.createTextNode("Machine (supplemental)"), select
    ]);
  }

  function renderPhaseItems(phase, readOnly) {
    var wrap = el("div", {});
    if (!phase.items.length) {
      wrap.appendChild(el("p", { class: "card-muted", style: "font-size:.8rem;", text: "No items yet." }));
      return wrap;
    }
    phase.items.forEach(function (item) {
      var gridFields = [
        itemField(item, "sets", "Sets", readOnly),
        itemField(item, "reps", "Reps/Time", readOnly),
        itemField(item, "duration", "Duration", readOnly),
        itemField(item, "rest", "Rest", readOnly)
      ];
      if (item.type === "exercise") gridFields.push(machineField(item, readOnly));
      var actions = el("div", { style: "display:flex;align-items:center;gap:6px;" });
      if (item.type === "exercise") {
        if (EX.some(function (e) { return e.id === item.ref; })) {
          actions.appendChild(el("button", { class: "btn-icon", html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', title: "Preview workout guide", "aria-label": "Preview " + item.label, onclick: function () { openExerciseModal(item.ref); } }));
        }
      } else if (item.type === "drill") {
        if ((DOC.drills || []).some(function (d) { return d.id === item.ref; })) {
          actions.appendChild(el("button", { class: "btn-icon", html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', title: "Preview drill guide", "aria-label": "Preview " + item.label, onclick: function () { openDrillModal(item.ref); } }));
        }
      }
      if (!readOnly) {
        actions.appendChild(el("button", { class: "btn-icon", text: "x", title: "Remove", "aria-label": "Remove " + item.label, onclick: function () {
          phase.items = phase.items.filter(function (i) { return i.id !== item.id; });
          renderSessionEditor();
        } }));
      }
      var block = el("div", { class: "phase-item" }, [
        el("div", { class: "phase-item-row" }, [
          el("p", { class: "phase-item-name", text: item.label }),
          actions
        ]),
        el("div", { class: "phase-item-grid" }, gridFields)
      ]);
      wrap.appendChild(block);
    });
    return wrap;
  }

  function phaseAdder(key, readOnly) {
    if (readOnly) return el("div", {});
    var wrap = el("div", { class: "phase-add", style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center;" });
    var select = el("select", { class: "select", style: "flex:1;min-width:180px;" });
    select.appendChild(el("option", { value: "", text: "Choose an exercise or drill..." }));
    (DOC.drills || []).forEach(function (d) {
      select.appendChild(el("option", { value: "drill:" + d.id, text: "[Drill] " + d.name }));
    });
    EX.forEach(function (e) {
      select.appendChild(el("option", { value: "exercise:" + e.id, text: e.name + " (" + componentLabel(e.component) + ")" }));
    });
    var btn = el("button", { class: "btn btn-ghost btn-sm", text: "Add", onclick: function () {
      var v = select.value;
      if (!v) { toast("Pick an exercise or drill"); return; }
      if (v.indexOf("drill:") === 0) {
        var d = (DOC.drills || []).find(function (x) { return x.id === v.split(":")[1]; });
        if (d) addItemToPhase(STATE.session, key, newItemFromDrill(d.id, key));
      } else {
        var ex = EX.find(function (x) { return "exercise:" + x.id === v; });
        if (ex) addItemToPhase(STATE.session, key, newItemFromExercise(ex));
      }
      renderSessionEditor();
    } });
    var previewBtn = el("button", { class: "btn btn-ghost btn-sm", text: "Preview", onclick: function () {
      var v = select.value;
      if (!v) { toast("Pick an exercise or drill"); return; }
      if (v.indexOf("drill:") === 0) { openDrillModal(v.split(":")[1]); }
      else {
        var ex = EX.find(function (x) { return "exercise:" + x.id === v; });
        if (ex) openExerciseModal(ex.id);
      }
    } });
    wrap.appendChild(select);
    wrap.appendChild(previewBtn);
    wrap.appendChild(btn);
    return wrap;
  }

  function renderSessionEditor() {
    var editor = $("#session-editor");
    if (!STATE.session) { editor.classList.add("hidden"); return; }
    editor.classList.remove("hidden");
    var s = STATE.session;
    var readOnly = STATE.sessionReadOnly || isPreset(s);
    $("#session-name").value = s.name;
    $("#session-duration").value = s.duration;
    $("#session-focus").value = s.focus;
    $("#session-rpe").value = s.rpe;
    s.format = s.format || "session";
    s.circuit = s.circuit || { rounds: 3, work: "45 sec", rest: "30 sec" };
    $("#session-format").value = s.format;
    $("#circuit-rounds").value = s.circuit.rounds;
    $("#circuit-work").value = s.circuit.work;
    $("#circuit-rest").value = s.circuit.rest;
    $("#circuit-fields").classList.toggle("hidden", s.format !== "circuit");
    $("#session-notes").value = s.notes;
    $("#session-tags").value = sessionTags(s).join(", ");
    $("#session-safety-confirm").checked = !!s.safetyConfirmed;
    var exists = getSessions().some(function (x) { return x.id === s.id; });

    var lockBanner = $("#session-lock-banner");
    if (readOnly) {
      lockBanner.classList.remove("hidden");
      lockBanner.innerHTML = "";
      lockBanner.appendChild(el("p", { style: "margin:0;", text: "This is a locked built-in workout. View it, duplicate it to edit, or copy it to your notes." }));
    } else {
      lockBanner.classList.add("hidden");
    }

    ["session-name", "session-duration", "session-focus", "session-rpe", "session-format",
     "circuit-rounds", "circuit-work", "circuit-rest", "session-notes", "session-tags", "session-safety-confirm"]
      .forEach(function (id) { $("#" + id).disabled = readOnly; });

    if (readOnly) {
      $("#session-save").style.display = "none";
      $("#session-duplicate").style.display = "";
    } else {
      $("#session-save").style.display = "";
      $("#session-duplicate").style.display = "none";
      $("#session-save").textContent = exists ? "Update Session" : "Save Session";
    }

    var host = $("#session-structure");
    host.innerHTML = "";
    PHASE_ORDER.forEach(function (key) {
      var phase = s.phases[key] || { name: PHASE_LABEL[key], items: [] };
      if (!s.phases[key]) s.phases[key] = phase;
      var card = el("div", { class: "card", style: "padding:14px;margin-bottom:12px;" }, [
        el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;" }, [
          el("h4", { class: "phase-item-name", text: phase.name }),
          el("span", { class: "tags", text: key === "activity" ? "core of session" : (key === "prep" ? "dynamic warm-up" : "cool-down") })
        ]),
        renderPhaseItems(phase, readOnly),
        el("div", { style: "margin-top:10px;" }, [phaseAdder(key, readOnly)])
      ]);
      host.appendChild(card);
    });
  }

  function renderSessionsList() {
    var all = filteredSessions();
    var host = $("#sessions-list");
    host.innerHTML = "";
    $("#sessions-empty").classList.toggle("hidden", all.length > 0);
    renderGroupFilter("#session-group-filter", renderBuilder);
    all.forEach(function (s) {
      var count = 0;
      PHASE_ORDER.forEach(function (k) { if (s.phases[k]) count += s.phases[k].items.length; });
      var tags = sessionTags(s);
      var sub = s.duration + " min | RPE " + s.rpe + " | " + componentLabel(s.focus) + " | " + count + " items";
      var titleEl = [el("span", { text: s.name }), isPreset(s) ? el("span", { class: "tags tag-preset", text: "Preset" }) : null].filter(Boolean);
      if (tags.length) titleEl = titleEl.concat(tags.slice(0, 3).map(function (t) { return el("span", { class: "tags", text: t }); }));
      host.appendChild(rowEl(
        el("span", { text: "S", style: "font-family:var(--font-display);font-size:1.2rem;" }),
        titleEl,
        sub,
        sessionActions(s, false)
      ));
    });
  }

  function renderGroupFilter(sel, onSelect) {
    var host = $(sel);
    if (!host) return;
    host.innerHTML = "";
    var groups = getGroups();
    var allChip = el("button", { class: "chip" + (STATE.groupFilter ? "" : " active"), "aria-pressed": String(!STATE.groupFilter), text: "All sessions", onclick: function () { STATE.groupFilter = null; onSelect(); } });
    host.appendChild(allChip);
    groups.forEach(function (g) {
      var chip = el("button", {
        class: "chip" + (STATE.groupFilter === g.id ? " active" : ""),
        "aria-pressed": String(STATE.groupFilter === g.id),
        text: g.name,
        onclick: function () { STATE.groupFilter = g.id; onSelect(); }
      });
      host.appendChild(chip);
    });
    if (!groups.length) {
      host.appendChild(el("button", { class: "chip", text: "+ Manage Groups", onclick: function () { openGroupsModal(); } }));
    }
  }

  function renderBuilder() {
    fillFocusSelect();
    fillRpeSelect();
    fillPeriodSelect();
    renderSessionEditor();
    renderSessionsList();
    renderRegimentEditor();
    renderRegimentsList();
  }

  /* ==================== REGIMENTS ==================== */

  function blankRegiment() {
    var periods = (DOC.programming && DOC.programming.periods || []);
    return {
      id: uid(),
      name: "",
      period: periods.length ? periods[0].name : "Base",
      days: [
        { name: "Mon", sessions: [] },
        { name: "Tue", sessions: [] },
        { name: "Wed", sessions: [] },
        { name: "Thu", sessions: [] },
        { name: "Fri", sessions: [] }
      ]
    };
  }

  function renderRegimentEditor() {
    var editor = $("#regiment-editor");
    if (!STATE.regiment) { editor.classList.add("hidden"); return; }
    editor.classList.remove("hidden");
    var r = STATE.regiment;
    $("#regiment-name").value = r.name;
    $("#regiment-period").value = r.period;

    var host = $("#regiment-schedule");
    host.innerHTML = "";
    var saved = getSessions();
    if (!saved.length) {
      host.appendChild(el("p", { class: "card-muted", text: "Save some sessions first, then assign them to days." }));
      return;
    }
    r.days.forEach(function (day) {
      var chips = el("div", { class: "chip-row" });
      saved.forEach(function (s) {
        var active = day.sessions.indexOf(s.id) !== -1;
        var chip = el("button", {
          class: "chip" + (active ? " active" : ""),
          "aria-pressed": String(active),
          text: s.name,
          onclick: function () {
            var i = day.sessions.indexOf(s.id);
            if (i === -1) day.sessions.push(s.id); else day.sessions.splice(i, 1);
            renderRegimentEditor();
          }
        });
        chips.appendChild(chip);
      });
      host.appendChild(el("div", { class: "regiment-day" }, [
        el("div", { class: "regiment-day-head" }, [
          el("h4", { class: "phase-item-name", style: "margin:0;font-size:.85rem;", text: day.name }),
          el("span", { class: "tags", text: day.sessions.length + " sessions" })
        ]),
        chips
      ]));
    });
  }

  function renderRegimentsList() {
    var all = getRegiments();
    var host = $("#regiments-list");
    host.innerHTML = "";
    $("#regiments-empty").classList.toggle("hidden", all.length > 0);
    all.forEach(function (r) {
      var days = r.days.filter(function (d) { return d.sessions.length; });
      var sub = days.length ? days.map(function (d) { return d.name + ": " + d.sessions.length + " sessions"; }).join("  |  ") : "No sessions assigned";
      var card = el("div", { class: "card card-accent" }, [
        el("div", { class: "tag-row", style: "margin-bottom:8px;" }, [tag(r.period)]),
        el("h3", { class: "card-title", text: r.name }),
        el("p", { class: "card-muted", style: "font-size:.82rem;", text: sub }),
        el("div", { class: "exercise-card-actions" }, [
          el("button", { class: "btn btn-ghost btn-sm", text: "Edit", onclick: function () { STATE.regiment = r; renderBuilder(); } }),
          el("button", { class: "btn btn-gold btn-sm", text: "Copy", onclick: function () { openCopyModal(regimentPlainText(r)); } }),
          el("button", { class: "btn btn-danger btn-sm", text: "x", title: "Delete", onclick: function () {
            saveRegiments(getRegiments().filter(function (x) { return x.id !== r.id; }));
            renderBuilder();
          } })
        ])
      ]);
      host.appendChild(card);
    });
  }

  /* ==================== TRACKER ==================== */

  function formatStopwatchTime(milliseconds) {
    var tenths = Math.floor(milliseconds / 100);
    var minutes = Math.floor(tenths / 600);
    var seconds = Math.floor(tenths / 10) % 60;
    return (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds + "." + (tenths % 10);
  }

  function stopwatchElapsed() {
    return STOPWATCH.running ? STOPWATCH.elapsed + performance.now() - STOPWATCH.startedAt : STOPWATCH.elapsed;
  }

  function renderStopwatchTime() {
    var display = formatStopwatchTime(stopwatchElapsed());
    var displayEl = $("#stopwatch-display");
    displayEl.textContent = display;
    displayEl.setAttribute("aria-label", "Elapsed time " + display);
  }

  function renderStopwatch() {
    var startButton = $("#stopwatch-start");
    var lapButton = $("#stopwatch-lap");
    var status = $("#stopwatch-status");
    var lapList = $("#stopwatch-lap-list");
    renderStopwatchTime();
    startButton.textContent = STOPWATCH.running ? "Pause" : "Start";
    startButton.setAttribute("aria-pressed", String(STOPWATCH.running));
    lapButton.disabled = !STOPWATCH.running;
    status.textContent = STOPWATCH.running ? "Stopwatch running." : STOPWATCH.elapsed ? "Stopwatch paused." : "Stopwatch stopped.";
    lapList.textContent = "";
    STOPWATCH.laps.forEach(function (lap, index) {
      lapList.appendChild(el("li", { text: "Lap " + (index + 1) + ": " + formatStopwatchTime(lap) }));
    });
  }

  function updateStopwatch() {
    renderStopwatchTime();
    if (STOPWATCH.running) STOPWATCH.frame = requestAnimationFrame(updateStopwatch);
  }

  function startStopwatch() {
    if (STOPWATCH.running) {
      STOPWATCH.elapsed = stopwatchElapsed();
      STOPWATCH.running = false;
      cancelAnimationFrame(STOPWATCH.frame);
      STOPWATCH.frame = null;
      renderStopwatch();
      return;
    }
    STOPWATCH.startedAt = performance.now();
    STOPWATCH.running = true;
    STOPWATCH.frame = requestAnimationFrame(updateStopwatch);
    if (WLOCK) WLOCK.request(); /* keep the screen awake while the work runs */
    renderStopwatch();
  }

  function lapStopwatch() {
    if (!STOPWATCH.running) return;
    STOPWATCH.laps.push(stopwatchElapsed());
    renderStopwatch();
  }

  function resetStopwatch() {
    STOPWATCH.elapsed = 0;
    STOPWATCH.startedAt = 0;
    STOPWATCH.running = false;
    STOPWATCH.laps = [];
    if (STOPWATCH.frame !== null) cancelAnimationFrame(STOPWATCH.frame);
    STOPWATCH.frame = null;
    if (WLOCK) WLOCK.release();
    renderStopwatch();
  }

  function getLogs() {
    var v = load(KEYS.logs, null);
    if (typeof v !== "object" || v === null) v = {};
    if (TS_OK && TS.needsMigration && TS.needsMigration(v)) {
      /* Explicit v1 -> v2 migration, preserving existing workout history. */
      v = TS.migrateToV2(v);
    }
    Object.keys(v).forEach(function (date) {
      if (date === "schemaVersion") return;
      if (typeof v[date] !== "object" || v[date] === null || typeof v[date].sessions !== "object") {
        v[date] = { sessions: {} };
      }
    });
    return v;
  }
  function saveLogs(logs) {
    if (logs && typeof logs === "object") logs.schemaVersion = TRACKER_SCHEMA;
    store(KEYS.logs, logs);
  }
  function snapshotSession(session) { return JSON.parse(JSON.stringify(session)); }
  function ensureLogEntry(date, session) {
    var logs = getLogs();
    if (typeof logs[date] !== "object" || logs[date] === null) logs[date] = { sessions: {} };
    if (!logs[date].sessions) logs[date].sessions = {};
    if (!logs[date].sessions[session.id]) {
      if (TS_OK) {
        logs[date].sessions[session.id] = TS.newEntry(snapshotSession(session));
      } else {
        logs[date].sessions[session.id] = { schema: 2, complete: false, startedAt: null, completedAt: null, rpeActual: "", durationActual: "", notes: "", snapshot: snapshotSession(session), results: {} };
      }
    }
    return { logs: logs, entry: logs[date].sessions[session.id] };
  }

  var TIMER_STATE_PREFIX = "br_timer_state:";

  /* Durable active-session recovery: remember which session the tracker was
   * open on (and for which date) so a reload drops you back where you left off.
   * No backend or analytics — just a small browser-local record. */
  function loadTrackerActive() { return load(KEYS.trackerActive, null); }
  function saveTrackerActive() {
    var sel = $("#track-session");
    if (!sel || !sel.value) return;
    store(KEYS.trackerActive, { sessionId: sel.value, date: ($("#track-date").value || STATE.date) });
  }

  function renderTracker() {
    var dateInput = $("#track-date");
    var savedActive = loadTrackerActive();
    if (savedActive && savedActive.date) { dateInput.value = savedActive.date; STATE.date = savedActive.date; }
    else if (!dateInput.value) dateInput.value = STATE.date;
    var sel = $("#track-session");
    var sessions = getSessions();
    sel.innerHTML = "";
    var presets = window.BR_PRESET_WORKOUTS || [];
    function isPreset(sid) { return presets.some(function (p) { return p.id === sid; }); }
    var groupPresets = sessions.filter(function (s) { return isPreset(s.id); });
    var groupCustom = sessions.filter(function (s) { return !isPreset(s.id); });
    function appendGroup(label, list) {
      if (!list.length) return;
      var grp = el("optgroup", { label: label });
      list.forEach(function (s) { grp.appendChild(el("option", { value: s.id, text: s.name })); });
      sel.appendChild(grp);
    }
    appendGroup("Built-in workouts", groupPresets);
    appendGroup("Your sessions", groupCustom);
    /* Restore the previously selected active session, falling back to the first option. */
    if (savedActive && savedActive.sessionId && sessions.some(function (x) { return x.id === savedActive.sessionId; })) {
      sel.value = savedActive.sessionId;
    }
    if (!sessions.length) {
      sel.appendChild(el("option", { value: "", text: "No sessions yet" }));
      $("#tracker-active").innerHTML = '<div class="empty-state"><p>Build a session first, then track it here.</p></div>';
      renderTrackerLog();
      return;
    }
    renderTrackerActive();
    renderTrackerLog();
  }

  function renderTrackerActive() {
    var host = $("#tracker-active");
    var sel = $("#track-session");
    var s = getSessions().find(function (x) { return x.id === sel.value; });
    if (!s) { host.innerHTML = ""; return; }
    var date = $("#track-date").value || STATE.date;
    var logs = getLogs();
    var entry = logs[date] && logs[date].sessions && logs[date].sessions[s.id] || (TS_OK && TS.newEntry ? TS.newEntry(snapshotSession(s)) : { schema: 2, complete: false, results: {} });

    /* Tear down any live workout timers before we wipe the container; each
     * widget clears its own interval so nothing keeps ticking detached DOM. */
    activeTimers.forEach(function (t) { if (t && typeof t.destroy === "function") t.destroy(); });
    activeTimers = [];

    host.innerHTML = "";
    var header = el("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;" }, [
      el("div", {}, [
        el("h3", { class: "card-title", text: s.name }),
        el("p", { class: "card-muted", style: "margin:0;font-size:.8rem;", text: s.duration + " min | RPE " + s.rpe + " | " + componentLabel(s.focus) + (TS_OK && TS.entrySummary(entry) ? " | " + TS.entrySummary(entry) : "") })
      ]),
      el("button", {
        class: "btn " + (entry.complete ? "btn-gold" : "btn-ghost") + " btn-sm",
        text: entry.complete ? "Completed" : "Mark Complete",
        onclick: function () {
          var saved = ensureLogEntry(date, s);
          saved.entry.complete = !saved.entry.complete;
          if (saved.entry.complete) {
            saved.entry.completedAt = new Date().toISOString();
            if (!saved.entry.startedAt) saved.entry.startedAt = new Date().toISOString();
          }
          saveLogs(saved.logs);
          renderTrackerActive();
          renderTrackerLog();
        }
      })
    ]);
    host.appendChild(header);
    var totals = sessionTotals(entry);
    if (totals.sets || totals.reps || totals.volume) {
      host.appendChild(el("div", { class: "tracker-live-summary", style: "display:flex;gap:14px;flex-wrap:wrap;font-size:.8rem;color:var(--gold);margin:2px 0 12px;" }, [
        el("span", { text: totals.sets + " sets" }),
        el("span", { text: totals.reps + " reps" }),
        totals.volume ? el("span", { text: "volume " + totals.volume }) : null
      ]));
    }
    if (s.notes) host.appendChild(el("p", { class: "card-muted", style: "font-size:.82rem;margin:0 0 12px;", text: s.notes }));

    /* ---- session-level result logging (actual RPE, elapsed time, notes) ---- */
    host.appendChild(buildSessionResultForm(entry, date, s));

    var progressTotal = 0, progressDone = 0;
    PHASE_ORDER.forEach(function (key) {
      var phase = s.phases[key];
      if (!phase || !phase.items.length) return;
      host.appendChild(el("h4", { style: "font-family:var(--font-display);text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;color:var(--gold);margin:14px 0 8px;", text: phase.name }));
      phase.items.forEach(function (item) {
        progressTotal++;
        var res = entry.results && entry.results[item.id];
        var done = !!(res && res.done);
        if (done) progressDone++;
        var row = el("div", { class: "list-item tracker-item" + (done ? " done" : "") });
        var toggle = el("button", { class: "tracker-toggle", type: "button", "aria-pressed": String(done), "aria-label": "Mark " + esc(item.label) + " " + (done ? "incomplete" : "complete") }, [
          el("span", { style: "font-size:1.05rem;text-align:center;color:" + (done ? "var(--ok)" : "var(--text-muted)") + ";", text: done ? "\u2713" : "\u25CB" })
        ]);
        toggle.addEventListener("click", function () {
          var saved = ensureLogEntry(date, s);
          var r = saved.entry.results[item.id];
          if (!r) { r = saved.entry.results[item.id] = TS_OK ? TS.newResult(item) : { done: false, actual: null }; }
          r.done = !r.done;
          if (!saved.entry.startedAt) saved.entry.startedAt = new Date().toISOString();
          saveLogs(saved.logs);
          renderTrackerActive();
        });
        row.appendChild(toggle);
        var actualTxt = TS_OK && res ? TS.actualSummary(res) : "";
        row.appendChild(el("div", { class: "content" }, [
          el("h4", { style: "margin:0;", text: item.label }),
          el("p", { class: "card-muted", style: "margin:0;font-size:.76rem;", text: itemText(item) || " " }),
          actualTxt ? el("p", { class: "tracker-actual", text: "Actual: " + actualTxt }) : null
        ]));
        var form = buildResultForm(item, res, date, s);
        row.appendChild(form);
        var logBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: TS_OK && res && TS.actualSummary(res) ? "Edit" : "Log" });
        logBtn.addEventListener("click", function () {
          form.classList.toggle("hidden");
          logBtn.textContent = form.classList.contains("hidden") ? (TS_OK && res && TS.actualSummary(res) ? "Edit" : "Log") : "Hide";
        });
        row.appendChild(el("div", { class: "actions", style: "display:flex;gap:6px;align-items:center;" }, [logBtn]));
        buildItemTimers(item, row, s);
        host.appendChild(row);
      });
    });

    var pct = progressTotal ? Math.round((progressDone / progressTotal) * 100) : 0;
    host.appendChild(el("div", { style: "margin-top:16px;" }, [
      el("div", { style: "display:flex;justify-content:space-between;font-size:.76rem;color:var(--text-muted);margin-bottom:6px;" }, [
        el("span", { text: progressDone + "/" + progressTotal + " completed" }),
        el("span", { text: pct + "%" })
      ]),
      el("div", { class: "progress", role: "progressbar", "aria-label": "Session completion", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, [el("div", { class: "progress-bar", style: "width:" + pct + "%;" })]),
      el("div", { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;" }, [
        el("button", { class: "btn btn-ghost btn-sm", text: "Copy to Notes", onclick: function () { openCopyModal(trackedSessionPlainText(s, date, ensureLogEntry(date, s).entry)); } })
      ])
    ]));
  }

  /* Attach bounded guided-workout timers to a tracker item when the plan
   * declares a rest period and/or a timed set (a duration). Parsing + clamping
   * live in the pure BRTimerCore module; an unparseable or 0 value adds no
   * widget. Each instance is tracked so re-render tears it down cleanly. */
  function buildItemTimers(item, row, session) {
    if (!TIMER_CORE || !TIMER_CREATE) return;
    var restSec = TIMER_CORE.fromDurationStr(item.rest);
    var timedSec = TIMER_CORE.fromDurationStr(item.duration);
    if (!restSec && !timedSec) return;
    /* A stable per-workout/per-item storage key lets a running or paused timer
     * self-recover across reloads (durable active-session recovery). */
    var base = session ? TIMER_STATE_PREFIX + session.id + ":" + item.id + ":" : null;
    var box = el("div", { class: "tracker-timers" });
    if (restSec) {
      var restTimer = TIMER_CREATE({ mount: box, variant: "rest", label: "Rest", seconds: restSec, storageKey: base ? base + "rest" : null });
      if (restTimer) activeTimers.push(restTimer);
    }
    if (timedSec) {
      var setTimer = TIMER_CREATE({ mount: box, variant: "set", label: "Timed set", seconds: timedSec, storageKey: base ? base + "set" : null });
      if (setTimer) activeTimers.push(setTimer);
    }
    if (box.childNodes.length) row.appendChild(box);
  }

  /* Live aggregate of the session's logged items: sets / reps / volume. */
  function sessionTotals(entry) {
    var t = { sets: 0, reps: 0, volume: 0 };
    var results = (entry && entry.results) || {};
    Object.keys(results).forEach(function (id) {
      var r = results[id];
      if (!r || r.done !== true) return;
      var a = r.actual || {};
      if (Array.isArray(a.sets) && a.sets.length) {
        a.sets.forEach(function (x) {
          if (x && x.warmup) { t.sets += 1; return; } /* count the set, drop it from reps/volume */
          var w = Number(x && x.weight) || 0;
          var rp = Number(x && x.reps) || 0;
          if (w > 0) t.volume += w * rp;
          t.reps += rp;
        });
        t.sets += a.sets.length;
      } else {
        var w = Number(a.weight) || 0;
        var rp = Number(a.reps) || 0;
        if (rp) t.sets += 1;
        t.reps += rp;
        if (w > 0) t.volume += w * rp;
      }
    });
    return t;
  }

  function buildSessionResultForm(entry, date, s) {
    var box = el("div", { class: "session-result-form" });
    var grid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;" });
    var fieldBox = function (label, input) {
      return el("label", { class: "field", style: "margin:0;" }, [el("span", { class: "field-label", text: label }), input]);
    };
    function textInput(val, ph) { return el("input", { class: "input", type: "text", value: val || "", placeholder: ph || "" }); }
    var rpeIn = textInput(entry.rpeActual, "e.g. 8");
    var durIn = textInput(entry.durationActual, "e.g. 42 min");
    var notesIn = textInput(entry.notes, "How did it feel?");
    grid.appendChild(fieldBox("Actual RPE", rpeIn));
    grid.appendChild(fieldBox("Elapsed time", durIn));
    grid.appendChild(fieldBox("Session notes", notesIn));
    box.appendChild(grid);
    var save = el("button", { class: "btn btn-gold btn-sm", type: "button", text: "Save session" });
    save.addEventListener("click", function () {
      var saved = ensureLogEntry(date, s);
      saved.entry.rpeActual = rpeIn.value.trim();
      saved.entry.durationActual = durIn.value.trim();
      saved.entry.notes = notesIn.value.trim();
      if (!saved.entry.startedAt) saved.entry.startedAt = new Date().toISOString();
      saveLogs(saved.logs);
      toast("Session results saved");
      renderTrackerActive();
    });
    box.appendChild(el("div", { style: "display:flex;justify-content:flex-end;margin-top:8px;" }, [save]));
    return box;
  }

  /* Suggested working weight/reps for an empty strength result form, derived
   from the automatic progression engine (last logged session + rule). */
  function suggestedStrengthSet(itemId) {
    if (!ADAPT || !PROG || !SET_H) return null;
    var workouts = ADAPT.workoutsFromLogs(getLogs());
    var lastE = null;
    for (var i = workouts.length - 1; i >= 0; i--) {
      var en = ((workouts[i] || {}).entries || []).filter(function (e) { return e.id === itemId; })[0];
      if (en && (en.sets || []).some(function (s) { return s.done; })) { lastE = en; break; }
    }
    if (!lastE) return null;
    var done = (lastE.sets || []).filter(function (s) { return s.done && !SET_H.isWarmupRow(s); });
    if (!done.length) return null;
    if (done.some(function (s) { return (s.sec || 0) > 0; })) return null; /* timed work: no weight prefill */
    var w = done.reduce(function (m, s) { return Math.max(m, Number(s.w) || 0); }, 0);
    if (!w) return null; /* bodyweight work progresses in reps, not load */
    var r = done.reduce(function (m, s) { return Math.max(m, Number(s.r) || 0); }, 0);
    var p = PROG.nextPrescription(workouts, { id: itemId, mode: "reps", prog: "linear", sets: done.length, reps: r, weight: w, inc: 5 }, {});
    if (!p || p.kind === "off" || p.kind === "hold") return null;
    return { weight: p.weight || w, reps: p.reps || r };
  }

  function buildResultForm(item, res, date, s) {
    var kind = TS_OK ? TS.resultKind(item) : "generic";
    var a = (res && res.actual) || {};
    var form = el("div", { class: "log-form hidden" });
    var inputs = {};
    var fieldBox = function (label, input) {
      return el("label", { style: "font-size:.72rem;color:var(--text-muted);display:flex;flex-direction:column;gap:3px;margin:0;" }, [el("span", { text: label }), input]);
    };
    function textInput(val, ph) { return el("input", { class: "input", type: "text", value: val || "", placeholder: ph || "" }); }

    var rowsHost, rows = [];
    function renderRows() {
      rowsHost.innerHTML = "";
      rows.forEach(function (row) {
        var wIn = textInput(row.weight, "Weight");
        var rIn = textInput(row.reps, "Reps");
        wIn.addEventListener("input", function () { row.weight = wIn.value; });
        rIn.addEventListener("input", function () { row.reps = rIn.value; });
        var warm = el("label", { style: "font-size:.72rem;color:var(--text-muted);display:flex;align-items:center;gap:5px;" }, [
          el("input", { type: "checkbox", checked: !!row.warmup }),
          el("span", { text: "Warm-up" })
        ]);
        warm.querySelector("input").addEventListener("change", function () { row.warmup = warm.querySelector("input").checked; });
        var remove = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "\u00d7" });
        remove.addEventListener("click", function () { rows.splice(rows.indexOf(row), 1); renderRows(); });
        rowsHost.appendChild(el("div", { style: "display:flex;gap:8px;align-items:end;flex-wrap:wrap;" }, [fieldBox("Weight", wIn), fieldBox("Reps", rIn), warm, remove]));
      });
      var add = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "+ Set" });
      add.addEventListener("click", function () { rows.push({ weight: "", reps: "", warmup: false }); renderRows(); });
      rowsHost.appendChild(el("div", { style: "margin-top:6px;" }, [add]));
    }

    if (kind === "strength") {
      if (Array.isArray(a.sets) && a.sets.length) {
        rows = a.sets.map(function (x) { return { weight: String(x ? (x.weight || "") : ""), reps: String(x ? (x.reps || "") : ""), warmup: !!(x && x.warmup) }; });
      } else {
        var sug = (a.weight || a.reps) ? null : suggestedStrengthSet(item.id);
        if (sug) {
          var n = Math.max(1, Number(item.sets) || 1);
          rows = [];
          for (var k = 0; k < n; k++) rows.push({ weight: String(sug.weight), reps: String(sug.reps), warmup: false });
        } else {
          rows = [{ weight: a.weight || "", reps: a.reps || "", warmup: false }];
        }
      }
      rowsHost = el("div", {});
      form.appendChild(rowsHost);
      renderRows();
    } else if (kind === "timed") {
      inputs.duration = textInput(a.duration, "e.g. 30 sec");
      inputs.distance = textInput(a.distance, "e.g. 400m");
      form.appendChild(el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;" }, [
        fieldBox("Actual duration", inputs.duration),
        fieldBox("Distance / result", inputs.distance)
      ]));
    } else {
      inputs.notesFree = textInput(a.notes, "e.g. 3 rounds, full depth");
      form.appendChild(el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;" }, [fieldBox("Actual result", inputs.notesFree)]));
    }

    inputs.rpe = textInput(a.rpe, "e.g. 8");
    inputs.rir = textInput(a.rir, "e.g. -1r");
    form.appendChild(el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:8px;" }, [
      fieldBox("RPE (optional)", inputs.rpe),
      fieldBox("RIR (optional)", inputs.rir)
    ]));

    var save = el("button", { class: "btn btn-gold btn-sm", type: "button", text: "Save result" });
    save.addEventListener("click", function () {
      var saved = ensureLogEntry(date, s);
      var r = saved.entry.results[item.id];
      if (!r) { r = saved.entry.results[item.id] = TS_OK ? TS.newResult(item) : { done: false, actual: {} }; }
      var act = r.actual || (r.actual = {});
      if (kind === "strength") {
        var out = rows.filter(function (row) { return String(row.weight || "").trim() || String(row.reps || "").trim(); })
          .map(function (row) { return { weight: String(row.weight || "").trim(), reps: String(row.reps || "").trim(), warmup: !!row.warmup }; });
        act.sets = out;
        var first = out.find(function (x) { return !x.warmup; }) || out[0];
        if (first) { act.weight = first.weight; act.reps = first.reps; }
        else { act.weight = ""; act.reps = ""; }
      } else {
        if (inputs.duration) act.duration = inputs.duration.value.trim();
        if (inputs.distance) act.distance = inputs.distance.value.trim();
        if (inputs.notesFree) act.notes = inputs.notesFree.value.trim();
      }
      if (inputs.rpe) act.rpe = inputs.rpe.value.trim();
      if (inputs.rir) act.rir = inputs.rir.value.trim();
      r.done = true;
      if (!saved.entry.startedAt) saved.entry.startedAt = new Date().toISOString();
      saveLogs(saved.logs);
      toast("Saved result for " + item.label);
      renderTrackerActive();
    });
    var clearBtn = el("button", { class: "btn btn-danger btn-sm", type: "button", text: "Clear" });
    clearBtn.addEventListener("click", function () {
      var saved = ensureLogEntry(date, s);
      saved.entry.results[item.id] = TS_OK ? TS.newResult(item) : { done: false, actual: {} };
      saveLogs(saved.logs);
      toast("Cleared result for " + item.label);
      renderTrackerActive();
    });
    form.appendChild(el("div", { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:12px;" }, [clearBtn, save]));
    return form;
  }

  function renderTrackerLog() {
    var logs = getLogs();
    var host = $("#tracker-log");
    host.innerHTML = "";
    var sessions = getSessions();
    var entries = [];
    Object.keys(logs).sort().reverse().forEach(function (date) {
      Object.keys(logs[date].sessions || {}).forEach(function (sid) {
        var e = logs[date].sessions[sid];
        var s = e && e.snapshot || sessions.find(function (x) { return x.id === sid; });
        if (!s || !e || e === true || !e.complete) return;
        entries.push({ date: date, s: s, e: e });
      });
    });
    $("#tracker-empty").classList.toggle("hidden", entries.length > 0);
    entries.forEach(function (en) {
      var doneCount = 0, total = 0;
      PHASE_ORDER.forEach(function (k) { var p = en.s.phases[k]; if (p) { total += p.items.length; p.items.forEach(function (i) { var r = en.e.results && en.e.results[i.id]; if (r && r.done) doneCount++; }); } });
      var pct = total ? Math.round((doneCount / total) * 100) : 0;
      host.appendChild(rowEl(
        el("span", { text: en.e.complete ? "\u2713" : String(pct) + "%", style: "font-family:var(--font-display);font-size:1rem;" }),
        en.s.name,
        fmtDate(en.date) + " | " + doneCount + "/" + total + " items" + (en.e.complete ? " | complete" : ""),
        [
          el("button", { class: "btn btn-ghost btn-sm", text: "Copy", onclick: function () { openCopyModal(trackedSessionPlainText(en.s, en.date, en.e)); } }),
          el("button", { class: "btn btn-danger btn-sm", text: "x", title: "Delete", onclick: function () {
            var l = getLogs();
            if (l[en.date]) delete l[en.date].sessions[en.s.id];
            saveLogs(l);
            renderTracker();
          } })
        ]
      ));
    });
  }

  /* ==================== DOCTRINE ==================== */

  function resetAftResultForm() {
    $("#aft-result-id").value = "";
    $("#aft-result-date").value = todayStr();
    $("#aft-result-value").value = "";
    $("#aft-result-note").value = "";
    var event = $("#aft-result-event").value;
    $("#aft-result-unit").value = AFT_RESULTS.defaultUnit(event);
  }

  function renderAftResults() {
    if (!AFT_RESULTS) return;
    var eventSelect = $("#aft-result-event");
    var selected = eventSelect.value;
    eventSelect.innerHTML = "";
    AFT_RESULTS.EVENTS.forEach(function (event) {
      eventSelect.appendChild(el("option", { value: event.code, text: event.code + " — " + event.name }));
    });
    if (selected && AFT_RESULTS.eventFor(selected)) eventSelect.value = selected;
    if (!$("#aft-result-date").value) resetAftResultForm();

    var rows = AFT_RESULTS.sortByDate(getAftResults());
    $("#aft-results-summary").textContent = rows.length
      ? rows.length + " personal result" + (rows.length === 1 ? "" : "s") + " recorded."
      : "No personal AFT results recorded yet.";
    var list = $("#aft-results-list");
    list.innerHTML = "";
    rows.forEach(function (record) {
      var event = AFT_RESULTS.eventFor(record.event);
      list.appendChild(el("div", { class: "exercise-card" }, [
        el("div", { class: "exercise-card-main" }, [
          el("h3", { class: "card-title", text: record.event + " — " + (event ? event.name : record.event) }),
          el("p", { class: "card-muted", text: fmtDate(record.date) + " · " + record.value + (record.unit ? " " + record.unit : "") }),
          record.note ? el("p", { class: "card-muted", style: "margin-top:4px;", text: record.note }) : null
        ]),
        el("div", { class: "exercise-card-actions" }, [
          el("button", { class: "btn btn-ghost btn-sm", text: "Edit", onclick: function () {
            $("#aft-result-id").value = record.id;
            $("#aft-result-event").value = record.event;
            $("#aft-result-date").value = record.date;
            $("#aft-result-value").value = record.value;
            $("#aft-result-unit").value = record.unit || "";
            $("#aft-result-note").value = record.note || "";
            $("#aft-result-value").focus();
          } }),
          el("button", { class: "btn btn-danger btn-sm", text: "Delete", onclick: function () {
            saveAftResults(AFT_RESULTS.remove(getAftResults(), record.id));
            renderAftResults();
          } })
        ])
      ]));
    });
  }

  function renderDoctrine() {
    if (!DOC.aft) return;
    var sum = DOC.aft.summary || {};
    $("#aft-summary").innerHTML =
      "<strong>" + esc(sum.name || "Army Fitness Test") + "</strong> - " + esc(sum.status || "") +
      "<br><br>" + esc(sum.events || "") + " | " + esc(sum.maxScore || "") +
      "<br><br>" + esc(sum.standards || "") +
      (sum.note ? "<br><br><em>" + esc(sum.note) + "</em>" : "");

    var tbody = $("#aft-table");
    tbody.innerHTML = "";
    (DOC.aft.events || []).forEach(function (e) {
      if (e.code === "cft") return;
      tbody.appendChild(el("tr", {}, [
        el("td", { html: "<strong>" + esc(e.code) + "</strong><br><span style='font-size:.78rem;color:var(--text-muted);'>" + esc(e.name) + "</span>" }),
        el("td", {}, [badge(e.component)]),
        el("td", { text: e.secondary || "-" })
      ]));
    });
    var cft = (DOC.aft.events || []).find(function (e) { return e.code === "cft"; });
    $("#cft-note").innerHTML = cft ? "<strong>" + esc(cft.name) + "</strong><br>" + esc(stripPar(cft.description)) + "<br><span style='font-size:.76rem;'>" + esc(cft.citation) + "</span>" : "";
    renderAftResults();

    var sess = $("#doctrine-session");
    sess.innerHTML = "";
    (DOC.sessionStructure || []).forEach(function (s) {
      sess.appendChild(el("li", {}, [
        el("div", { class: "timeline-label", text: s.duration }),
        el("div", { class: "timeline-title", text: s.name }),
        el("div", { class: "timeline-desc", text: stripQuotes(stripPar(s.description)) }),
        el("div", { class: "tags", style: "margin-top:6px;", text: s.citation })
      ]));
    });

    var drills = $("#doctrine-drills");
    drills.innerHTML = "";
    (DOC.drills || []).forEach(function (d) {
      drills.appendChild(el("div", { class: "card" }, [
        badge(d.component),
        el("h3", { class: "card-title", style: "margin-top:10px;", text: d.name }),
        el("p", { class: "card-muted", text: stripQuotes(stripPar(d.description)) }),
        el("p", { class: "card-muted", style: "font-size:.76rem;", text: d.exercises }),
        el("p", { class: "card-muted", style: "font-size:.72rem;", text: d.citation })
      ]));
    });

    var prog = $("#doctrine-programming");
    prog.innerHTML = "";
    var p = DOC.programming || {};

    prog.appendChild(el("h3", { class: "card-title", text: "Load & Rep Zones (FM 7-22 Table 6-4)" }));
    if (p.loadZones && p.loadZones.length) {
      var zt = el("div", { class: "table-wrap" }, [
        el("table", { class: "table" }, [
          el("thead", {}, [el("tr", {}, ["Goal", "Load", "Reps", "Sets", "Rest", "Recovery"].map(function (h) { return el("th", { text: h }); }))]),
          el("tbody", {}, p.loadZones.map(function (z) {
            return el("tr", {}, [z.goal, z.load, z.reps, z.sets, z.rest, z.recovery].map(function (c) { return el("td", { text: c }); }));
          }))
        ])
      ]);
      prog.appendChild(zt);
    }

    prog.appendChild(el("h3", { class: "card-title", style: "margin-top:22px;", text: "Heart Rate Zones (FM 7-22 Table 6-5)" }));
    var hrList = p.hrZones && (p.hrZones.zones || p.hrZones);
    if (hrList && hrList.length) {
      prog.appendChild(el("div", { class: "table-wrap" }, [
        el("table", { class: "table" }, [
          el("thead", {}, [el("tr", {}, ["Zone", "% HRmax", "Focus"].map(function (h) { return el("th", { text: h }); }))]),
          el("tbody", {}, hrList.map(function (z) {
            return el("tr", {}, [z.zone, z.range, z.label].map(function (c) { return el("td", { text: c }); }));
          }))
        ])
      ]));
      if (p.hrZones.note) prog.appendChild(el("p", { class: "card-muted", style: "font-size:.76rem;margin:6px 0 0;", text: stripPar(p.hrZones.note) + "  " + (p.hrZones.citation || "") }));
    }

    if (p.periods && p.periods.length) {
      prog.appendChild(el("h3", { class: "card-title", style: "margin-top:22px;", text: "Periodization" }));
      p.periods.forEach(function (per) {
        prog.appendChild(el("div", { style: "padding:8px 0;border-bottom:1px solid var(--border);" }, [
          el("h4", { style: "margin:0;font-family:var(--font-display);text-transform:uppercase;letter-spacing:.05em;", text: per.name }),
          el("p", { class: "card-muted", style: "margin:4px 0 0;font-size:.84rem;", text: stripQuotes(stripPar(per.text)) }),
          el("p", { class: "card-muted", style: "font-size:.72rem;margin:4px 0 0;", text: per.citation })
        ]));
      });
    }

    if (p.weeklySplit && p.weeklySplit.length) {
      prog.appendChild(el("h3", { class: "card-title", style: "margin-top:22px;", text: "Weekly Splits" }));
      p.weeklySplit.forEach(function (w) {
        prog.appendChild(el("p", { class: "card-muted", style: "font-size:.84rem;margin:6px 0;", text: w.name + ": " + stripQuotes(stripPar(w.text)) }));
      });
    }

    if (p.templates && p.templates.length) {
      prog.appendChild(el("h3", { class: "card-title", style: "margin-top:22px;", text: "Sample Session Templates" }));
      p.templates.forEach(function (t) {
        var kids = [
          el("h4", { style: "margin:0 0 4px;font-family:var(--font-display);text-transform:uppercase;letter-spacing:.05em;", text: t.title }),
          el("p", { class: "card-muted", style: "font-size:.8rem;margin:0 0 10px;", text: t.minutes + " minutes" })
        ];
        [t.preparation, t.activity, t.recovery].forEach(function (arr, ai) {
          var prefix = ai === 0 ? "Prep" : ai === 1 ? "Activity" : "Recovery";
          (arr || []).forEach(function (x) {
            kids.push(el("p", { style: "font-size:.82rem;margin:2px 0;", text: prefix + ": " + x }));
          });
        });
        prog.appendChild(el("div", { class: "card", style: "margin-bottom:12px;padding:14px;" }, kids));
      });
    }

    var strat = $("#doctrine-strategies");
    strat.innerHTML = "";
    (DOC.strategies || []).forEach(function (s) {
      strat.appendChild(el("div", { class: "card card-accent" }, [
        el("h3", { class: "card-title", text: s.name }),
        el("p", { class: "card-muted", text: stripQuotes(stripPar(s.description)) }),
        el("p", { class: "card-muted", style: "font-size:.72rem;", text: s.citation })
      ]));
    });

    var safety = $("#doctrine-safety");
    safety.innerHTML = "";
    (DOC.safety || []).forEach(function (s) {
      safety.appendChild(el("div", { style: "padding:10px 0;border-bottom:1px solid var(--border);" }, [
        el("h4", { style: "margin:0 0 4px;font-family:var(--font-display);text-transform:uppercase;letter-spacing:.04em;font-size:.92rem;", text: s.title }),
        el("p", { class: "card-muted", style: "margin:0;font-size:.84rem;", text: stripPar(s.text) }),
        el("p", { class: "card-muted", style: "font-size:.72rem;margin:4px 0 0;", text: s.citation })
      ]));
    });

    var src = $("#doctrine-sources");
    src.innerHTML = "";
    (DOC.sources || []).forEach(function (s) {
      src.appendChild(el("div", { style: "padding:8px 0;border-bottom:1px solid var(--border);" }, [
        el("a", { href: s.url, target: "_blank", rel: "noopener", style: "color:var(--gold);", text: s.title + " (" + (s.year || "n.d.") + ") " + s.publisher }),
        el("p", { class: "card-muted", style: "font-size:.76rem;margin:2px 0 0;", text: s.url })
      ]));
    });

    $("#doctrine-disclaimer").textContent = DOC.disclaimer || "";
    $("#footer-disclaimer").textContent = DOC.disclaimer || "";
  }

  /* ==================== PROGRESS (openGym-style charts) ==================== */

  function progressData() {
    if (!ONE_RM || !ADAPT || !SET_H) return { workouts: [], ids: [] };
    var logs = getLogs();
    return {
      workouts: ADAPT.workoutsFromLogs(logs),
      ids: ADAPT.exercisesWithSets(logs)
    };
  }

  function renderProgress() {
    if (!ONE_RM || !ADAPT || !SET_H || !CHART) {
      var emptyEl = $("#progress-empty");
      if (emptyEl) emptyEl.textContent = "Progress modules not loaded.";
      return;
    }
    var select = $("#progress-ex");
    var exIndex = {};
    EX.forEach(function (e) { exIndex[e.id] = e; });
    var P = progressData();
    var opts = P.ids.map(function (id) {
      var ex = exIndex[id];
      return { id: id, label: ex ? ex.name : id };
    }).sort(function (a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });

    select.innerHTML = "";
    if (!opts.length) {
      select.innerHTML = '<option value="">No logged weight sets yet</option>';
      $("#progress-chart").innerHTML = '<div class="chart-empty">Complete sets in the Tracker and they will show up here.</div>';
      $("#progress-best").textContent = "";
      $("#progress-history").innerHTML = "";
      $("#progress-empty").textContent = "No logged history yet.";
      return;
    }
    opts.forEach(function (o) { select.appendChild(el("option", { value: o.id, text: o.label })); });
    var current = STATE.progressEx;
    if (!opts.some(function (o) { return o.id === current; })) current = opts[0].id;
    select.value = current;
    renderProgressFor(current);
  }

  function renderProgressFor(exId) {
    if (!exId) return;
    var P = progressData();
    var exIndex = {};
    EX.forEach(function (e) { exIndex[e.id] = e; });
    var points = ONE_RM.e1rmSeries(P.workouts, exId);
    var best = ONE_RM.best1RM(P.workouts, exId);
    var chartEl = $("#progress-chart");
    if (!points.length) {
      chartEl.innerHTML = '<div class="chart-empty">No estimable sets (weight + reps) for this exercise yet.</div>';
    } else {
      CHART.lineChart(chartEl, { points: points, h: 170, unit: "", goal: null, ariaLabel: exId + " estimated 1RM" });
    }
    $("#progress-best").textContent = best
      ? "All-time best estimated 1RM: " + best.est + " (from " + best.w + "\u00d7" + best.r + " on " + (best.d || "") + ")."
      : "No estimated 1RM yet \u2014 log weight sets with reps in the Tracker.";
    suggestNext(P.workouts, exId);

    var tbody = $("#progress-history");
    var empty = $("#progress-empty");
    tbody.innerHTML = "";
    var rows = 0;
    P.workouts.forEach(function (w) {
      var entry = (w.entries || []).filter(function (e) { return e.id === exId; })[0];
      if (!entry) return;
      var sets = entry.sets || [];
      var volume = SET_H.workoutVolume({ entries: [entry] });
      var reps = sets.reduce(function (n, s) { return n + (Number(s.r) || 0); }, 0);
      var bestIn = ONE_RM.bestSetOf(entry);
      tbody.appendChild(el("tr", {}, [
        el("td", { text: w.d }),
        el("td", { text: String(sets.length) }),
        el("td", { text: String(reps) }),
        el("td", { text: String(volume) }),
        el("td", { text: bestIn ? String(bestIn.est) : "\u2014" })
      ]));
      rows++;
    });
    empty.textContent = rows ? "" : "No logged history for this exercise yet.";
  }

  /* ==================== INIT / EVENTS ==================== */

  function suggestNext(workouts, exId) {
    var el2 = $("#progress-next");
    if (!el2) return;
    el2.textContent = "";
    if (!PROG) return;
    var lastE = null;
    for (var i = (workouts || []).length - 1; i >= 0; i--) {
      var en = ((workouts[i] || {}).entries || []).filter(function (e) { return e.id === exId; })[0];
      if (en && (en.sets || []).some(function (s) { return s.done; })) { lastE = en; break; }
    }
    if (!lastE) return;
    var done = (lastE.sets || []).filter(function (s) { return s.done && !SET_H.isWarmupRow(s); });
    if (!done.length) return;
    var timed = done.some(function (s) { return (s.sec || 0) > 0; });
    var w = done.reduce(function (m, s) { return Math.max(m, Number(s.w) || 0); }, 0);
    var cfg = timed
      ? { id: exId, mode: "time", prog: "time", sets: done.length, weight: w,
          sec: done.reduce(function (m, s) { return Math.max(m, Number(s.sec) || 0); }, 0) }
      : { id: exId, mode: "reps", prog: "linear", sets: done.length, reps: done.reduce(function (m, s) { return Math.max(m, Number(s.r) || 0); }, 0), weight: w, inc: 5 };
    var p = PROG.nextPrescription(workouts, cfg, {});
    if (!p || p.kind === "off") return;
    var head = p.kind === "deload" ? "Deload to" : p.kind === "up" ? "Suggested next" : "Next target";
    var val = timed ? String(p.sec || cfg.sec) + "s"
      : p.weight ? String(p.weight) + " \u00d7 " + (p.reps || cfg.reps)
      : String(p.reps || cfg.reps) + " reps";
    var growth = (p.sets && p.sets !== cfg.sets) ? " (" + p.sets + " sets)" : "";
    el2.textContent = head + ": " + val + growth + " (auto progression)";
  }

  function bindEvents() {
    $$("button[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { nav(b.dataset.view); });
    });
    $$("[data-view-link]").forEach(function (a) {
      a.addEventListener("click", function (ev) { ev.preventDefault(); nav(a.dataset.viewLink); });
    });

    var search = $("#search-input");
    search.addEventListener("input", function () { STATE.filter.q = search.value.trim(); renderLibrary(); });
    $("#filter-component").addEventListener("change", function () { STATE.filter.component = this.value; renderLibrary(); });
    $("#filter-aft").addEventListener("change", function () { STATE.filter.aft = this.value; renderLibrary(); });
    $("#filter-equipment").addEventListener("change", function () { STATE.filter.equipment = this.value; renderLibrary(); });
    var pex = $("#progress-ex");
    if (pex) pex.addEventListener("change", function () { STATE.progressEx = pex.value; renderProgressFor(pex.value); });

    $("#new-session-btn").addEventListener("click", function () { STATE.session = blankSession(); STATE.sessionReadOnly = false; renderBuilder(); });
    $("#session-cancel").addEventListener("click", function () { STATE.session = null; STATE.sessionReadOnly = false; renderBuilder(); });
    $("#session-duplicate").addEventListener("click", function () { if (STATE.session) { STATE.session = duplicateSession(STATE.session); STATE.sessionReadOnly = false; renderBuilder(); } });

    function syncSessionFromForm() {
      if (!STATE.session) return;
      STATE.session.name = $("#session-name").value.trim();
      STATE.session.duration = Math.max(10, parseInt($("#session-duration").value, 10) || 60);
      STATE.session.focus = $("#session-focus").value;
      STATE.session.rpe = parseInt($("#session-rpe").value, 10) || 7;
      STATE.session.format = $("#session-format").value;
      STATE.session.circuit = {
        rounds: Math.max(1, parseInt($("#circuit-rounds").value, 10) || 3),
        work: $("#circuit-work").value.trim() || "45 sec",
        rest: $("#circuit-rest").value.trim() || "30 sec"
      };
      STATE.session.notes = $("#session-notes").value.trim();
      STATE.session.tags = $("#session-tags").value.split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
      STATE.session.safetyConfirmed = $("#session-safety-confirm").checked;
    }
    ["session-name", "session-duration", "session-focus", "session-rpe", "session-format", "circuit-rounds", "circuit-work", "circuit-rest", "session-notes", "session-tags"].forEach(function (id) {
      $("#" + id).addEventListener("input", syncSessionFromForm);
    });
    $("#session-format").addEventListener("change", function () {
      syncSessionFromForm();
      if (STATE.session && STATE.session.format === "circuit" && STATE.session.rpe > 5) STATE.session.rpe = 5;
      renderSessionEditor();
    });
    $("#session-safety-confirm").addEventListener("change", syncSessionFromForm);

    $("#session-save").addEventListener("click", function () {
      if (!STATE.session) return;
      if (STATE.sessionReadOnly || isPreset(STATE.session)) { toast("Built-in workouts are locked. Duplicate to edit."); return; }
      syncSessionFromForm();
      var s = STATE.session;
      if (!s.name) { toast("Name the session"); return; }
      if (!s.safetyConfirmed) { toast("Confirm profile, risk, supervision, and environmental controls"); return; }
      if (!s.phases.prep.items.length || !s.phases.activity.items.length || !s.phases.recovery.items.length) {
        toast("Every session requires preparation, activity, and recovery");
        return;
      }
      if (s.format === "circuit") {
        if (s.rpe > 5) { toast("Active-recovery circuits require a target RPE of 5 or lower"); return; }
        if (s.phases.activity.items.length < 2) { toast("Add at least two activity stations to the circuit"); return; }
      }
      requirePassword(function () {
        var all = getSessions();
        var idx = all.findIndex(function (x) { return x.id === s.id; });
        if (idx === -1) all.push(s); else all[idx] = s;
        saveSessions(all);
        toast("Session saved");
        STATE.session = null;
        STATE.sessionReadOnly = false;
        renderBuilder();
      });
    });

    $("#new-regiment-btn").addEventListener("click", function () { STATE.regiment = blankRegiment(); renderBuilder(); });
    $("#regiment-cancel").addEventListener("click", function () { STATE.regiment = null; renderBuilder(); });

    $("#regiment-name").addEventListener("input", function () { if (STATE.regiment) STATE.regiment.name = this.value.trim(); });
    $("#regiment-period").addEventListener("change", function () { if (STATE.regiment) STATE.regiment.period = this.value; });

    $("#regiment-save").addEventListener("click", function () {
      if (!STATE.regiment) return;
      var r = STATE.regiment;
      r.name = $("#regiment-name").value.trim();
      r.period = $("#regiment-period").value;
      if (!r.name) { toast("Name the regiment"); return; }
      var all = getRegiments();
      var idx = all.findIndex(function (x) { return x.id === r.id; });
      if (idx === -1) all.push(r); else all[idx] = r;
      saveRegiments(all);
      toast("Regiment saved");
      STATE.regiment = null;
      renderBuilder();
    });

    $("#aft-result-event").addEventListener("change", function () {
      $("#aft-result-unit").value = AFT_RESULTS.defaultUnit(this.value);
    });
    $("#aft-result-form").addEventListener("submit", function (event) {
      event.preventDefault();
      if (!AFT_RESULTS) return;
      var saved = AFT_RESULTS.upsert(getAftResults(), {
        id: $("#aft-result-id").value,
        event: $("#aft-result-event").value,
        date: $("#aft-result-date").value,
        value: $("#aft-result-value").value,
        unit: $("#aft-result-unit").value,
        note: $("#aft-result-note").value
      });
      if (!saved.changed) { toast("Enter an AFT event, date, and result."); return; }
      saveAftResults(saved.list);
      resetAftResultForm();
      renderAftResults();
      toast("AFT result saved");
    });
    $("#aft-result-cancel").addEventListener("click", resetAftResultForm);

    $("#track-date").addEventListener("change", function () { STATE.date = this.value; saveTrackerActive(); renderTrackerActive(); renderTrackerLog(); });
    $("#track-session").addEventListener("change", function () { saveTrackerActive(); renderTrackerActive(); });
    $("#stopwatch-start").addEventListener("click", startStopwatch);
    $("#stopwatch-lap").addEventListener("click", lapStopwatch);
    $("#stopwatch-reset").addEventListener("click", resetStopwatch);

    $("#ex-modal-close").addEventListener("click", function () {
      $("#ex-modal").classList.add("hidden");
      if (lastModalFocus && lastModalFocus.focus) lastModalFocus.focus();
    });
    $("#copy-modal-close").addEventListener("click", closeCopyModal);
    $("#copy-btn").addEventListener("click", function () { doCopy(copyModalText); });

    /* password + settings + groups bindings */
    $("#settings-btn").addEventListener("click", function () { openSettings(); });
    $("#settings-modal-close").addEventListener("click", function () { $("#settings-modal").classList.add("hidden"); pendingAuth = null; });
    $("#settings-cancel").addEventListener("click", function () { $("#settings-modal").classList.add("hidden"); pendingAuth = null; });
    $("#settings-save-pw").addEventListener("click", function () {
      var np = $("#settings-new-pw").value;
      var cp = $("#settings-confirm-pw").value;
      if (np || cp) {
        if (np.length < 4) { toast("Password must be at least 4 characters"); return; }
        if (np !== cp) { toast("Passwords do not match"); return; }
      }
      var cfg = getSettings();
      if (np) { cfg.pwHash = hashPw(np); } else if (!cfg.pwHash) { toast("Enter a new password"); return; }
      saveSettings(cfg);
      $("#settings-new-pw").value = "";
      $("#settings-confirm-pw").value = "";
      $("#settings-modal").classList.add("hidden");
      toast("Master password " + (np ? "set" : "kept"));
      if (pendingAuth) { showPw(); }
    });

    $("#pw-modal-close").addEventListener("click", function () { $("#pw-modal").classList.add("hidden"); pendingAuth = null; });
    $("#pw-cancel").addEventListener("click", function () { $("#pw-modal").classList.add("hidden"); pendingAuth = null; });
    $("#pw-submit").addEventListener("click", function () {
      var val = $("#pw-input").value;
      if (passwordMatches(val)) {
        $("#pw-modal").classList.add("hidden");
        var cb = pendingAuth; pendingAuth = null;
        if (cb) cb();
      } else {
        $("#pw-error").textContent = "Incorrect password";
        $("#pw-input").value = "";
        setTimeout(function () { $("#pw-input").focus(); }, 30);
      }
    });
    $("#pw-input").addEventListener("keydown", function (e) { if (e.key === "Enter") $("#pw-submit").click(); });

    $("#manage-groups-btn").addEventListener("click", function () { openGroupsModal(); });
    $("#groups-modal-close").addEventListener("click", function () { $("#groups-modal").classList.add("hidden"); });
    $("#group-add").addEventListener("click", function () {
      var name = $("#group-name").value.trim();
      var tags = selectedGroupTags();
      if (!name) { toast("Name the group"); return; }
      if (!tags.length) { toast("Pick at least one tag"); return; }
      var groups = getGroups();
      groups.push({ id: uid(), name: name, tags: tags });
      saveGroups(groups);
      resetGroupForm();
      renderGroupsModal();
      renderBuilder();
      renderHome();
    });
    $("#group-update").addEventListener("click", function () {
      var name = $("#group-name").value.trim();
      var editing = getGroups().find(function (g) { return g.id === STATE.editingGroup; });
      if (!editing) { toast("Select a group to update"); return; }
      var tags = selectedGroupTags();
      if (!name) { toast("Name the group"); return; }
      if (!tags.length) { toast("Pick at least one tag"); return; }
      editing.name = name;
      editing.tags = tags;
      saveGroups(getGroups());
      resetGroupForm();
      renderGroupsModal();
      renderBuilder();
      renderHome();
    });
    $("#group-delete").addEventListener("click", function () {
      if (!STATE.editingGroup) { toast("Select a group to delete"); return; }
      saveGroups(getGroups().filter(function (g) { return g.id !== STATE.editingGroup; }));
      if (STATE.groupFilter === STATE.editingGroup) STATE.groupFilter = null;
      STATE.editingGroup = null;
      resetGroupForm();
      renderGroupsModal();
      renderBuilder();
      renderHome();
    });

    $$(".modal").forEach(function (m) {
      if (m) m.addEventListener("click", function (ev) {
        if (ev.target.classList.contains("modal")) {
          ev.target.classList.add("hidden");
          if (lastModalFocus && lastModalFocus.focus) lastModalFocus.focus();
        }
      });
    });
    document.addEventListener("keydown", function (event) {
      var openModal = $$(".modal").find(function (modal) { return !modal.classList.contains("hidden"); });
      if (!openModal) return;
      if (event.key === "Escape" && openModal) {
        openModal.classList.add("hidden");
        if (lastModalFocus && lastModalFocus.focus) lastModalFocus.focus();
        return;
      }
      if (event.key === "Tab") {
        var focusable = Array.prototype.slice.call(openModal.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function init() {
    if (!window.BR_EXERCISES) { console.error("exercises.js failed to load"); }
    if (!window.BR_DOCTRINE) { console.error("doctrine.js failed to load"); }
    seedPresets();
    bindEvents();
    nav(initialView());
    if (window.BRCloud) {
      window.BRCloud.init(function (dataChanged) {
        if (dataChanged && !hasOpenModal()) refreshView();
        renderDriveSection();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
