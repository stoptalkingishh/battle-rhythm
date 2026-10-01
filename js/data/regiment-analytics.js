"use strict";
/* Block analytics for a regiment (issue #19): "is this block working?".
 *
 * Consumes only what the user actually has — completed logged sessions
 * (normalized into the `workouts` shape by history-adapter.js), the session
 * RPEs they typed at finish, their weigh-ins, and the regiment's own
 * schedule. It never estimates, imputes or interpolates a missing number:
 * every field is null / "insufficient" when the data cannot support it, and
 * `blockAnalytics` reports `hasData:false` with a reason rather than a chart
 * over one point.
 *
 * Everything here is pure and read-only: no storage, no DOM, no Date.now()
 * unless the caller passes `now`. Nothing is written back into a regiment.
 *
 * Phase expectations come from the doctrine period names themselves (FM 7-22
 * paras 5-17..5-21), so "volume should be rising" is answered against the
 * period the user tagged the regiment with rather than a hardcoded guess:
 *
 *   Base            build volume, moderate load
 *   Build           higher intensity AND increased volume (explicit in the text)
 *   Peak 1 (Taper)  volume deliberately reduced, intensity maintained/increased
 *   Combat / Peak 2 highest intensity; volume is the mission's business
 *   Recovery        low workloads
 *
 * `PHASE_EXPECTATIONS` is the table; `phaseFor(name)` is a pure lookup with a
 * null-safe default. A period name the table does not know returns
 * `unknown`, whose expectation is `null` — the module then reports the trend
 * without claiming it matches or contradicts the phase.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./onerm.js"), require("./weekly-plan.js"));
  } else {
    root.BR_REGIMENT_ANALYTICS = factory(root.BR_ONE_RM, root.BR_WEEKLY_PLAN);
  }
})(typeof self !== "undefined" ? self : this, function (ONE_RM, WP) {
  var DAY_MS = 86400000;

  /* Weeks needed before a trend is a trend. One week is a baseline, not a
   * direction; one point is not a line. */
  var MIN_WEEKS_FOR_TREND = 2;
  var MIN_POINTS_FOR_TREND = 2;

  var PHASE_EXPECTATIONS = {
    "base": { volume: "up", load: "up", label: "Base", citation: "FM 7-22, para 5-17" },
    "build": { volume: "up", load: "up", label: "Build", citation: "FM 7-22, para 5-18" },
    "peak 1 (taper)": { volume: "down", load: "up", label: "Peak 1 (Taper)", citation: "FM 7-22, para 5-19" },
    "combat / peak 2": { volume: null, load: "up", label: "Combat / Peak 2", citation: "FM 7-22, para 5-20" },
    "recovery": { volume: "down", load: "down", label: "Recovery", citation: "FM 7-22, para 5-21" }
  };
  var UNKNOWN_PHASE = { volume: null, load: null, label: null, citation: null };

  /* isFinite() coerces: isFinite(null) and isFinite("") are both true. A missing
   * number has to read as missing, not as zero. */
  function num(v) { return typeof v === "number" && isFinite(v); }

  function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* Percent change, or null when it cannot be computed honestly. Guards the
   * three ways a percentage goes wrong here: no points, a zero baseline, and a
   * non-finite result. */
  function pctChange(first, last) {
    if (!num(first) || !num(last)) return null;
    if (!(first > 0)) return null;
    var pct = ((last - first) / first) * 100;
    return isFinite(pct) ? round1(pct) : null;
  }

  /* up | down | flat. Callers that have fewer than MIN_POINTS_FOR_TREND
   * observations must say "insufficient" themselves — this only judges a pair
   * it was actually given. */
  function directionOf(first, last) {
    if (!num(first) || !num(last)) return "insufficient";
    if (last > first) return "up";
    if (last < first) return "down";
    return "flat";
  }

  function phaseFor(name) {
    var key = String(name == null ? "" : name).trim().toLowerCase();
    if (!key) return { name: name == null ? null : name, expectation: UNKNOWN_PHASE, known: false };
    var exp = PHASE_EXPECTATIONS[key];
    if (exp) return { name: name, expectation: exp, known: true };
    /* A period the table does not carry verbatim ("Peak 1 — Taper", "Build Phase")
     * still resolves when a doctrine period name is contained in it. */
    var found = null;
    Object.keys(PHASE_EXPECTATIONS).forEach(function (k) {
      if (found || k.indexOf(key) !== -1 || key.indexOf(k) !== -1) found = PHASE_EXPECTATIONS[k];
    });
    return { name: name, expectation: found || UNKNOWN_PHASE, known: !!found };
  }

  /* ISO date of the Monday starting the week that contains isoDate. UTC
   * throughout, so the bucket does not move with the machine's timezone. */
  function weekStartOf(isoDate) {
    if (typeof isoDate !== "string" || isoDate.length < 10) return null;
    var ms = Date.parse(isoDate + "T00:00:00Z");
    if (!isFinite(ms)) return null;
    var wd = WP.weekdayFor(isoDate.slice(0, 10));   /* 0 = Mon */
    var day = new Date(ms - wd * DAY_MS);
    return day.toISOString().slice(0, 10);
  }

  /* Volume and set counts per ISO week. Weeks with no logged session are not
   * invented — a gap is a gap, and the caller can see it from the bucket list. */
  function weeklyBuckets(workouts) {
    var byWeek = {};
    var order = [];
    arr(workouts).forEach(function (w) {
      if (!w || typeof w.d !== "string") return;
      var ws = weekStartOf(w.d);
      if (!ws) return;
      if (!byWeek[ws]) { byWeek[ws] = { weekStart: ws, sessions: 0, volume: 0, sets: 0 }; order.push(ws); }
      var b = byWeek[ws];
      b.sessions += 1;
      arr(w.entries).forEach(function (e) {
        arr(e && e.sets).forEach(function (s) {
          if (!s || s.done !== true || s.warmup) return;
          var wgt = Number(s.w) || 0;
          var reps = Number(s.r) || 0;
          if (wgt > 0 && reps > 0) b.volume += wgt * reps;
          b.sets += 1;
        });
      });
    });
    order.sort();
    return order.map(function (ws) {
      var b = byWeek[ws];
      return { weekStart: ws, sessions: b.sessions, sets: b.sets, volume: round1(b.volume) };
    });
  }

  /* Volume across the block: first logged week vs last, per week of the span
   * (not per week that happened to have a session — a two-week block with one
   * session logged in each is two weeks, and the rate should say so). */
  function volumeTrend(workouts, fromIso, toIso) {
    var buckets = weeklyBuckets(workouts);
    var from = fromIso ? weekStartOf(fromIso) : null;
    var to = toIso ? weekStartOf(toIso) : null;
    var inSpan = buckets.filter(function (b) {
      if (from && b.weekStart < from) return false;
      if (to && b.weekStart > to) return false;
      return true;
    });
    var span = spanWeeks(from, to, buckets);
    var weeks = inSpan.map(function (b) { return round1(b.volume / span); });
    /* Two logged weeks are the minimum, and a change is only reportable when
     * the baseline is non-zero: two weeks of nothing done is not a flat
     * volume trend, it is two weeks with no measurable change. */
    var enough = inSpan.length >= MIN_WEEKS_FOR_TREND;
    var first = enough ? weeks[0] : null;
    var last = enough ? weeks[weeks.length - 1] : null;
    var deltaPct = enough ? pctChange(first, last) : null;
    return {
      buckets: buckets,
      spanWeeks: span,
      weeks: weeks,
      perWeek: weeks.length ? weeks : null,
      first: first,
      last: last,
      deltaPct: deltaPct,
      direction: deltaPct === null ? "insufficient" : directionOf(first, last)
    };
  }

  /* Whole weeks between two Monday week-starts, at least one. Null when the
   * span is not yet known (an unbounded block), which is the honest answer
   * rather than "divide by however many sessions there were". */
  function spanWeeks(from, to, buckets) {
    var a = from, b = to;
    if (!a && buckets && buckets.length) a = buckets[0].weekStart;
    if (!b && buckets && buckets.length) b = buckets[buckets.length - 1].weekStart;
    if (!a || !b) return null;
    var span = Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / (7 * DAY_MS)) + 1;
    return span > 0 ? span : 1;
  }

  /* Per-exercise e1RM across the block, reusing onerm.js rather than a second
   * estimator. Only the block's own dates are read, so a session from before
   * the block cannot flatter the trend. Sorted strongest-first-relative by
   * delta, then by id, so the output is stable for rendering and for tests. */
  function exerciseProgression(workouts, fromIso, toIso) {
    var scope = arr(workouts).filter(function (w) {
      if (!w || typeof w.d !== "string") return false;
      if (fromIso && w.d < fromIso) return false;
      if (toIso && w.d > toIso) return false;
      return true;
    });
    var ids = {};
    scope.forEach(function (w) { arr(w.entries).forEach(function (e) { if (e && e.id != null) ids[e.id] = true; }); });
    var out = Object.keys(ids).sort().map(function (id) {
      var pts = ONE_RM.e1rmSeries(scope, id);
      /* An exercise the block only ever did as cardio or for time has no
       * estimate at all, so it is not a row in the progression. */
      if (!pts.length) return null;
      var first = pts[0].y;
      var last = pts.length ? pts[pts.length - 1].y : null;
      return {
        id: id,
        points: pts.length,
        first: first,
        last: last,
        best: pts.reduce(function (m, p) { return (!m || p.y > m) ? p.y : m; }, null),
        deltaPct: pts.length >= MIN_POINTS_FOR_TREND ? pctChange(first, last) : null,
        direction: pts.length >= MIN_POINTS_FOR_TREND ? directionOf(first, last) : "insufficient",
        /* The two sets the estimates came from. A "+12%" with no provenance is
         * a number nobody can check. */
        from: { d: pts[0].d, w: pts[0].w, r: pts[0].r },
        to: { d: pts[pts.length - 1].d, w: pts[pts.length - 1].w, r: pts[pts.length - 1].r }
      };
    }).filter(Boolean);
    out.sort(function (a, b) {
      var ad = a.deltaPct == null ? -Infinity : a.deltaPct;
      var bd = b.deltaPct == null ? -Infinity : b.deltaPct;
      if (ad !== bd) return bd - ad;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
  }

  /* Block-wide strength: the mean of each tracked exercise's first and last
   * estimate. Only exercises with at least two points count — averaging a
   * single-session exercise into a "block strength" would mix a baseline with
   * a trend. Null when nothing qualifies. */
  function strengthTrend(progression) {
    var tracked = arr(progression).filter(function (p) { return p.points >= MIN_POINTS_FOR_TREND && num(p.first) && num(p.last); });
    if (!tracked.length) return { exercises: 0, first: null, last: null, deltaPct: null, direction: "insufficient" };
    var first = tracked.reduce(function (s, p) { return s + p.first; }, 0) / tracked.length;
    var last = tracked.reduce(function (s, p) { return s + p.last; }, 0) / tracked.length;
    return {
      exercises: tracked.length,
      first: round1(first),
      last: round1(last),
      deltaPct: pctChange(first, last),
      direction: directionOf(first, last)
    };
  }

  /* How much of the regiment's schedule the block actually covered. Counts
   * scheduled sessions per week (sum of the days' session counts) and the
   * logged sessions that fell on those weekdays. Rate is null with no
   * schedule — never a fabricated 0% or 100%. */
  function adherence(regiment, loggedDates, fromIso, toIso) {
    var days = arr(regiment && regiment.days).filter(function (d) { return isObj(d) && arr(d.sessions).length > 0; });
    var perWeek = days.reduce(function (n, d) { return n + arr(d.sessions).length; }, 0);
    if (!perWeek) return { perWeek: 0, expected: null, logged: null, rate: null, weekdays: [] };
    var weekdays = days.map(function (d) { return weekdayFromName(d.name); })
      .filter(function (wd) { return wd != null; });
    var span = spanWeeks(fromIso ? weekStartOf(fromIso) : null, toIso ? weekStartOf(toIso) : null, null);
    if (span == null) {
      /* No block bounds: fall back to the weeks the logged dates actually
       * cover, so the denominator is stated rather than assumed. */
      var ws = arr(loggedDates).map(weekStartOf).filter(Boolean).sort();
      span = spanWeeks(ws[0], ws[ws.length - 1], null);
    }
    var expected = span == null ? null : perWeek * span;
    var logged = 0;
    arr(loggedDates).forEach(function (iso) {
      var wk = weekStartOf(iso);
      if (fromIso && wk < weekStartOf(fromIso)) return;
      if (toIso && wk > weekStartOf(toIso)) return;
      if (weekdays.indexOf(WP.weekdayFor(iso)) !== -1) logged += 1;
    });
    return {
      perWeek: perWeek,
      spanWeeks: span,
      expected: expected,
      logged: logged,
      rate: expected > 0 ? round1((logged / expected) * 100) : null,
      weekdays: weekdays
    };
  }

  /* Regiment day names are stored as "Mon"/"Monday"; delegate to the weekly-plan
   * module so both sides of the app agree on what a day name means. */
  function weekdayFromName(name) { return WP.weekdayFromName(name); }

  /* RPE the user actually typed. String values ("8") parse; blank, junk and
   * out-of-range values do not contribute and are counted as `unrecorded`. */
  function rpeSummary(values) {
    var clean = [];
    var unrecorded = 0;
    arr(values).forEach(function (v) {
      var n = typeof v === "string" ? Number(v.trim()) : v;
      if (typeof n === "number" && !isFinite(n)) { unrecorded += 1; return; }
      n = typeof n === "number" ? n : NaN;
      if (!isFinite(n) || n <= 0 || n > 10) { unrecorded += 1; return; }
      clean.push(n);
    });
    if (!clean.length) return { n: 0, avg: null, min: null, max: null, first: null, last: null, deltaPct: null, direction: "insufficient", unrecorded: unrecorded };
    var sum = clean.reduce(function (s, n) { return s + n; }, 0);
    /* One recorded RPE is a reading, not a change: first-minus-last is
     * arithmetically 0, and printing "0%" would read as "you held steady". */
    var trendable = clean.length >= MIN_POINTS_FOR_TREND;
    return {
      n: clean.length,
      avg: round1(sum / clean.length),
      min: Math.min.apply(null, clean),
      max: Math.max.apply(null, clean),
      first: clean[0],
      last: clean[clean.length - 1],
      deltaPct: trendable ? pctChange(clean[0], clean[clean.length - 1]) : null,
      direction: trendable ? directionOf(clean[0], clean[clean.length - 1]) : "insufficient",
      unrecorded: unrecorded
    };
  }

  /* Bodyweight across the block from the weigh-in list ({ date, weight }).
   * Needs two weigh-ins to say anything about a direction. */
  function bodyweightSummary(entries, fromIso, toIso) {
    var scoped = arr(entries).filter(function (e) {
      if (!isObj(e) || typeof e.date !== "string") return false;
      if (fromIso && e.date < fromIso) return false;
      if (toIso && e.date > toIso) return false;
      var w = Number(e.weight);
      return num(w) && w > 0;
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!scoped.length) return { n: 0, first: null, last: null, delta: null, direction: "insufficient" };
    var first = Number(scoped[0].weight);
    var last = Number(scoped[scoped.length - 1].weight);
    /* One weigh-in has no change to report: last-minus-first is arithmetically
     * 0, and printing "0" would read as "your bodyweight held steady". */
    if (scoped.length < MIN_POINTS_FOR_TREND) {
      return { n: scoped.length, first: round1(first), last: round1(last), delta: null, direction: "insufficient", firstDate: scoped[0].date, lastDate: scoped[scoped.length - 1].date };
    }
    return {
      n: scoped.length,
      first: round1(first),
      last: round1(last),
      delta: round1(last - first),
      direction: scoped.length >= MIN_POINTS_FOR_TREND ? directionOf(first, last) : "insufficient",
      firstDate: scoped[0].date,
      lastDate: scoped[scoped.length - 1].date
    };
  }

  /* Does what actually happened match what this phase calls for?
   *
   * Returns null for "cannot say": a trend the sample cannot support, or a
   * phase whose expectation is unknown. `verdict` is "matches" | "off-phase"
   * | "insufficient", and the reason names which half disagreed. A flat trend
   * during a taper is not an error (volume is meant to come down, not to move
   * much either way), so flat is judged against "no direction" and reported
   * separately. */
  function phaseVerdict(phase, volumeDirection, loadDirection) {
    var exp = (phase && phase.expectation) || UNKNOWN_PHASE;
    var checks = [];
    if (exp.volume) {
      if (volumeDirection === "insufficient") checks.push({ what: "volume", expected: exp.volume, actual: "insufficient" });
      else if (volumeDirection === "flat") checks.push({ what: "volume", expected: exp.volume, actual: "flat", neutral: true });
      else checks.push({ what: "volume", expected: exp.volume, actual: volumeDirection, ok: volumeDirection === exp.volume });
    }
    if (exp.load) {
      if (loadDirection === "insufficient") checks.push({ what: "load", expected: exp.load, actual: "insufficient" });
      else if (loadDirection === "flat") checks.push({ what: "load", expected: exp.load, actual: "flat", neutral: true });
      else checks.push({ what: "load", expected: exp.load, actual: loadDirection, ok: loadDirection === exp.load });
    }
    if (!checks.length) return null;
    var decidable = checks.filter(function (c) { return c.ok != null && !c.neutral; });
    if (!decidable.length) return { verdict: "insufficient", phase: phase, checks: checks };
    var bad = decidable.filter(function (c) { return !c.ok; });
    return {
      verdict: bad.length ? "off-phase" : "matches",
      phase: phase,
      offOn: bad.map(function (c) { return c.what; }),
      checks: checks
    };
  }

  /* The one call the UI makes. Input is everything the module needs, so it is
   * testable without a browser:
   *
   *   workouts     normalized completed sessions (history-adapter.js)
   *   regiment     { name, period, days: [{ name, sessions: [id] }] }
   *   loggedDates  ISO dates carrying a completed session
   *   rpes         actual session RPEs, in chronological order
   *   bodyweight   weigh-ins [{ date, weight }]
   *   from / to    block bounds (ISO dates). Omit for "all logged history".
   *
   * With no completed session the result is `{ hasData: false, reason }` and
   * every other field is an empty — not a zero, not a NaN. */
  function blockAnalytics(input) {
    input = isObj(input) ? input : {};
    var regiment = isObj(input.regiment) ? input.regiment : null;
    /* Everything below reads the block only: a session logged before the block
     * started cannot make the block look better than it was. */
    var workouts = arr(input.workouts).filter(function (w) {
      if (!w || typeof w.d !== "string") return false;
      if (input.from && w.d < input.from) return false;
      if (input.to && w.d > input.to) return false;
      return true;
    });
    var phase = phaseFor(regiment ? regiment.period : null);

    var progression = exerciseProgression(workouts, input.from, input.to);
    var volume = volumeTrend(workouts, input.from, input.to);
    var strength = strengthTrend(progression);
    var rpe = rpeSummary(input.rpes);
    var bw = bodyweightSummary(input.bodyweight, input.from, input.to);
    var att = adherence(regiment, input.loggedDates, input.from, input.to);

    if (!workouts.length) {
      return {
        hasData: false,
        reason: "no-sessions",
        regiment: regiment,
        period: phase,
        sessionCount: 0,
        volume: volume, load: progression, strength: strength,
        rpe: rpe, bodyweight: bw, adherence: att,
        verdict: null
      };
    }

    var verdict = phaseVerdict(phase, volume.direction, strength.direction);
    return {
      hasData: true,
      reason: null,
      regiment: regiment,
      period: phase,
      sessionCount: workouts.length,
      spanWeeks: volume.spanWeeks,
      /* Adherence of a regiment with no schedule is reported, not faked. */
      canJudge: !!verdict,
      volume: volume,
      load: progression,
      strength: strength,
      rpe: rpe,
      bodyweight: bw,
      adherence: att,
      verdict: verdict
    };
  }

  return {
    num: num,
    MIN_WEEKS_FOR_TREND: MIN_WEEKS_FOR_TREND,
    MIN_POINTS_FOR_TREND: MIN_POINTS_FOR_TREND,
    PHASE_EXPECTATIONS: PHASE_EXPECTATIONS,
    pctChange: pctChange,
    directionOf: directionOf,
    phaseFor: phaseFor,
    weekStartOf: weekStartOf,
    spanWeeks: spanWeeks,
    weekdayFromName: weekdayFromName,
    weeklyBuckets: weeklyBuckets,
    volumeTrend: volumeTrend,
    exerciseProgression: exerciseProgression,
    strengthTrend: strengthTrend,
    adherence: adherence,
    rpeSummary: rpeSummary,
    bodyweightSummary: bodyweightSummary,
    phaseVerdict: phaseVerdict,
    blockAnalytics: blockAnalytics
  };
});