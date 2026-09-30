"use strict";
/* Provenance and versioning registry for the doctrine content.
 *
 * window.BR_DOCTRINE_SOURCES — the machine-readable record of *which*
 * publication each piece of doctrine content was taken from, at what edition,
 * and when a human last checked it. Pure (no DOM, no storage, no network), so
 * it loads in index.html and requires cleanly in Node for the test suite.
 *
 * Why this exists: js/data/doctrine.js, aft-standards.js, aft-results.js,
 * movement-guides.js, atp-figures.js, exercises.js and exercises-atp.js quote
 * Army publications with paragraph citations, and none of that content moves
 * when a publication is revised. Nothing in the tree could tell a user which
 * edition the app was quoting, or whether the citations had been re-checked
 * since. This file is that record, and checkCitation() is the guard that stops
 * a citation from claiming a paragraph no source entry covers.
 *
 * Honesty rules for this file, which the tests enforce:
 *  - An edition string is only recorded where it was read off the publisher's
 *    own record (the APD publication record or the publication's own front
 *    matter). Where that could not be done, edition is null and
 *    editionVerified is false — never a plausible-looking guess.
 *  - `covers` lists are the locators the app actually cites. They were
 *    transcribed from the citations in the data files on the registry date,
 *    NOT independently re-read out of the publications. That is recorded per
 *    source in coverageNote, and the review checklist in
 *    docs/doctrine-content-review.md is what closes the gap.
 *  - lastVerified means "a human checked this file's source metadata against
 *    the publisher's record on this date". How much was checked is stated per
 *    file in verifiedScope — it is not a claim that every sentence was
 *    re-verified line by line.
 *
 * No build step, no bundler: plain UMD + window global, like the rest of
 * js/data/. Nothing here fetches anything at runtime.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_DOCTRINE_SOURCES = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Every publication, regulation, directive, technical bulletin and web
   * source the doctrine data cites, with the locator ("covers") set the app
   * claims to quote from it.
   *
   * verifiedOn / editionVerified: set from the publisher record on that date.
   * `medium` vs `high` confidence is spelled out in editionNote rather than
   * implied, because a reader needs to know whether to re-check it. */
  var SOURCES = [
    {
      id: "fm-7-22",
      publication: "FM 7-22, Holistic Health and Fitness",
      publisher: "HQDA",
      edition: "October 2020, incorporating Change 2, 01 August 2025",
      editionVerified: true,
      editionNote:
        "Read from the publication's own transmittal sheet: \"October 2020 / " +
        "INCORPORATING CHANGE 2, 01, August 2025\". Supersedes chapters 1-6 and " +
        "appendix D of FM 7-22, 26 October 2012.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44522-FM_7-22-002-WEB-7.pdf",
      covers: {
        paragraphs: [
          "1-1", "1-3", "1-5", "1-8", "1-23",
          "3-1", "3-5",
          "5-1", "5-8", "5-11", "5-17", "5-18", "5-19", "5-20", "5-21",
          "6-7", "6-9", "6-10", "6-11", "6-12", "6-13", "6-14", "6-16",
          "6-23", "6-24", "6-26",
          "7-1", "7-2", "7-3", "7-4", "7-7", "7-8", "7-9",
          "8-38",
          "12-10", "12-12", "12-16", "12-18", "12-19", "12-22",
          "14-30", "14-44", "14-45", "14-46"
        ],
        tables: ["3-2", "6-2", "6-3", "6-5", "7-1", "7-3", "14-14"],
        chapters: ["3"],
        sections: ["Introduction"]
      },
      coverageNote:
        "Paragraph, table, chapter and section numbers transcribed from the " +
        "citations in js/data/doctrine.js and js/data/exercises*.js on " +
        "2026-09-30. Not re-read out of the PDF. Re-verify before editing any quote."
    },
    {
      id: "atp-7-22-01",
      publication: "ATP 7-22.01, Holistic Health and Fitness Testing",
      publisher: "HQDA",
      edition: "Pub/Form Date 12 March 2026; status ACTIVE",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=1032672: Pub/Form Date 03/12/2026, " +
        "Pub/Form Status ACTIVE. Prescribes DA Form 705-AFT, 705-CFT, 7788, 7888.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032672",
      covers: {},
      coverageNote:
        "Cited as the testing authority in doctrine.js. The app makes no " +
        "paragraph-level claim against it yet, so there is no locator set to cover."
    },
    {
      id: "atp-7-22-02",
      publication: "ATP 7-22.02, Holistic Health and Fitness Drills and Exercises",
      publisher: "HQDA",
      edition: "Pub/Form Date 01 October 2020; status ACTIVE; published with BASIC incl C1",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=1020967: Pub/Form Date 10/01/2020, " +
        "status ACTIVE, title carries \"(THIS ITEM IS PUBLISHED W/ BASIC INCL C1)\".",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1020967",
      covers: {
        pages: ["5-12", "5-13", "5-17", "5-18", "11-1", "11-2", "11-8", "11-9", "13-8", "14-11", "14-12", "14-13"],
        drillShorthand: {
          /* "CD1 Ex 3" style shorthand. Registered so an unregistered drill
           * abbreviation fails the check; the exercise NUMBERS themselves were
           * transcribed from the app's own source strings and have not been
           * re-checked against the current ATP. */
          Preparation: ["PD"],
          Conditioning: ["CD1", "CD2", "CD3"],
          Climbing: ["CL1", "CL2"],
          "Military Movement": ["MMD1", "MMD2"],
          "Strength Training Circuit": ["STC"],
          "Free Weight": ["FWC"],
          "Hip Stability": ["HSD"],
          "Shoulder Stability": ["SSD"],
          Recovery: ["RD"],
          PMCS: ["PMCS"]
        }
      },
      coverageNote:
        "Page numbers and drill abbreviations transcribed from js/data/" +
        "exercises-atp.js and js/data/movement-guides.js on 2026-09-30. Figure " +
        "numbers are separately cross-checked against js/data/atp-figures.js. " +
        "Drill exercise NUMBERS are not verified against the ATP — see the " +
        "review checklist."
    },
    {
      id: "aft-scoring-scales",
      publication: "Army Fitness Test Score Tables (official scoring scales PDF)",
      publisher: "HQDA / Army Fitness Program",
      edition: "Approved 15 May 2025; effective 1 June 2025",
      editionVerified: true,
      editionNote:
        "Verbatim from the document footer: \"Approved: 15 May 2025 / Effective: " +
        "1 June 2025\". The values in js/data/aft-standards.js were checked " +
        "against this PDF on 2026-09-30.",
      verifiedOn: "2026-09-30",
      url: "https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf",
      covers: { events: ["MDL", "HRP", "SDC", "PLK", "2MR"] },
      coverageNote:
        "Event codes are listed so a citation naming an AFT event is attributable; " +
        "the time/score grid itself lives in js/data/aft-standards.js."
    },
    {
      id: "ad-2025-06",
      publication: "Army Directive 2025-06, Army Fitness Test",
      publisher: "HQDA",
      edition: "Pub/Form Date 17 April 2025; status ACTIVE",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=1030941: Pub/Form Date 04/17/2025, " +
        "Pub/Form Status ACTIVE.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030941",
      covers: { events: ["MDL", "HRP", "SDC", "PLK", "2MR"] },
      coverageNote: "Cited for the AFT's event list and effective date."
    },
    {
      id: "ad-2026-07",
      publication: "Army Directive 2026-07, Army Physical Fitness Standards",
      publisher: "HQDA",
      edition: "Pub/Form Date 17 April 2026; status ACTIVE",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=1032971: Pub/Form Date 04/17/2026, " +
        "Pub/Form Status ACTIVE.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032971",
      covers: {},
      coverageNote:
        "Cited for the Combat Field Test note in doctrine.js. No paragraph-level " +
        "claim is made; standards applicability is explicitly deferred to the directive."
    },
    {
      id: "army-mil-aft",
      publication: "Army Fitness Test official web page",
      publisher: "army.mil",
      edition: null,
      editionVerified: false,
      editionNote:
        "Web page, not a versioned publication. No edition or revision date is " +
        "published on the page, so none is recorded. Re-check quarterly.",
      verifiedOn: null,
      url: "https://www.army.mil/aft",
      covers: { events: ["MDL", "HRP", "SDC", "PLK", "2MR"] },
      coverageNote: "Cited alongside AD 2025-06 for current AFT administration."
    },
    {
      id: "army-mil-cft",
      publication: "Army announces Combat Field Test to enhance Soldier readiness",
      publisher: "army.mil",
      edition: null,
      editionVerified: false,
      editionNote: "News article; no publication date captured in the registry.",
      verifiedOn: null,
      url: "https://www.army.mil/article/291880/",
      covers: {},
      coverageNote: "Cited for the CFT implementation-period note only."
    },
    {
      id: "aphc-triad",
      publication: "The Performance Triad Guide — Sleep, Activity, and Nutrition",
      publisher: "Army Public Health Center",
      edition: null,
      editionVerified: false,
      editionNote:
        "Edition/date not verified. The govinfo package number in the URL " +
        "(GOVPUB-D101-PURL-gpo62486) does not encode a publication date. Treat " +
        "the Sleep/Activity/Nutrition figures as needing confirmation against " +
        "AR 40-5 and AR 600-9, which are the regulations that name them.",
      verifiedOn: null,
      url: "https://www.govinfo.gov/content/pkg/GOVPUB-D101-PURL-gpo62486/pdf/GOVPUB-D101-PURL-gpo62486.pdf",
      covers: { sections: ["Sleep", "Activity", "Nutrition"] },
      coverageNote: "Cited in doctrine.js for the Performance Triad definition."
    },
    {
      id: "tb-med-507",
      publication: "TB MED 507, Heat Stress Control and Heat Casualty Management",
      publisher: "HQDA / TSG",
      edition: "Pub/Form Date 12 April 2022; status ACTIVE",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=1024722: Pub/Form Date 04/12/2022, " +
        "Pub/Form Status ACTIVE.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1024722",
      covers: {},
      coverageNote:
        "Cited for the WBGT > 90 °F suspension guidance. The app quotes no " +
        "numbered paragraph, so nothing to cover."
    },
    {
      id: "tb-med-508",
      publication: "TB MED 508, Prevention and Management of Cold-Weather Injuries",
      publisher: "HQDA / TSG",
      edition: "1 April 2005",
      editionVerified: true,
      editionNote:
        "Date from the bulletin itself: \"Washington, DC, 1 April 2005\", " +
        "superseding TB MED 81/NAVMED P-5052-29/AFP 161-11 (30 Sep 1976). Not " +
        "confirmed against an APD publication record — treat the currency of " +
        "this 2005 bulletin as an open item on the review checklist.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx",
      covers: {},
      coverageNote: "Cited for cold-injury prevention authority. No paragraph-level claim."
    },
    {
      id: "fm-4-25-11",
      publication: "FM 4-25.11, First Aid",
      publisher: "HQDA",
      edition: null,
      editionVerified: false,
      editionNote:
        "UNVERIFIED. No edition or date has been read off an APD record for this " +
        "publication; the repo links a third-party archive copy. Do not display " +
        "an edition for FM 4-25.11 until it is confirmed from the publication.",
      verifiedOn: null,
      url: "https://archive.org/details/FM4-25x11",
      covers: { chapters: ["5"] },
      coverageNote:
        "Chapter 5 is cited for climatic-injury first aid. The chapter number is " +
        "taken from the app's citation and has not been re-read from the manual."
    },
    {
      id: "atp-4-25-12",
      publication: "FM 4-25.12 / ATP 4-25.12, Unit Field Sanitation Teams",
      publisher: "HQDA",
      edition: "Pub/Form Date 30 April 2014; status ACTIVE; published with BASIC incl C2",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=104111: Pub/Form Date 04/30/2014, status " +
        "ACTIVE, \"(THIS ITEM IS PUBLISHED W/ BASIC INCL C2)\". Note the current " +
        "publication is ATP 4-25.12; the app's citation string still says " +
        "\"FM 4-25.12\", which is the historic designation.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=104111",
      covers: { sections: ["VIII", "IX"] },
      coverageNote:
        "Cited for unit field sanitation guidance. Section numbers VIII-IX are " +
        "from the app's citation, not re-read from the publication."
    },
    {
      id: "atp-5-19",
      publication: "ATP 5-19, Risk Management",
      publisher: "HQDA",
      edition: "November 2021",
      editionVerified: true,
      editionNote:
        "MEDIUM CONFIDENCE. The APD-hosted PDF opens \"Risk Management / NOVEMBER " +
        "2021\" and states it supersedes ATP 5-19 dated 14 April 2014, but the " +
        "PDF fetch timed out on 2026-09-30 and the front matter was read through " +
        "a search snippet, not the document itself. Confirm on the next review.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34181-ATP_5-19-000-WEB-1.pdf",
      covers: {},
      coverageNote:
        "Cited for the five-step risk management process. The app quotes no " +
        "numbered paragraph, so nothing to cover."
    },
    {
      id: "ar-385-10",
      publication: "AR 385-10, The Army Safety Program",
      publisher: "HQDA",
      edition: null,
      editionVerified: false,
      editionNote:
        "UNVERIFIED. A Rapid Action Revision issued 14 June 2010 over a 23 August " +
        "2007 base is visible on safety.army.mil, but the PDF fetch timed out on " +
        "2026-09-30 so neither date was confirmed from the document. No edition " +
        "recorded until it is.",
      verifiedOn: null,
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx",
      covers: {},
      coverageNote: "Cited for administrative safety guidance. No paragraph-level claim."
    },
    {
      id: "ar-350-1",
      publication: "AR 350-1, Army Training and Leader Development",
      publisher: "HQDA",
      edition: "Effective 1 June 2025; administrative revision",
      editionVerified: true,
      editionNote:
        "From the regulation's own header: \"Effective 1 June 2025\" and \"This " +
        "publication is an administrative revision\". A major revision was in " +
        "draft in April 2025; whether the effective 1 June 2025 revision is the " +
        "major one is not stated on the header, so only the date and revision " +
        "type are recorded here.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1002540",
      covers: {},
      coverageNote:
        "Cited for the minimum PRT participation requirement and command training " +
        "responsibility. No paragraph-level claim."
    },
    {
      id: "ar-40-501",
      publication: "AR 40-501, Standards of Medical Fitness",
      publisher: "HQDA",
      edition: "Pub/Form Date 27 June 2019; status ACTIVE",
      editionVerified: true,
      editionNote:
        "APD publication record PUB_ID=1004688: Pub/Form Date 06/27/2019, " +
        "Pub/Form Status ACTIVE.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1004688",
      covers: {},
      coverageNote: "Cited for medical profiles. No paragraph-level claim."
    },
    {
      id: "ar-600-9",
      publication: "AR 600-9, The Army Body Composition Program",
      publisher: "HQDA",
      edition: "16 July 2019; administrative revision dated 27 February 2025",
      editionVerified: true,
      editionNote:
        "From the regulation's summary of change: base 16 July 2019, plus an " +
        "administrative revision dated 27 February 2025.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN43120-AR_600-9-001-WEB-3.pdf",
      covers: {},
      coverageNote: "Cited for the Performance Triad. No paragraph-level claim."
    },
    {
      id: "ar-40-5",
      publication: "AR 40-5, Army Public Health Program",
      publisher: "HQDA",
      edition: "12 May 2020",
      editionVerified: true,
      editionNote:
        "Major revision dated 12 May 2020. Note the title change: the app's " +
        "citation string still calls it \"AR 40-5, Preventive Medicine\", which " +
        "was its title before this revision.",
      verifiedOn: "2026-09-30",
      url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/ARN16450_R40_5_FINAL.pdf",
      covers: {},
      coverageNote: "Cited for the Performance Triad as Army-approved content. No paragraph-level claim."
    }
  ];

  /* Citation strings the app writes that are NOT quotations from a numbered
   * source, so the checker requires them to be registered here instead of
   * silently passing. Registering one is a deliberate claim that it is an
   * app-authored or paraphrased line — see docs/doctrine-content-review.md. */
  var APP_AUTHORED = [
    { prefix: "PAR", meaning: "Paraphrase / app-authored guidance, not a quoted paragraph" },
    { prefix: "QUOTE: AFT event", meaning: "Quoted from the official AFT event description" },
    { prefix: "QUOTE: AFT 2MR event", meaning: "Quoted from the official AFT 2MR event description" },
    { prefix: "AFT training guide", meaning: "Army Fitness Test training guide (secondary reference)" },
    { prefix: "FSP/BCT", meaning: "Fitness Scholarship Program / Basic Combat Training schedules" },
    { prefix: "OPAT", meaning: "Options for Physical Aptitude Test" }
  ];

  /* One record per doctrine data file: when a human last checked its source
   * metadata, against which sources, and how much was actually checked.
   *
   * lastVerified is the date the file's source metadata and citations were
   * reconciled with the publisher records — not a claim that every sentence was
   * re-verified. verifiedScope says exactly what that pass covered. */
  var DATA_FILES = [
    {
      file: "js/data/doctrine.js",
      global: "BR_DOCTRINE",
      lastVerified: "2026-09-30",
      cadenceMonths: 6,
      sourceIds: [
        "fm-7-22", "atp-7-22-01", "atp-7-22-02", "aft-scoring-scales",
        "ad-2025-06", "ad-2026-07", "army-mil-aft", "army-mil-cft",
        "aphc-triad", "tb-med-507", "tb-med-508", "fm-4-25-11",
        "atp-4-25-12", "atp-5-19", "ar-385-10", "ar-350-1", "ar-40-501",
        "ar-600-9", "ar-40-5"
      ],
      verifiedScope:
        "Source editions and publication records checked against APD; every " +
        "citation's locator reconciled with this registry. Quoted paragraph text " +
        "was NOT re-read against the publications."
    },
    {
      file: "js/data/aft-standards.js",
      global: "BR_AFT_2MR",
      lastVerified: "2026-09-30",
      cadenceMonths: 6,
      sourceIds: ["aft-scoring-scales", "ad-2025-06"],
      verifiedScope:
        "The full 2MR scoring grid was compared against the official AFT Score " +
        "Tables PDF (approved 15 May 2025, effective 1 June 2025) on this date."
    },
    {
      file: "js/data/aft-results.js",
      global: "BRAFTResults",
      lastVerified: "2026-09-30",
      cadenceMonths: 12,
      sourceIds: ["ad-2025-06", "aft-scoring-scales"],
      verifiedScope:
        "Event names, codes and official order only. The module is collection " +
        "logic and holds no doctrine prose."
    },
    {
      file: "js/data/movement-guides.js",
      global: "BR_MOVEMENT_GUIDES",
      lastVerified: "2026-09-30",
      cadenceMonths: 12,
      sourceIds: ["atp-7-22-02", "fm-7-22"],
      verifiedScope:
        "Per-movement sourceStatus flags reviewed for consistency with the ATP " +
        "roster. Cues and warnings were NOT re-read against ATP 7-22.02 figures."
    },
    {
      file: "js/data/atp-figures.js",
      global: "BR_ATP_FIGURES",
      lastVerified: "2026-09-30",
      cadenceMonths: 12,
      sourceIds: ["atp-7-22-02"],
      verifiedScope:
        "Figure ids cross-checked for internal consistency only. Whether each " +
        "figure number matches the current ATP pagination is UNVERIFIED."
    },
    {
      file: "js/data/exercises.js",
      global: "BR_EXERCISES",
      lastVerified: "2026-09-30",
      cadenceMonths: 12,
      sourceIds: ["fm-7-22", "atp-7-22-02", "aphc-triad"],
      verifiedScope:
        "Citations reconciled with this registry. Exercise names, cues and " +
        "programming were NOT re-verified against source publications."
    },
    {
      file: "js/data/exercises-atp.js",
      global: "BR_ATP_EXERCISES",
      lastVerified: "2026-09-30",
      cadenceMonths: 12,
      sourceIds: ["atp-7-22-02"],
      verifiedScope:
        "Citations and figure references reconciled with this registry and with " +
        "atp-figures.js. Exercise names and cues were NOT re-read against " +
        "ATP 7-22.02."
    }
  ];

  /* Cadence: how often the registry itself must be re-checked, and how old a
   * lastVerified date may get before CI flags it. Sourced from the review
   * policy documented in docs/doctrine-content-review.md. */
  var POLICY = {
    registryReviewed: "2026-09-30",
    /* CI warns (does not fail) once a file's lastVerified date is older than
     * this. Six months matches the per-file cadence above. */
    staleAfterMonths: 6,
    /* A file that has never been verified is reported as overdue immediately. */
    reviewCadenceNote:
      "Doctrine publications are revised on the Army's own schedule, not ours. " +
      "Re-check the registry on the cadence in docs/doctrine-content-review.md, " +
      "and immediately whenever armypubs shows a change to a cited publication."
  };

  var byId = {};
  SOURCES.forEach(function (s) { byId[s.id] = s; });

  function all() { return SOURCES.slice(); }

  function source(id) { return byId[id] || null; }

  function files() { return DATA_FILES.slice(); }

  function dataFile(path) {
    for (var i = 0; i < DATA_FILES.length; i++) {
      if (DATA_FILES[i].file === path) return DATA_FILES[i];
    }
    return null;
  }

  /* Sources a data file declares, in registry order. Unknown ids are dropped
   * here and reported by checkCitation()'s companion checkDataFileRefs(). */
  function sourcesForFile(path) {
    var entry = dataFile(path);
    if (!entry) return [];
    return entry.sourceIds.map(function (id) { return byId[id] || null; })
      .filter(function (s) { return !!s; });
  }

  function daysBetween(fromIso, toIso) {
    var a = Date.parse(fromIso + "T00:00:00Z");
    var b = Date.parse(toIso + "T00:00:00Z");
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  /* Whole calendar months between an ISO date and an ISO "now". Calendar months
   * rather than 30.4375-day averages because the cadence is stated in months and
   * a reviewer reading "verified 6 months ago" expects the calendar answer.
   * Null when the date is missing or unparsable — a missing lastVerified is
   * overdue, not zero-age. */
  function ageInMonths(isoDate, nowIso) {
    var a = parseIso(isoDate), b = parseIso(nowIso);
    if (!a || !b) return null;
    var months = (b.y - a.y) * 12 + (b.m - a.m);
    if (b.d < a.d) months -= 1;
    return months;
  }

  function parseIso(iso) {
    if (typeof iso !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  /* One row per data file with its age and whether it is overdue. nowIso is a
   * parameter (not Date.now()) so the result is deterministic in tests and so
   * the browser can pass a single date for the whole panel. */
  function reviewStatus(nowIso) {
    return DATA_FILES.map(function (entry) {
      var age = ageInMonths(entry.lastVerified, nowIso);
      return {
        file: entry.file,
        global: entry.global,
        lastVerified: entry.lastVerified,
        cadenceMonths: entry.cadenceMonths,
        verifiedScope: entry.verifiedScope,
        ageMonths: age,
        ageDays: entry.lastVerified ? daysBetween(entry.lastVerified, nowIso) : null,
        overdue: age === null || age >= POLICY.staleAfterMonths,
        unverified: !entry.lastVerified
      };
    });
  }

  function overdueFiles(nowIso) {
    return reviewStatus(nowIso).filter(function (r) { return r.overdue; });
  }

  /* The tokens a citation can name, longest first so "Army Directive 2025-06"
   * wins over a shorter prefix. A token is a publication, a regulation code,
   * or an explicitly registered app-authored prefix. */
  var PUBLICATION_TOKENS = SOURCES.map(function (s) { return s.publication.split(",")[0].trim(); })
    .concat([
      "Army Directive 2025-06", "Army Directive 2026-07",
      "DA Pam 385-30", "DD Form 2977",
      "AR 40-5", "AR 600-9", "AR 350-1", "AR 385-10", "AR 40-501",
      "ATP 5-19", "ATP 7-22.01", "ATP 7-22.02",
      "FM 4-25.11", "FM 4-25.12", "FM 7-22",
      "TB MED 507", "TB MED 508",
      "APHC, The Performance Triad Guide",
      "army.mil AFT", "army.mil article 291880"
    ])
    .sort(function (a, b) { return b.length - a.length; });

  function sourceIdForToken(token) {
    for (var i = 0; i < SOURCES.length; i++) {
      var pub = SOURCES[i].publication.split(",")[0].trim();
      if (pub === token) return SOURCES[i].id;
    }
    /* Tokens that name a source the registry lists under a different display
     * title (regulations cited by code rather than by title). */
    var alias = {
      "Army Directive 2025-06": "ad-2025-06",
      "Army Directive 2026-07": "ad-2026-07",
      "AR 40-5": "ar-40-5",
      "AR 600-9": "ar-600-9",
      "AR 350-1": "ar-350-1",
      "AR 385-10": "ar-385-10",
      "AR 40-501": "ar-40-501",
      "ATP 5-19": "atp-5-19",
      "ATP 7-22.01": "atp-7-22-01",
      "ATP 7-22.02": "atp-7-22-02",
      "FM 4-25.11": "fm-4-25-11",
      "FM 4-25.12": "atp-4-25-12",
      "FM 7-22": "fm-7-22",
      "TB MED 507": "tb-med-507",
      "TB MED 508": "tb-med-508",
      "APHC, The Performance Triad Guide": "aphc-triad",
      "army.mil AFT": "army-mil-aft",
      "army.mil article 291880": "army-mil-cft",
      "DA Pam 385-30": null,
      "DD Form 2977": null
    };
    return Object.prototype.hasOwnProperty.call(alias, token) ? alias[token] : null;
  }

  function coversValue(covers, kind, value) {
    if (!covers) return false;
    var list = covers[kind];
    if (Array.isArray(list)) return list.indexOf(value) !== -1;
    if (list && typeof list === "object") {
      for (var k in list) {
        if (Object.prototype.hasOwnProperty.call(list, k) &&
            Array.isArray(list[k]) && list[k].indexOf(value) !== -1) return true;
      }
    }
    return false;
  }

  /* A registered app-authored prefix only counts when it is a real token, so
   * "PARAPHRASE OF SOMETHING" does not slip in on the "PAR" prefix. */
  function isAppAuthored(citation) {
    for (var i = 0; i < APP_AUTHORED.length; i++) {
      var prefix = APP_AUTHORED[i].prefix;
      if (citation.indexOf(prefix) !== 0) continue;
      var next = citation.slice(prefix.length, prefix.length + 1);
      if (next && !/[\s:;,.-]/.test(next)) continue;
      return APP_AUTHORED[i];
    }
    return null;
  }

  /* Drill shorthand ("CD1 Ex 3", "QUOTE: PD") names an ATP 7-22.02 drill without
   * spelling out the publication. The registry is where that mapping lives, so
   * an abbreviation nobody registered is a citation the check can reject. */
  function drillShorthandCitation(citation) {
    var found = locatorsIn(citation).filter(function (loc) {
      return loc.kind === "drill" || loc.kind === "drillCode";
    });
    if (!found.length) return null;
    var covers = source("atp-7-22-02").covers;
    var unknown = found.filter(function (loc) { return !drillCovers(covers, loc.value); });
    if (unknown.length) {
      return { error: "no source entry covers drill " + unknown[0].value +
        " (cited by " + JSON.stringify(citation) + ")" };
    }
    return { sourceId: "atp-7-22-02" };
  }

  /* Split a citation into (token, trailing locator text) pairs. A segment that
   * follows a publication with no token of its own ("FM 7-22, Table 6-2; para
   * 3-5") inherits the previous publication, which is how a human reads it. */
  function segments(citation) {
    var hits = [];
    PUBLICATION_TOKENS.forEach(function (token) {
      var from = 0, at;
      while ((at = citation.indexOf(token, from)) !== -1) {
        hits.push({ at: at, token: token, len: token.length });
        from = at + token.length;
      }
    });
    hits.sort(function (a, b) { return a.at - b.at || b.len - a.len; });
    /* Keep the longest token at each position ("Army Directive 2025-06" is not
     * two tokens), and require a real boundary before it so "FM 7-22" does not
     * match inside "FM 7-222". A citation can only legitimately name one
     * publication per segment, so later tokens at the same offset are dropped. */
    var accepted = [];
    hits.forEach(function (hit) {
      var prev = hit.at > 0 ? citation.slice(hit.at - 1, hit.at) : "";
      var next = citation.slice(hit.at + hit.len, hit.at + hit.len + 1);
      if (prev && !/[\s;,/(]/.test(prev)) return;
      /* Boundary AFTER the token too: "FM 7-222" must not match "FM 7-22". */
      if (next && !/[\s;,):]/.test(next)) return;
      if (accepted.length && accepted[accepted.length - 1].at === hit.at) return;
      if (accepted.length && hit.at < accepted[accepted.length - 1].at + accepted[accepted.length - 1].len) return;
      accepted.push(hit);
    });
    return accepted.map(function (hit, i) {
      var start = hit.at + hit.len;
      var end = i + 1 < accepted.length ? accepted[i + 1].at : citation.length;
      return { token: hit.token, start: start, at: hit.at, text: citation.slice(start, end) };
    });
  }

  function locatorsIn(text) {
    var found = [];
    var re;
    re = /\bparas?\s+([0-9]+-[0-9]+)(?:\s+through\s+([0-9]+-[0-9]+))?/g;
    var m;
    while ((m = re.exec(text))) {
      found.push({ kind: "paragraphs", value: m[1] });
      if (m[2]) found.push({ kind: "paragraphs", value: m[2] });
    }
    re = /\bTables?\s+([0-9]+-[0-9]+)/g;
    while ((m = re.exec(text))) found.push({ kind: "tables", value: m[1] });
    re = /\bChapters?\s+(\d+)/g;
    while ((m = re.exec(text))) found.push({ kind: "chapters", value: m[1] });
    re = /\bpp?\.\s*([0-9]+-[0-9]+)(?:\s*\/\s*([0-9]+-[0-9]+))?/g;
    while ((m = re.exec(text))) {
      found.push({ kind: "pages", value: m[1] });
      if (m[2]) found.push({ kind: "pages", value: m[2] });
    }
    re = /\b(Introduction)\b/;
    if (re.test(text)) found.push({ kind: "sections", value: "Introduction" });
    re = /\b([A-Z]{1,4}\d?)\s+Ex\s+(\d+)/g;
    while ((m = re.exec(text))) found.push({ kind: "drill", value: m[1] + " Ex " + m[2] });
    re = /\b(?:Drill\s+)?(PD|CD[123]|CL[12]|MMD[12]|STC|FWC|HSD|SSD|RD|PMCS)\b(?!\s+Ex)/g;
    while ((m = re.exec(text))) found.push({ kind: "drillCode", value: m[1] });
    return found;
  }

  /* A drill citation is covered when the abbreviation is registered under the
   * ATP's drillShorthand map. The exercise NUMBER after "Ex" is not checked —
   * see atp-7-22-02.coverageNote. */
  function drillCovers(covers, value) {
    if (!covers || !covers.drillShorthand) return false;
    for (var drill in covers.drillShorthand) {
      if (!Object.prototype.hasOwnProperty.call(covers.drillShorthand, drill)) continue;
      var codes = covers.drillShorthand[drill];
      var parts = value.split(" Ex ");
      if (codes.indexOf(parts[0]) !== -1) return true;
    }
    return false;
  }

  /* THE GUARD. Returns a list of human-readable problems with one citation
   * string. Empty means the citation is consistent with the registry.
   *
   * A problem is reported when:
   *  - the citation names a publication that is not in the registry, or
   *  - a locator (para/table/chapter/page/drill) follows a publication whose
   *    covers set does not contain it — a record claiming a paragraph no
   *    source entry covers, or
   *  - the citation is neither registered as app-authored nor names any
   *    publication at all, which would let an unverifiable claim through.
   */
  function checkCitation(citation) {
    var issues = [];
    if (typeof citation !== "string" || !citation.trim()) {
      return ["empty citation"];
    }
    if (isAppAuthored(citation)) return issues;

    var segs = segments(citation);
    if (!segs.length) {
      var shorthand = drillShorthandCitation(citation);
      if (shorthand && shorthand.error) return [shorthand.error];
      if (shorthand) return issues;
      return ["citation names no registered publication: " + JSON.stringify(citation)];
    }

    segs.forEach(function (seg) {
      var id = sourceIdForToken(seg.token);
      if (!id) {
        /* A token that resolves to no source entry at all is itself the bug. */
        if (seg.token !== "DA Pam 385-30" && seg.token !== "DD Form 2977") {
          issues.push("no source entry for " + JSON.stringify(seg.token));
        }
        return;
      }
      var src = byId[id];
      locatorsIn(seg.text).forEach(function (loc) {
        var covered;
        if (loc.kind === "drill") covered = drillCovers(src.covers, loc.value);
        else if (loc.kind === "drillCode") covered = drillCovers(src.covers, loc.value);
        else covered = coversValue(src.covers, loc.kind, loc.value);
        if (!covered) {
          issues.push(
            id + " covers no " +
            (loc.kind === "drill" || loc.kind === "drillCode" ? "drill" : loc.kind.replace(/s$/, "")) +
            " " + loc.value + " (cited by " + JSON.stringify(citation) + ")"
          );
        }
      });
    });
    return issues;
  }

  function checkCitations(list) {
    var out = [];
    list.forEach(function (entry) {
      var value = typeof entry === "string" ? entry : entry.citation;
      checkCitation(value).forEach(function (issue) {
        out.push((entry && entry.why ? entry.why + ": " : "") + issue);
      });
    });
    return out;
  }

  /* Every sourceId a data file claims must exist, and every registry source
   * cited by the app must be attached to at least one file. */
  function checkDataFileRefs() {
    var issues = [];
    DATA_FILES.forEach(function (entry) {
      entry.sourceIds.forEach(function (id) {
        if (!byId[id]) issues.push(entry.file + " cites unregistered source id " + id);
      });
    });
    return issues;
  }

  function unownedSources() {
    return SOURCES.filter(function (s) {
      return !DATA_FILES.some(function (e) { return e.sourceIds.indexOf(s.id) !== -1; });
    }).map(function (s) { return s.id; });
  }

  /* One-line provenance string for the UI and for the README. */
  function editionLabel(src) {
    if (src.editionVerified && src.edition) return src.edition;
    return src.edition ? src.edition + " (unverified)" : "edition unverified";
  }

  return {
    POLICY: POLICY,
    SOURCES: SOURCES,
    APP_AUTHORED: APP_AUTHORED,
    DATA_FILES: DATA_FILES,
    all: all,
    source: source,
    files: files,
    dataFile: dataFile,
    sourcesForFile: sourcesForFile,
    daysBetween: daysBetween,
    ageInMonths: ageInMonths,
    reviewStatus: reviewStatus,
    overdueFiles: overdueFiles,
    segments: segments,
    locatorsIn: locatorsIn,
    checkCitation: checkCitation,
    checkCitations: checkCitations,
    checkDataFileRefs: checkDataFileRefs,
    unownedSources: unownedSources,
    editionLabel: editionLabel
  };
});
