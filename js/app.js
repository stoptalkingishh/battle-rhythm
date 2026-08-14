"use strict";

(function () {
  var EX = window.BR_EXERCISES || [];
  var DOC = window.BR_DOCTRINE || {};
  var GUIDES = window.BR_MOVEMENT_GUIDES || {};

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var KEYS = { sessions: "br_sessions", regiments: "br_regiments", logs: "br_tracker" };

  var COMPONENTS = {
    "muscular-strength": { label: "Muscular Strength", badge: "badge-ms" },
    "hypertrophy": { label: "Hypertrophy", badge: "badge-hy" },
    "muscular-endurance": { label: "Muscular Endurance", badge: "badge-me" },
    "aerobic-endurance": { label: "Aerobic Endurance", badge: "badge-ae" },
    "anaerobic-endurance": { label: "Anaerobic Endurance", badge: "badge-an" },
    "power": { label: "Power", badge: "badge-pw" },
    "mobility-stability": { label: "Mobility & Stability", badge: "badge-mo" }
  };

  var PHASE_ORDER = ["prep", "activity", "recovery"];
  var PHASE_LABEL = { prep: "Preparation", activity: "Activity", recovery: "Recovery" };

  var STATE = {
    view: "home",
    filter: { q: "", component: "all", aft: "all", equipment: "all" },
    session: null,
    regiment: null,
    date: todayStr()
  };

  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
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
  function stripPar(str) { return String(str || "").replace(/^\[PAR\] ?/, ""); }
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
    var contentKids = [el("h4", { text: title })];
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
    try { if (window.location.hash !== "#" + name) history.replaceState(null, "", "#" + name); } catch (e) {}
  }
  function initialView() {
    var h = (window.location.hash || "").replace("#", "");
    var valid = ["home", "library", "builder", "tracker", "doctrine"];
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

  function itemText(item) {
    var parts = [];
    if (item.sets) parts.push(item.sets + " sets");
    if (item.reps) parts.push(item.reps + " reps");
    if (item.duration) parts.push(item.duration);
    if (item.rest) parts.push("rest " + item.rest);
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
    var done = entry && entry.done || {};
    lines.splice(4, 0, "Tracker status: " + (entry && entry.complete ? "Completed" : "In progress"));
    lines.push("");
    lines.push("TRACKED RESULTS:");
    PHASE_ORDER.forEach(function (key) {
      var phase = s.phases[key];
      if (!phase || !phase.items.length) return;
      phase.items.forEach(function (item) {
        lines.push((done[item.id] ? "[x] " : "[ ] ") + item.label + (itemText(item) ? " - " + itemText(item) : ""));
      });
    });
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
        el("p", { class: "card-muted", text: stripQuotes(c.definition) }),
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
        var q = f.q.toLowerCase();
        var hay = (e.name + " " + (e.muscles || "") + " " + (e.drill || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function exerciseCard(ex) {
    var cues = (ex.cues || []).slice(0, 2).map(function (c) { return "&bull; " + esc(c); }).join("<br>");
    var card = el("div", { class: "card" }, [
      el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;" }, [
        badge(ex.component),
        tag(ex.equipment || "No equipment"),
        (ex.drill ? tag(ex.drill) : null)
      ]),
      el("h3", { class: "card-title", text: ex.name }),
      el("p", { class: "card-muted", html: cues, style: "font-size:.82rem;" }),
      el("div", { class: "tag-row", style: "margin-top:10px;" }, (ex.aft || []).map(function (a) { return tag("AFT " + a); })),
      el("div", { class: "exercise-card-actions" }, [
        el("button", { class: "btn btn-ghost btn-sm", text: "Details", onclick: function (e) { e.stopPropagation(); openExerciseModal(ex.id); } }),
        el("button", { class: "btn btn-gold btn-sm", text: "+ Session", onclick: function (e) { e.stopPropagation(); addToSession(ex.id); } })
      ])
    ]);
    return card;
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
    var ex = EX.find(function (e) { return e.id === id; });
    if (!ex) return;
    rememberModalFocus();
    $("#ex-modal-name").textContent = ex.name;
    var tags = $("#ex-modal-tags");
    tags.innerHTML = "";
    tags.appendChild(badge(ex.component));
    tags.appendChild(tag(ex.equipment || "No equipment"));
    if (ex.drill) tags.appendChild(tag(ex.drill));
    (ex.aft || []).forEach(function (a) { tags.appendChild(tag("AFT " + a)); });
    tags.appendChild(tag(sourceLabel(ex)));

    var body = $("#ex-modal-body");
    body.innerHTML = "";
    var row = function (label, value) {
      body.appendChild(el("div", { style: "padding:10px 0;border-bottom:1px solid var(--border);" }, [
        el("p", { style: "font-size:.66rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin:0 0 6px;", text: label }),
        el("p", { style: "margin:0;font-size:.88rem;line-height:1.6;", text: value })
      ]));
    };
    row("Form", (ex.cues || []).map(function (c, i) { return (i + 1) + ". " + c; }).join("\n"));
    row("Programming", ex.programming);
    row("Muscles", ex.muscles);
    row("Safety", ex.safety);
    row("Source", ex.source + "  [" + sourceLabel(ex) + "]");
    if (window.BRExerciseCoach && window.BRExerciseCoach.render) {
      body.appendChild(window.BRExerciseCoach.render(ex, GUIDES[ex.id]));
    }
    $("#ex-modal-add").onclick = function () { addToSession(ex.id); $("#ex-modal").classList.add("hidden"); };
    $("#ex-modal-copy").onclick = function () { openCopyModal(exercisePlainText(ex)); $("#ex-modal").classList.add("hidden"); };
    $("#ex-modal").classList.remove("hidden");
    $("#ex-modal-close").focus();
  }

  /* ==================== BUILDER ==================== */

  function getSessions() { return load(KEYS.sessions, []); }
  function saveSessions(list) { store(KEYS.sessions, list); }
  function getRegiments() { return load(KEYS.regiments, []); }
  function saveRegiments(list) { store(KEYS.regiments, list); }

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
      sets: "3", reps: "10", duration: "", rest: "60s"
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
    renderSessionEditor();
    toast("Added " + ex.name + " to " + PHASE_LABEL[key]);
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

  function itemField(item, field, placeholder) {
    var input = el("input", {
      class: "input", type: "text", value: item[field] || "", placeholder: placeholder,
      oninput: function () { item[field] = input.value; }
    });
    return el("label", { style: "display:flex;flex-direction:column;gap:3px;font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);" }, [
      document.createTextNode(placeholder), input
    ]);
  }

  function renderPhaseItems(phase) {
    var wrap = el("div", {});
    if (!phase.items.length) {
      wrap.appendChild(el("p", { class: "card-muted", style: "font-size:.8rem;", text: "No items yet." }));
      return wrap;
    }
    phase.items.forEach(function (item) {
      var block = el("div", { class: "phase-item" }, [
        el("div", { class: "phase-item-row" }, [
          el("p", { class: "phase-item-name", text: item.label }),
          el("button", { class: "btn-icon", text: "x", title: "Remove", "aria-label": "Remove " + item.label, onclick: function () {
            phase.items = phase.items.filter(function (i) { return i.id !== item.id; });
            renderSessionEditor();
          } })
        ]),
        el("div", { class: "phase-item-grid" }, [
          itemField(item, "sets", "Sets"),
          itemField(item, "reps", "Reps/Time"),
          itemField(item, "duration", "Duration"),
          itemField(item, "rest", "Rest")
        ])
      ]);
      wrap.appendChild(block);
    });
    return wrap;
  }

  function phaseAdder(key) {
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
    wrap.appendChild(select);
    wrap.appendChild(btn);
    return wrap;
  }

  function renderSessionEditor() {
    var editor = $("#session-editor");
    if (!STATE.session) { editor.classList.add("hidden"); return; }
    editor.classList.remove("hidden");
    var s = STATE.session;
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
    $("#session-safety-confirm").checked = !!s.safetyConfirmed;
    var exists = getSessions().some(function (x) { return x.id === s.id; });
    $("#session-save").textContent = exists ? "Update Session" : "Save Session";

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
        renderPhaseItems(phase),
        el("div", { style: "margin-top:10px;" }, [phaseAdder(key)])
      ]);
      host.appendChild(card);
    });
  }

  function renderSessionsList() {
    var all = getSessions();
    var host = $("#sessions-list");
    host.innerHTML = "";
    $("#sessions-empty").classList.toggle("hidden", all.length > 0);
    all.forEach(function (s) {
      var count = 0;
      PHASE_ORDER.forEach(function (k) { if (s.phases[k]) count += s.phases[k].items.length; });
      host.appendChild(rowEl(
        el("span", { text: "S", style: "font-family:var(--font-display);font-size:1.2rem;" }),
        s.name,
        s.duration + " min | RPE " + s.rpe + " | " + componentLabel(s.focus) + " | " + count + " items",
        [
          el("button", { class: "btn btn-ghost btn-sm", text: "Edit", onclick: function () { STATE.session = s; renderBuilder(); } }),
          el("button", { class: "btn btn-ghost btn-sm", text: "Copy", onclick: function () { openCopyModal(sessionPlainText(s)); } }),
          el("button", { class: "btn btn-danger btn-sm", text: "x", title: "Delete", "aria-label": "Delete " + s.name, onclick: function () {
            saveSessions(getSessions().filter(function (x) { return x.id !== s.id; }));
            saveRegiments(getRegiments().map(function (regiment) {
              regiment.days.forEach(function (day) {
                day.sessions = day.sessions.filter(function (sessionId) { return sessionId !== s.id; });
              });
              return regiment;
            }));
            renderBuilder();
          } })
        ]
      ));
    });
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

  function getLogs() { return load(KEYS.logs, {}); }
  function saveLogs(logs) { store(KEYS.logs, logs); }
  function snapshotSession(session) { return JSON.parse(JSON.stringify(session)); }
  function ensureLogEntry(date, session) {
    var logs = getLogs();
    if (!logs[date]) logs[date] = { sessions: {} };
    if (!logs[date].sessions[session.id]) {
      logs[date].sessions[session.id] = { done: {}, complete: false, snapshot: snapshotSession(session) };
    }
    return { logs: logs, entry: logs[date].sessions[session.id] };
  }

  function renderTracker() {
    var dateInput = $("#track-date");
    if (!dateInput.value) dateInput.value = STATE.date;
    var sel = $("#track-session");
    var sessions = getSessions();
    sel.innerHTML = "";
    sessions.forEach(function (s) { sel.appendChild(el("option", { value: s.id, text: s.name })); });
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
    var entry = logs[date] && logs[date].sessions && logs[date].sessions[s.id] || { done: {}, complete: false };

    host.innerHTML = "";
    var header = el("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;" }, [
      el("div", {}, [
        el("h3", { class: "card-title", text: s.name }),
        el("p", { class: "card-muted", style: "margin:0;font-size:.8rem;", text: s.duration + " min | RPE " + s.rpe + " | " + componentLabel(s.focus) })
      ]),
      el("button", {
        class: "btn " + (entry.complete ? "btn-gold" : "btn-ghost") + " btn-sm",
        text: entry.complete ? "Completed" : "Mark Complete",
        onclick: function () {
          var saved = ensureLogEntry(date, s);
          saved.entry.complete = !saved.entry.complete;
          saveLogs(saved.logs);
          renderTrackerActive();
          renderTrackerLog();
        }
      })
    ]);
    host.appendChild(header);
    if (s.notes) host.appendChild(el("p", { class: "card-muted", style: "font-size:.82rem;margin:0 0 12px;", text: s.notes }));

    var progressTotal = 0, progressDone = 0;
    PHASE_ORDER.forEach(function (key) {
      var phase = s.phases[key];
      if (!phase || !phase.items.length) return;
      host.appendChild(el("h4", { style: "font-family:var(--font-display);text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;color:var(--gold);margin:14px 0 8px;", text: phase.name }));
      phase.items.forEach(function (item) {
        progressTotal++;
        var done = !!entry.done[item.id];
        if (done) progressDone++;
        var row = el("button", { class: "list-item tracker-item" + (done ? " done" : ""), type: "button", "aria-pressed": String(done) }, [
          el("span", { style: "font-size:1.05rem;width:20px;text-align:center;color:" + (done ? "var(--ok)" : "var(--text-muted)") + ";", text: done ? "\u2713" : "\u25CB" }),
          el("div", { class: "content" }, [
            el("h4", { style: "margin:0;", text: item.label }),
            el("p", { class: "card-muted", style: "margin:0;font-size:.76rem;", text: itemText(item) || "" })
          ])
        ]);
        row.addEventListener("click", function () {
          var saved = ensureLogEntry(date, s);
          saved.entry.done[item.id] = !saved.entry.done[item.id];
          saveLogs(saved.logs);
          renderTrackerActive();
        });
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
        el("button", { class: "btn btn-ghost btn-sm", text: "Copy to Notes", onclick: function () { openCopyModal(trackedSessionPlainText(s, date, entry)); } })
      ])
    ]));
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
      PHASE_ORDER.forEach(function (k) { var p = en.s.phases[k]; if (p) { total += p.items.length; p.items.forEach(function (i) { if (en.e.done[i.id]) doneCount++; }); } });
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
    $("#cft-note").innerHTML = cft ? "<strong>" + esc(cft.name) + "</strong><br>" + esc(cft.description) + "<br><span style='font-size:.76rem;'>" + esc(cft.citation) + "</span>" : "";

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
      if (p.hrZones.note) prog.appendChild(el("p", { class: "card-muted", style: "font-size:.76rem;margin:6px 0 0;", text: p.hrZones.note + "  " + (p.hrZones.citation || "") }));
    }

    if (p.periods && p.periods.length) {
      prog.appendChild(el("h3", { class: "card-title", style: "margin-top:22px;", text: "Periodization" }));
      p.periods.forEach(function (per) {
        prog.appendChild(el("div", { style: "padding:8px 0;border-bottom:1px solid var(--border);" }, [
          el("h4", { style: "margin:0;font-family:var(--font-display);text-transform:uppercase;letter-spacing:.05em;", text: per.name }),
          el("p", { class: "card-muted", style: "margin:4px 0 0;font-size:.84rem;", text: stripQuotes(per.text) }),
          el("p", { class: "card-muted", style: "font-size:.72rem;margin:4px 0 0;", text: per.citation })
        ]));
      });
    }

    if (p.weeklySplit && p.weeklySplit.length) {
      prog.appendChild(el("h3", { class: "card-title", style: "margin-top:22px;", text: "Weekly Splits" }));
      p.weeklySplit.forEach(function (w) {
        prog.appendChild(el("p", { class: "card-muted", style: "font-size:.84rem;margin:6px 0;", text: w.name + ": " + stripQuotes(w.text) }));
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
        el("p", { class: "card-muted", text: stripQuotes(s.description) }),
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

  /* ==================== INIT / EVENTS ==================== */

  function bindEvents() {
    $$(".nav-btn").forEach(function (b) {
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

    $("#new-session-btn").addEventListener("click", function () { STATE.session = blankSession(); renderBuilder(); });
    $("#session-cancel").addEventListener("click", function () { STATE.session = null; renderBuilder(); });

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
      STATE.session.safetyConfirmed = $("#session-safety-confirm").checked;
    }
    ["session-name", "session-duration", "session-focus", "session-rpe", "session-format", "circuit-rounds", "circuit-work", "circuit-rest", "session-notes"].forEach(function (id) {
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
      var all = getSessions();
      var idx = all.findIndex(function (x) { return x.id === s.id; });
      if (idx === -1) all.push(s); else all[idx] = s;
      saveSessions(all);
      toast("Session saved");
      STATE.session = null;
      renderBuilder();
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

    $("#track-date").addEventListener("change", function () { STATE.date = this.value; renderTrackerActive(); renderTrackerLog(); });
    $("#track-session").addEventListener("change", function () { renderTrackerActive(); });

    $("#ex-modal-close").addEventListener("click", function () {
      $("#ex-modal").classList.add("hidden");
      if (lastModalFocus && lastModalFocus.focus) lastModalFocus.focus();
    });
    $("#copy-modal-close").addEventListener("click", closeCopyModal);
    $("#copy-btn").addEventListener("click", function () { doCopy(copyModalText); });
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
    bindEvents();
    nav(initialView());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
