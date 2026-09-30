"use strict";
/* Tests for the doctrine provenance registry (js/data/doctrine-sources.js) and
 * for the consistency guard it provides over the real doctrine data files.
 *
 * Run: node --test tests/  (or `npm test`)
 *
 * Three groups of assertion:
 *  1. The registry's own shape — every source has an id, a publication, and an
 *     honest edition record; a source whose edition is not verified must not
 *     display an edition as fact.
 *  2. Pure logic — age arithmetic, review status, citation segmentation.
 *  3. The guard, run against the ACTUAL citations in doctrine.js,
 *     exercises.js and exercises-atp.js. This is the part that earns the file:
 *     a doctrine record cannot claim a paragraph that no source entry covers.
 *
 * The guard is only worth anything if it can fail, so
 * tests/doctrine-sources.test.js is mutation-checked: adding a record citing a
 * paragraph no source covers must fail the suite. See the PR description.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const REG = require("../js/data/doctrine-sources.js");

/* js/data/*.js are browser scripts assigning window.BR_*. Loading one with an
 * empty window is how tests/data-integrity.test.js reads them. */
function loadData(file) {
  const src = fs.readFileSync(path.join(ROOT, "js/data", file + ".js"), "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx, { filename: file + ".js" });
  return ctx.window;
}

/* Every citation string the doctrine data files actually contain, with a
 * locator (path) so a failure names the offending record. */
function citationsFrom() {
  const out = [];
  const doctrine = loadData("doctrine").BR_DOCTRINE;
  (function walk(value, pathStr) {
    if (Array.isArray(value)) {
      value.forEach(function (v, i) { walk(v, pathStr + "[" + i + "]"); });
    } else if (value && typeof value === "object") {
      if (typeof value.citation === "string") {
        out.push({ citation: value.citation, why: "doctrine.js " + pathStr });
      }
      Object.keys(value).forEach(function (k) {
        if (k !== "citation") walk(value[k], pathStr + "." + k);
      });
    }
  })(doctrine, "BR_DOCTRINE");

  const roster = loadData("exercises").BR_EXERCISES
    .concat(loadData("exercises-atp").BR_ATP_EXERCISES);
  roster.forEach(function (e) {
    if (typeof e.source === "string") {
      out.push({ citation: e.source, why: "exercises[" + e.id + "].source" });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. Registry shape                                                    */
/* ------------------------------------------------------------------ */

test("every source has an id, a publication and a url", () => {
  const seen = new Set();
  for (const src of REG.SOURCES) {
    assert.ok(src.id, "a source has no id");
    assert.ok(!seen.has(src.id), `duplicate source id: ${src.id}`);
    seen.add(src.id);
    assert.ok(src.publication && src.publication.length > 3, `${src.id}: no publication title`);
    assert.ok(/^https:\/\//.test(src.url), `${src.id}: url is not https: ${src.url}`);
    assert.ok(src.publisher && src.publisher.length > 1, `${src.id}: no publisher`);
  }
  assert.ok(REG.SOURCES.length >= 15, `registry shrank to ${REG.SOURCES.length} sources`);
});

test("edition strings are only recorded where they were verified", () => {
  for (const src of REG.SOURCES) {
    if (src.edition) {
      assert.ok(
        src.editionVerified === true || /unverified|not verified|UNVERIFIED/i.test(src.editionNote),
        `${src.id}: carries edition "${src.edition}" without either editionVerified or an ` +
        "honest note saying it is unverified"
      );
      assert.ok(
        src.editionNote && src.editionNote.length > 20,
        `${src.id}: edition has no note explaining where the string came from`
      );
    }
    if (src.editionVerified === true) {
      assert.ok(src.verifiedOn && /^\d{4}-\d{2}-\d{2}$/.test(src.verifiedOn),
        `${src.id}: editionVerified with no ISO verifiedOn date`);
      assert.ok(src.edition, `${src.id}: editionVerified true but no edition recorded`);
    } else {
      assert.equal(src.edition, null,
        `${src.id}: edition recorded without verification - prefer null over a guess`);
      assert.equal(src.verifiedOn, null,
        `${src.id}: verifiedOn set without editionVerified`);
    }
  }
});

test("editionLabel marks an unverified edition rather than stating it", () => {
  const verified = REG.source("fm-7-22");
  assert.ok(REG.editionLabel(verified).includes("2020"),
    `fm-7-22 edition should carry its date, got "${REG.editionLabel(verified)}"`);
  const unverified = REG.source("fm-4-25-11");
  assert.equal(REG.editionLabel(unverified), "edition unverified",
    "an unverified source must not display an edition");
});

test("every data file records a lastVerified date, a scope and real sources", () => {
  const seen = new Set();
  assert.ok(REG.DATA_FILES.length >= 7, "registry should cover all seven doctrine data files");
  for (const f of REG.DATA_FILES) {
    assert.ok(!seen.has(f.file), `duplicate data file entry: ${f.file}`);
    seen.add(f.file);
    assert.ok(fs.existsSync(path.join(ROOT, f.file)), `${f.file}: listed but not on disk`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(f.lastVerified),
      `${f.file}: lastVerified is not an ISO date: ${f.lastVerified}`);
    assert.ok(f.cadenceMonths >= 1 && f.cadenceMonths <= 24,
      `${f.file}: implausible review cadence ${f.cadenceMonths}`);
    assert.ok(f.verifiedScope && f.verifiedScope.length > 30,
      `${f.file}: no verifiedScope stating what the check actually covered`);
    assert.ok(f.sourceIds.length > 0, `${f.file}: no sources declared`);
    for (const id of f.sourceIds) assert.ok(REG.source(id), `${f.file}: unknown source id ${id}`);
  }
  /* The five files the issue named, plus the two figure/exercise files the
   * doctrine citations reach into. */
  for (const required of ["js/data/doctrine.js", "js/data/aft-standards.js",
    "js/data/aft-results.js", "js/data/movement-guides.js"]) {
    assert.ok(REG.dataFile(required), `no provenance record for ${required}`);
  }
});

test("checkDataFileRefs and unownedSources are clean", () => {
  assert.deepEqual(REG.checkDataFileRefs(), []);
  assert.deepEqual(REG.unownedSources(), [],
    "every registered source must be owned by at least one data file");
});

/* ------------------------------------------------------------------ */
/* 2. Pure logic                                                        */
/* ------------------------------------------------------------------ */

test("ageInMonths measures whole months and treats a missing date as unknown", () => {
  assert.equal(REG.ageInMonths("2026-09-30", "2026-09-30"), 0);
  assert.equal(REG.ageInMonths("2026-09-30", "2026-10-30"), 1);
  assert.equal(REG.ageInMonths("2026-09-30", "2027-09-30"), 12);
  assert.equal(REG.ageInMonths(null, "2027-09-30"), null,
    "a file with no lastVerified date has unknown age, not zero age");
  assert.equal(REG.ageInMonths("not-a-date", "2027-09-30"), null);
});

test("daysBetween returns whole days across a leap boundary", () => {
  assert.equal(REG.daysBetween("2026-01-01", "2026-12-31"), 364);
  assert.equal(REG.daysBetween("2028-01-01", "2028-03-01"), 60);
  assert.equal(REG.daysBetween("2026-09-30", "2026-09-30"), 0);
});

test("reviewStatus flags a file as overdue once it passes the threshold", () => {
  const now = "2027-04-01";
  const rows = REG.reviewStatus(now);
  const doctrine = rows.find(r => r.file === "js/data/doctrine.js");
  assert.equal(doctrine.ageMonths, 6, "2026-09-30 -> 2027-04-01 is about six months");
  assert.equal(doctrine.overdue, true, "six months at a six-month threshold must flag overdue");
  assert.equal(doctrine.ageDays, 183);
  assert.equal(REG.reviewStatus("2026-10-01").find(r => r.file === "js/data/doctrine.js").overdue, false,
    "one month after verification is not overdue");
  assert.ok(REG.overdueFiles(now).length > 0);
  assert.equal(REG.overdueFiles("2026-09-30").length, 0,
    "nothing is overdue on the day the registry was reviewed");
});

test("every reviewed row carries a machine-readable lastVerified date", () => {
  const rows = REG.reviewStatus("2026-09-30");
  assert.equal(rows.length, REG.DATA_FILES.length);
  for (const r of rows) {
    assert.match(r.lastVerified, /^\d{4}-\d{2}-\d{2}$/, `${r.file}: no ISO lastVerified`);
    assert.equal(r.unverified, false, `${r.file}: should not be unverified`);
    assert.ok(r.verifiedScope.length > 30, `${r.file}: no scope recorded for the UI`);
  }
});

test("segments attributes a bare locator to the publication before it", () => {
  const segs = REG.segments("FM 7-22, Table 6-2; para 3-5");
  assert.equal(segs.length, 1, "only one publication is named here");
  assert.equal(segs[0].token, "FM 7-22");
  assert.equal(segs[0].text, ", Table 6-2; para 3-5");

  const two = REG.segments("TB MED 508; FM 4-25.11; FM 4-25.12");
  assert.deepEqual(two.map(s => s.token), ["TB MED 508", "FM 4-25.11", "FM 4-25.12"]);
});

test("segments does not match a publication code inside a longer string", () => {
  assert.deepEqual(REG.segments("FM 7-222 is not a publication"), []);
});

test("locatorsIn finds paragraphs, ranges, tables, chapters, pages and drills", () => {
  assert.deepEqual(REG.locatorsIn(", paras 1-1 through 1-8").map(l => l.value), ["1-1", "1-8"]);
  assert.deepEqual(REG.locatorsIn(" Table 6-2").map(l => l.value), ["6-2"]);
  assert.deepEqual(REG.locatorsIn(" Chapter 3").map(l => l.value), ["3"]);
  assert.deepEqual(REG.locatorsIn(" pp. 11-1/11-2").map(l => l.value), ["11-1", "11-2"]);
  assert.deepEqual(REG.locatorsIn("QUOTE: CD1 Ex 3").map(l => l.value), ["CD1 Ex 3"]);
});

/* ------------------------------------------------------------------ */
/* 3. The guard, against the real data                                  */
/* ------------------------------------------------------------------ */

test("every citation in the doctrine data files resolves to a registered source", () => {
  const all = citationsFrom();
  assert.ok(all.length >= 300, `expected the full citation population, got ${all.length}`);
  const issues = REG.checkCitations(all);
  assert.deepEqual(issues, [], "unregistered citations:\n" + issues.join("\n"));
});

test("checkCitation rejects a paragraph the source entry does not cover", () => {
  const issues = REG.checkCitation("FM 7-22, para 99-9");
  assert.equal(issues.length, 1);
  assert.match(issues[0], /fm-7-22 covers no paragraph 99-9/);
});

test("checkCitation accepts a paragraph the source entry does cover", () => {
  assert.deepEqual(REG.checkCitation("FM 7-22, para 6-14"), []);
  assert.deepEqual(REG.checkCitation("FM 7-22, Table 6-2"), []);
  assert.deepEqual(REG.checkCitation("FM 7-22, Chapter 3"), []);
  assert.deepEqual(REG.checkCitation("FM 7-22, paras 12-19 through 12-22"), []);
});

test("checkCitation rejects a table, chapter and drill no source covers", () => {
  assert.match(REG.checkCitation("FM 7-22, Table 99-1")[0], /no table 99-1/);
  assert.match(REG.checkCitation("FM 7-22, Chapter 99")[0], /no chapter 99/);
  assert.match(REG.checkCitation("QUOTE: ZZ9 Ex 4")[0], /no source entry/,
    "an unregistered drill abbreviation must not pass silently");
});

test("checkCitation rejects an unregistered publication entirely", () => {
  assert.match(REG.checkCitation("AR 999-99, para 1-1")[0], /no registered publication/);
  assert.match(REG.checkCitation("Unattributed wisdom")[0], /no registered publication/);
});

test("checkCitation rejects a second source's locator under the wrong publication", () => {
  // A paragraph that IS in FM 7-22's covers, cited as if it were AR 40-5's.
  const issues = REG.checkCitation("AR 40-5, para 6-14");
  assert.equal(issues.length, 1);
  assert.match(issues[0], /ar-40-5 covers no paragraph 6-14/);
});

test("app-authored citations must be registered to pass", () => {
  assert.deepEqual(REG.checkCitation("PAR - adapted, common H2F field exercise"), []);
  assert.deepEqual(REG.checkCitation("QUOTE: AFT event"), []);
  assert.ok(REG.APP_AUTHORED.length >= 5);
  assert.match(REG.checkCitation("PARAPHRASE OF SOMETHING UNREGISTERED")[0],
    /no registered publication/,
    "a near-miss on a registered prefix must still fail");
});

test("checkCitations reports the offending record path", () => {
  const issues = REG.checkCitations([
    { citation: "FM 7-22, para 1-23", why: "ok-record" },
    { citation: "FM 7-22, para 99-9", why: "js/data/doctrine.js overview[0]" }
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /js\/data\/doctrine\.js overview\[0\]/);
});
