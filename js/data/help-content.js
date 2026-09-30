"use strict";
/* The in-app help content: the first-run quick-start tour and the FAQ.
 * Pure data + pure functions, no DOM and no storage access, so it ships with
 * the app (no wiki, no network) and can be unit-tested with node:test.
 *
 * Loaded as window.BR_HELP by index.html; required in Node as
 * js/data/help-content.js.
 *
 * Who this is written for: a Soldier standing in a gym with one hand on a
 * phone. Short sentences, second person, no contributor vocabulary - nothing
 * here refers to modules, endpoints or the repository.
 *
 * Storage is deliberately NOT touched here. The caller reads the localStorage
 * value and passes it in (see shouldShowTour), which keeps the "when do I
 * bother this user" decision testable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_HELP = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  /* localStorage key the app uses for "the Soldier has seen the tour". Kept
   * here so the test can name the same string the app writes. */
  var SEEN_KEY = "br_help_seen";

  /* ---- Quick-start tour ------------------------------------------------
   * The intended flow, in order: pick exercises -> build -> log -> review.
   * Each step names the view it lives on, so the app can send the user there
   * instead of describing a button they then have to hunt for. */
  var TOUR = [
    {
      id: "pick",
      view: "library",
      title: "Pick your exercises",
      body: "Open the Library. Every movement has a card, the doctrine it comes from, and a plate or bodyweight setup. Tap a card for the full description before you put it in a session.",
      cta: "Open the Library"
    },
    {
      id: "build",
      view: "builder",
      title: "Build the session",
      body: "In the Builder, add the movements you picked and set the sets, reps and rest. Drag the order into the warm-up, work and cool-down you want. Save it as a regiment so it is one tap next time.",
      cta: "Open the Builder"
    },
    {
      id: "log",
      view: "tracker",
      title: "Log what you actually did",
      body: "The Tracker is the session on the floor. Start it, work each item, and tick off sets as you go. If you stop early, log what you did. A session you did not log does not exist on your chart.",
      cta: "Open the Tracker"
    },
    {
      id: "review",
      view: "progress",
      title: "Review your progress",
      body: "Progress turns your logged sessions into volume per muscle group, weigh-ins and AFT scores. It is the only screen that tells you whether the last six weeks actually moved.",
      cta: "Open Progress"
    }
  ];

  /* ---- FAQ -------------------------------------------------------------
   * Four topics, all of them things a new Soldier asks in the first week:
   * getting started with no account, Drive sync, export/import, and what
   * happens to the data. `keywords` exist for the search box and are not
   * displayed. */
  var TOPICS = [
    { id: "start", label: "Getting started" },
    { id: "guest", label: "Guest mode" },
    { id: "drive", label: "Google Drive sync" },
    { id: "backup", label: "Export and import" },
    { id: "loss", label: "Your data" }
  ];

  var FAQ = [
    {
      id: "no-account",
      topic: "guest",
      q: "Do I need an account to use this?",
      a: "No. Open the page and it works. There is no sign-up, no email, no password prompt to get going. Anything you build or log stays on this device until you choose to send it somewhere else.",
      keywords: ["sign up", "account", "login", "register", "email"]
    },
    {
      id: "where-data-lives",
      topic: "guest",
      q: "Where is my data while I am not signed in?",
      a: "On this device, in the browser's own storage. Nothing is uploaded. That also means the data is tied to this browser: clearing site data, or opening the page in a different browser or a private window, gives you an empty app.",
      keywords: ["storage", "local", "private", "incognito", "server"]
    },
    {
      id: "guest-enough",
      topic: "guest",
      q: "Is guest mode missing anything?",
      a: "You lose only Google Drive sync. Building, logging, tracking, weigh-ins, AFT scores, timers and the export file all work exactly the same.",
      keywords: ["features", "missing", "limited"]
    },
    {
      id: "master-password",
      topic: "start",
      q: "What is the master password for?",
      a: "It is optional. If you set one in Settings, the app asks for it before it lets you change or delete a built session, so a borrowed phone cannot quietly wipe your plan. It is not a login: nothing is hidden from you and nothing is lost if you forget it.",
      keywords: ["password", "protect", "settings", "pin"]
    },
    {
      id: "regiments",
      topic: "start",
      q: "What is a regiment?",
      a: "A saved session. Build a session once, save it as a regiment, and it sits on your home screen ready to run again. Edit it any time; changes do not touch sessions you have already logged.",
      keywords: ["saved session", "save", "template", "program", "plan"]
    },
    {
      id: "what-to-log",
      topic: "start",
      q: "Do I have to log every set?",
      a: "No, but the chart only knows what you tell it. Log the sets you finished and mark the ones you dropped. Progress reads from logged sessions, so a missed log is a gap in your history, not a judgement.",
      keywords: ["skip", "logging", "sets", "partial"]
    },
    {
      id: "drive-what",
      topic: "drive",
      q: "What does Google Drive sync actually sync?",
      a: "Your plan and your history, to a folder in your own Drive. It is a backup and a way to move between devices, not a collaboration tool. Only files in the app's own folder are touched.",
      keywords: ["cloud", "google", "sync", "backed up"]
    },
    {
      id: "drive-needs-account",
      topic: "drive",
      q: "Why is Drive sync unavailable?",
      a: "This build ships without Google sign-in switched on, so the Drive section says it is not configured. Everything else works. If it is ever enabled, the button asks you to sign in to Google once and then keeps working offline, queueing changes until you are back.",
      keywords: ["not configured", "google", "sign in", "keys", "unavailable"]
    },
    {
      id: "drive-offline",
      topic: "drive",
      q: "What happens if I am offline?",
      a: "Nothing is lost. Changes are made on the device straight away and queued; the app tells you how many are waiting and pushes them the next time you are online.",
      keywords: ["offline", "no signal", "queue", "airplane"]
    },
    {
      id: "export",
      topic: "backup",
      q: "How do I back up my data?",
      a: "Settings, then Export all data. You get one JSON file holding every session, regiment, log entry, weigh-in, AFT result and setting. It works in guest mode and needs no account. Save it to your phone or send it to yourself.",
      keywords: ["json", "download", "backup", "save file", "backup"]
    },
    {
      id: "import",
      topic: "backup",
      q: "How do I restore a backup?",
      a: "Settings, then Import data, and pick the JSON file. What is on this device is replaced by what is in the file, so import into a fresh phone or a new browser. The app asks before it overwrites.",
      keywords: ["restore", "load", "json", "migrate", "new phone"]
    },
    {
      id: "import-wrong-file",
      topic: "backup",
      q: "It says the file is not a Battle Rhythm backup.",
      a: "That is what it means: the file is not the JSON this app exported, or it was edited or truncated. Export a fresh copy before you import, and keep the original - the file is the only copy once the device is gone.",
      keywords: ["invalid", "corrupt", "error", "not a backup"]
    },
    {
      id: "clear-data",
      topic: "loss",
      q: "Will clearing my browser data delete my history?",
      a: "Yes. Sessions, logs, weigh-ins and AFT results live in this browser's storage, so clearing site data for this page removes them. Export a JSON backup first if you want to be sure.",
      keywords: ["clear cache", "cookies", "delete", "browser data", "wipe"]
    },
    {
      id: "lost-phone",
      topic: "loss",
      q: "I changed phones. Where did my history go?",
      a: "With the browser storage that held it, unless you had Drive sync or a JSON export. On the new phone, import that file and your history comes back. Without one of the two, the old data is not reachable from the new device.",
      keywords: ["new phone", "upgrade", "lost", "recover", "transfer"]
    },
    {
      id: "not-medical",
      topic: "loss",
      q: "Is any of this medical advice?",
      a: "No. It is a workout planner and a training log. Doctrine references are quoted from published sources to explain the reasoning, but get a qualified medical clearance before you start any new physical training.",
      keywords: ["medical", "doctor", "injury", "advice", "clearance"]
    }
  ];

  /* ---- Pure helpers ---------------------------------------------------- */

  function clone(list) {
    return (list || []).map(function (item) {
      var out = {};
      Object.keys(item).forEach(function (k) { out[k] = item[k]; });
      return out;
    });
  }

  function steps() { return clone(TOUR); }

  function faq() { return clone(FAQ); }

  function topics() {
    return TOPICS.map(function (t) {
      return { id: t.id, label: t.label, count: FAQ.filter(function (e) { return e.topic === t.id; }).length };
    });
  }

  /* Unknown topic ids are dropped rather than rendered as an empty heading. */
  function faqByTopic(topicId) {
    if (!topicId) return [];
    return clone(FAQ.filter(function (e) { return e.topic === topicId; }));
  }

  /* Question, answer and hidden keywords all match, case- and
   * accent-insensitively by letter, so "drive" finds "Google Drive sync" and
   * "json" finds the export answer. An empty query returns the whole FAQ, in
   * order, which is what the unfiltered list shows. */
  function search(query) {
    var q = String(query == null ? "" : query).trim().toLowerCase();
    if (!q) return clone(FAQ);
    var terms = q.split(/\s+/);
    return clone(FAQ.filter(function (e) {
      var hay = (e.q + " " + e.a + " " + (e.keywords || []).join(" ")).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    }));
  }

  /* The first-run gate. `stored` is the raw value of SEEN_KEY, or anything at
   * all - a JSON string, a parsed object, null, undefined or junk - and this
   * answers the only question that matters: should we interrupt this Soldier
   * with the tour right now?
   *
   * Anything unrecognised counts as "not seen", so a corrupt or hand-edited
   * value cannot lock the tour away permanently. A completed tour is never
   * forced back on; the Help button and Settings reopen it any time. */
  function shouldShowTour(stored) {
    var value = stored;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch (e) { return true; }
    }
    if (!value || typeof value !== "object") return true;
    return value.done !== true;
  }

  /* What to persist after the Soldier closes the tour, whatever they clicked
   * on the way out. Returning a fresh object keeps the caller from mutating
   * anything the module holds. */
  function seenRecord(stepsSeen) {
    var n = Number(stepsSeen);
    return { done: true, stepsSeen: isFinite(n) && n > 0 ? Math.floor(n) : 0, seenAt: null };
  }

  /* "Step 2 of 4" - the tour footer. Clamped, so a stale index from a
     * longer list can never render "Step 9 of 4" or divide by zero.
     *
     * `total` is an argument rather than TOUR.length so the zero-tour branch is
     * reachable from a test: an unreachable clamp is a clamp nobody has ever
     * checked, and this is the code that decides what the user reads. */
    function progress(index, totalOverride) {
      var total = totalOverride == null ? TOUR.length : Number(totalOverride);
      if (!(total > 0)) return { index: 0, total: 0, label: "" };
      var i = Number(index);
      if (!isFinite(i)) i = 0;
      i = Math.max(0, Math.min(Math.floor(total) - 1, Math.floor(i)));
      return { index: i, total: Math.floor(total), label: "Step " + (i + 1) + " of " + Math.floor(total) };
    }

  return {
    SEEN_KEY: SEEN_KEY,
    steps: steps,
    faq: faq,
    topics: topics,
    faqByTopic: faqByTopic,
    search: search,
    shouldShowTour: shouldShowTour,
    seenRecord: seenRecord,
    progress: progress
  };
});