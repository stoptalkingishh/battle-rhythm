"use strict";
/* Unit tests for the in-app help content (js/data/help-content.js) using only
 * Node built-ins. Run: node --test tests/
 *
 * Three things are being guarded here, and the last one is the point of the
 * file:
 *   1. the CONTENT shape - a quick-start that actually covers pick -> build ->
 *      log -> review, and an FAQ that actually answers the four things issue
 *      #17 names (guest mode, Drive sync, export/import, data loss);
 *   2. the pure functions - search, topic grouping, tour gating, progress;
 *   3. the copy itself, which is shipped to end users: every entry is readable
 *      at a glance on a phone, and no entry leaks contributor vocabulary.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HELP = require("../js/data/help-content.js");

const ROOT = path.join(__dirname, "..");

/* Issue #17: "pick exercises -> build -> log -> review". The tour ids are the
 * specification of that order. */
const EXPECTED_FLOW = ["pick", "build", "log", "review"];

/* The four FAQ subjects the issue requires. Each must be a real topic with at
 * least one entry, not a keyword hit somewhere. */
const REQUIRED_TOPICS = ["guest", "drive", "backup", "loss"];

test("the quick-start covers the intended flow in order", () => {
  assert.deepEqual(HELP.steps().map(s => s.id), EXPECTED_FLOW);
});

/* Words each step must actually use about its own stage. A copy pass that
 * rewrote the bodies into generic filler would otherwise sail through the
 * ordering assertion. */
const STAGE_WORDS = [
  ["library", "exercise", "movement", "card"],
  ["builder", "build", "regiment", "sets", "rest", "reps"],
  ["tracker", "log", "logged", "tick", "session"],
  ["progress", "chart", "volume", "score", "weigh-in"]
];

test("the flow is spelled out end to end, not just present", () => {
  /* Ordered ids alone would still pass with the titles shuffled, so the
   * titles are pinned to the flow the issue describes. */
  assert.deepEqual(HELP.steps().map(s => s.title), [
    "Pick your exercises",
    "Build the session",
    "Log what you actually did",
    "Review your progress"
  ]);
  /* Each step's body must talk about its own stage. */
  HELP.steps().forEach((step, i) => {
    const body = step.body.toLowerCase();
    const about = STAGE_WORDS[i].some(w => body.indexOf(w) !== -1);
    assert.ok(about, `${step.id}: body never mentions its own stage (${STAGE_WORDS[i].join("/")})`);
  });
  /* ...and the cta sends the user to that stage's view, not to Home. */
  assert.deepEqual(HELP.steps().map(s => s.view), ["library", "builder", "tracker", "progress"]);
});

test("every tour step is renderable and names where it happens", () => {
  const steps = HELP.steps();
  assert.ok(steps.length >= 4, "at least the four flow steps");
  const views = ["home", "library", "builder", "tracker", "doctrine", "progress"];
  for (const step of steps) {
    assert.equal(typeof step.id, "string");
    assert.ok(step.id.length > 0, "step has an id");
    assert.ok(views.includes(step.view), `${step.id}: view "${step.view}" is a real view`);
    assert.ok(step.title && step.title.length > 0, `${step.id}: has a title`);
    assert.ok(step.body && step.body.length > 0, `${step.id}: has body copy`);
    assert.ok(step.cta && step.cta.length > 0, `${step.id}: has a next action`);
    assert.equal(/#|\$\(|document|window\./.test(step.body), false,
      `${step.id}: body must not contain markup or code`);
  }
});

test("step ids are unique, or the tour cannot address a step", () => {
  const ids = HELP.steps().map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the FAQ covers guest mode, Drive sync, export/import and data loss", () => {
  const topics = HELP.topics();
  const ids = topics.map(t => t.id);
  /* Labels are pinned too: the four subjects must be findable by the word a
   * Soldier would look for, not just present under an internal id. */
  assert.deepEqual(topics.map(t => t.label), [
    "Getting started",
    "Guest mode",
    "Google Drive sync",
    "Export and import",
    "Your data"
  ]);
  for (const topic of REQUIRED_TOPICS) {
    assert.ok(ids.includes(topic), `FAQ is missing the "${topic}" topic`);
    assert.ok(HELP.faqByTopic(topic).length > 0, `no entries under "${topic}"`);
  }
  /* Every subject needs more than a single entry - one answer per topic is a
   * stub, and "data loss" in particular is asked in several ways. */
  assert.ok(HELP.faqByTopic("loss").length >= 3, "data loss is asked in several ways");
  assert.ok(HELP.faqByTopic("guest").length >= 2);
});

test("topic counts match the entries actually filed under each topic", () => {
  for (const topic of HELP.topics()) {
    assert.equal(topic.count, HELP.faqByTopic(topic.id).length,
      `${topic.id}: reported count disagrees with faqByTopic`);
  }
});

test("every FAQ entry is complete, filed under a real topic, and addressable", () => {
  const topics = new Set(HELP.topics().map(t => t.id));
  const ids = [];
  for (const entry of HELP.faq()) {
    assert.ok(entry.id, "entry has an id");
    ids.push(entry.id);
    assert.ok(topics.has(entry.topic), `${entry.id}: topic "${entry.topic}" is not declared`);
    assert.ok(entry.q && entry.q.trim().length > 0, `${entry.id}: has a question`);
    assert.ok(entry.a && entry.a.trim().length > 0, `${entry.id}: has an answer`);
    assert.ok(Array.isArray(entry.keywords), `${entry.id}: keywords is an array`);
    assert.ok(entry.keywords.length > 0, `${entry.id}: keywords make it findable`);
  }
  assert.equal(new Set(ids).size, ids.length, "FAQ ids are unique");
  assert.ok(HELP.faq().length >= 8, "an FAQ this thin is not an FAQ");
});

test("an unknown or empty topic returns nothing rather than a blank heading", () => {
  assert.deepEqual(HELP.faqByTopic("nope"), []);
  assert.deepEqual(HELP.faqByTopic(""), []);
  assert.deepEqual(HELP.faqByTopic(null), []);
});

test("search matches question, answer and hidden keywords, case-insensitively", () => {
  assert.ok(HELP.search("drive").some(e => e.topic === "drive"), "question/keyword match");
  assert.ok(HELP.search("JSON").some(e => e.id === "export"), "answer text match, lowercased");
  assert.ok(HELP.search("incognito").some(e => e.id === "where-data-lives"),
    "hidden keyword match");
});

test("a multi-word query narrows: every term must match, not just one", () => {
  /* Asserted as an exact set, not a .some() hit. "Clearing site data" must not
   * return every entry that mentions any one of those words, which is what a
   * match-any implementation would do. */
  assert.deepEqual(HELP.search("clearing site data").map(e => e.id),
    ["where-data-lives", "clear-data"],
    "both entries genuinely mention all three words; a match-any build returns many more");
  assert.deepEqual(HELP.search("offline queued").map(e => e.id), ["drive-offline"]);
  /* Order is narrowest-match-first as terms are added, so a nonsense pairing
   * of two real terms legitimately returns nothing rather than everything. */
  assert.deepEqual(HELP.search("incognito json"), []);
  /* And a term present in neither the question nor the answer is only
   * findable through a hidden keyword. */
  assert.deepEqual(HELP.search("airplane").map(e => e.id), ["drive-offline"]);
});

test("search with no usable query returns the whole FAQ in file order", () => {
  assert.deepEqual(HELP.search("").map(e => e.id), HELP.faq().map(e => e.id));
  assert.deepEqual(HELP.search("   ").map(e => e.id), HELP.faq().map(e => e.id));
  assert.deepEqual(HELP.search(null).map(e => e.id), HELP.faq().map(e => e.id));
});

test("search tolerates a missing query without throwing", () => {
  assert.deepEqual(HELP.search(undefined).map(e => e.id), HELP.faq().map(e => e.id));
});

test("a query nothing matches returns an empty list, not everything", () => {
  const none = HELP.search("zzqqxx unrelated");
  assert.deepEqual(none, []);
});

test("a Soldier who has finished the tour is not shown it again", () => {
  assert.equal(HELP.shouldShowTour(null), true);
  assert.equal(HELP.shouldShowTour(undefined), true);
  assert.equal(HELP.shouldShowTour(JSON.stringify({ done: true, stepsSeen: 4 })), false);
  assert.equal(HELP.shouldShowTour({ done: true }), false);
});

test("an unfinished or unreadable seen-record still shows the tour", () => {
  /* A corrupt value must not lock the tour away forever - that is the failure
   * mode this rule exists to prevent. */
  assert.equal(HELP.shouldShowTour("{not json"), true);
  assert.equal(HELP.shouldShowTour(""), true);
  assert.equal(HELP.shouldShowTour(0), true);
  assert.equal(HELP.shouldShowTour({ done: false }), true);
  assert.equal(HELP.shouldShowTour({ stepsSeen: 2 }), true, "seen but not finished");
  assert.equal(HELP.shouldShowTour({ done: "true" }), true, "only boolean true counts");
});

test("seenRecord marks the tour done and normalises the step count", () => {
  assert.deepEqual(HELP.seenRecord(4), { done: true, stepsSeen: 4, seenAt: null });
  assert.deepEqual(HELP.seenRecord("3"), { done: true, stepsSeen: 3, seenAt: null });
  assert.deepEqual(HELP.seenRecord(-2), { done: true, stepsSeen: 0, seenAt: null });
  assert.deepEqual(HELP.seenRecord("nonsense"), { done: true, stepsSeen: 0, seenAt: null });
  assert.equal(HELP.shouldShowTour(HELP.seenRecord(1)), false);
});

test("seenRecord returns a fresh object each call", () => {
  const a = HELP.seenRecord(2);
  a.stepsSeen = 99;
  assert.equal(HELP.seenRecord(2).stepsSeen, 2, "caller mutation must not leak back in");
});

test("progress labels the tour and clamps a stale index", () => {
  const total = HELP.steps().length;
  assert.deepEqual(HELP.progress(0), { index: 0, total, label: `Step 1 of ${total}` });
  assert.deepEqual(HELP.progress(total - 1), { index: total - 1, total, label: `Step ${total} of ${total}` });
  assert.equal(HELP.progress(-5).index, 0, "negative clamps to the first step");
  assert.equal(HELP.progress(99).index, total - 1, "past the end clamps to the last step");
  assert.equal(HELP.progress("2").index, 2, "a stringified index from a list button works");
  assert.equal(HELP.progress(undefined).index, 0);
});

test("progress with no steps produces no label rather than 'Step 1 of 0'", () => {
  /* Reachable only via the total argument, which is why it is one. */
  assert.deepEqual(HELP.progress(0, 0), { index: 0, total: 0, label: "" });
  assert.deepEqual(HELP.progress(3, 0), { index: 0, total: 0, label: "" });
  /* A non-numeric override must not produce "Step NaN of NaN". */
  assert.deepEqual(HELP.progress(0, "four"), { index: 0, total: 0, label: "" });
  /* A null/undefined override means "use the real tour", not "no tour". */
  const total = HELP.steps().length;
  assert.deepEqual(HELP.progress(0, null), { index: 0, total, label: `Step 1 of ${total}` });
  assert.deepEqual(HELP.progress(0, undefined), { index: 0, total, label: `Step 1 of ${total}` });
  /* An override shorter than the real tour still clamps to ITS last step. */
  assert.deepEqual(HELP.progress(9, 2), { index: 1, total: 2, label: "Step 2 of 2" });
});

test("returned lists are copies - the app cannot corrupt the shipped copy", () => {
  const first = HELP.faq()[0];
  first.a = "tampered";
  first.keywords.push("tampered");
  assert.notEqual(HELP.faq()[0].a, "tampered", "faq() hands back fresh objects");
  HELP.steps()[0].title = "tampered";
  assert.notEqual(HELP.steps()[0].title, "tampered", "steps() too");
  HELP.faqByTopic("guest")[0].q = "tampered";
  assert.notEqual(HELP.faqByTopic("guest")[0].q, "tampered", "faqByTopic() too");
});

test("content is written for a Soldier on a phone, not a contributor", () => {
  /* The copy ships to end users, so it must not mention the machinery. Any hit
   * here means the wording drifted back to contributor vocabulary. */
  const jargon = /\b(module|global|UMD|localStorage|repo|repository|commit|PR\b|npm|node\b|CI\b|test suite|cache-?buster|config\.js|app\.js|index\.html|endpoint|API key)/i;
  for (const step of HELP.steps()) {
    assert.equal(jargon.test(step.title + " " + step.body + " " + step.cta), false,
      `${step.id}: contributor vocabulary in the tour`);
  }
  for (const entry of HELP.faq()) {
    assert.equal(jargon.test(entry.q + " " + entry.a), false,
      `${entry.id}: contributor vocabulary in the FAQ`);
  }
});

test("entries stay scannable on a small screen", () => {
  /* Not a character budget - a smoke test. A paragraph-long FAQ answer is the
   * failure mode: nobody reads it on a phone in a gym. */
  for (const entry of HELP.faq()) {
    assert.ok(entry.q.length <= 80, `${entry.id}: question is too long for a phone (${entry.q.length})`);
    assert.ok(entry.a.length <= 480, `${entry.id}: answer is too long for a phone (${entry.a.length})`);
    assert.equal(entry.a.split("\n").length, 1, `${entry.id}: one paragraph per answer`);
  }
  for (const step of HELP.steps()) {
    assert.ok(step.body.length <= 480, `${step.id}: step body too long (${step.body.length})`);
  }
});

test("every element the help UI reaches for exists in index.html", () => {
  /* The renderer is not unit-testable without a DOM, so this is the guard for
   * it: a `#help-*` id the app queries but the page never ships makes that one
   * call throw and silently disables help. Parsed out of the app's own help
   * block, so a new id is checked the moment it is written.
   *
   * INJECTED lists ids the renderer creates itself through el(); those are not
   * in index.html by design and are checked to be injected instead. */
  const INJECTED = new Set(["help-faq-list", "help-search"]);
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const start = app.indexOf("Help: quick-start tour + FAQ");
  const end = app.indexOf("Google Drive backup section", start);
  assert.ok(start !== -1 && end > start, "the help block is where this test looks for it");
  /* The character class includes digits on purpose: a hand-edited id like
     * #help-b0dy must still be collected, or a rename escapes this check. */
  const ids = new Set(
      (app.slice(start, end).match(/\$\("(#help-[a-zA-Z0-9_-]+)"\)/g) || [])
        /* Strip `$("` and `")` to leave the bare id. */
        .map(s => s.replace(/^\$\("#/, "").replace(/"\)$/, ""))
  );
  assert.ok(ids.size >= 6, `found ${ids.size} help ids in app.js - expected the whole UI`);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const id of ids) {
    if (INJECTED.has(id)) {
      /* The renderer must actually build these, or the guard above is a lie
       * and the FAQ silently renders nothing. */
      assert.ok(app.slice(start, end).includes(`id: "${id}"`),
        `${id} is in INJECTED but the renderer never creates it`);
      continue;
    }
    assert.ok(html.includes(`id="${id}"`), `index.html has no element with id="${id}"`);
  }
});

test("the Settings entries and the topbar button the help UI needs are present", () => {
  /* These three are the entry points issue #17 asks for - an FAQ "reachable
   * from Settings" and a tour a first-time user can find. A missing id means
   * the feature is unreachable and nothing else in this suite notices. */
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const id of ["help-btn", "help-open-tour", "help-open-faq"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing ${id}`);
  }
  /* The script tag must exist and carry the shared cache-buster, or a deploy
   * silently serves a stale help module (or none). */
  assert.ok(/<script src="js\/data\/help-content\.js\?v=battle-rhythm-\d+"><\/script>/.test(html),
    "help-content.js is not loaded with the shared cache-buster tag");
});

test("the app stores the tour flag under the key the module names", () => {
  /* Cross-file, because a renamed key is the failure mode shouldShowTour
   * cannot see: the module writes one string and the app reads another, so the
   * tour reopens on every visit forever. app.js must go through HELP.SEEN_KEY
   * rather than repeating the literal - otherwise the two can drift apart with
   * nothing noticing. */
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.equal(/"br_help_seen"/.test(app), false,
    "app.js hardcodes the key instead of reading HELP.SEEN_KEY");
  assert.ok(app.includes("HELP.SEEN_KEY"),
    "app.js must read the key from the module, not restate it");
  /* With app.js reading through the module, a rename on the module side alone
   * is invisible from app.js - so the key itself is pinned here. Changing it
   * retires real seen-flags on live devices, which is a deliberate act. */
  assert.equal(HELP.SEEN_KEY, "br_help_seen",
    "the storage key changed; existing users will be shown the tour again");
});

test("the medical caveat survives a copy edit", () => {
  /* This app plans physical training for Service members. Dropping the
   * clearance line from the FAQ is not a copy change, it is a safety one. */
  const med = HELP.faq().find(e => e.id === "not-medical");
  assert.ok(med, "the not-a-medical-advice entry exists");
    assert.equal(med.q, "Is any of this medical advice?", "the question names the worry");
    /* The answer must refuse plainly ("No.") and then point at clearance - a
     * hedge here would leave a Soldier training on a clearance they do not have. */
    assert.ok(/^No\./.test(med.a), "the answer refuses outright before anything else");
    assert.ok(/medical clearance/i.test(med.a), "and it points at getting clearance");
  assert.equal(med.topic, "loss", "filed under Your data, where a Soldier looks for caveats");
});

test("the data-loss answers are the blunt ones the issue asks for", () => {
  const clear = HELP.faqByTopic("loss").find(e => e.id === "clear-data");
  assert.ok(/yes/i.test(clear.a), "clearing browser data must be stated as a loss, not hedged");
  const guest = HELP.faqByTopic("guest").find(e => e.id === "no-account");
  assert.ok(/no\b/i.test(guest.a), "guest mode must open by saying no account is needed");
});

test("answers never leave a Soldier worse off than they found themselves", () => {
  /* Each of these is a specific promise the copy makes. A rewording that drops
   * one is a support ticket, so they are pinned rather than left to review. */
  const byId = id => HELP.faq().find(e => e.id === id);
  /* Forgetting the master password must be stated as losing nothing. */
  assert.ok(/forget it/i.test(byId("master-password").a),
    "the master-password answer must say forgetting it costs nothing");
  assert.ok(/not a login/i.test(byId("master-password").a),
    "and must say it is not a login");
  /* Guest mode must state what it does not cost you, not just that it is free. */
  assert.ok(/drive/i.test(byId("guest-enough").a), "guest mode names what it does without");
  /* Offline must promise nothing is lost, not merely describe queuing. */
  assert.ok(/nothing is lost/i.test(byId("drive-offline").a), "offline promises no loss");
  /* Restore must warn that it replaces what is on the device. */
  assert.ok(/is replaced by/i.test(byId("import").a), "import warns it replaces device data");
  assert.ok(/asks before it overwrites/i.test(byId("import").a), "and says it asks first");
});