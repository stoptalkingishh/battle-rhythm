/* Official ATP 7-22.02 (Holistic Health and Fitness Drills and Exercises) figures.
 *
 * Source: ATP 7-22.02, a U.S. Government work in the public domain (17 U.S.C. 105).
 * Figures were extracted with scripts/extract-atp-figures.py from the same-named
 * figure's embedded image bounding box, so each crop is exact and needs no manual
 * QA. WebP outputs live under assets/plates/atp/.
 *
 * The goal: replace custom AI plates / generated coach figures with the official
 * Army depictions, and mirror the manual's exercise roster in the library.
 *
 * figureMap maps a library exercise id -> official figure id. Only single-pose
 * figures are wired here; multi-pose whole drills (Shoulder Stability Drill,
 * Hip Stability Drill, Recovery Drill, PMCS) are handled by the generated
 * coach sequence and remain a documented follow-up for panel extraction.
 */
window.BR_ATP_FIGURES = {
  /* strength */
  "s1-deadlift": "14-3",
  "s2-squat": "14-2",
  "s3-bench-press": "14-6",
  "s4-pull-up": "6-3",
  "s6-straight-leg-deadlift": "14-5",
  "s7-bent-over-row": "14-13",
  "s8-overhead-push-press": "14-17",
  /* power */
  "p1-power-jump": "5-1",
  "p3-tuck-jump": "5-20",
  "p4-8-count-t-push-up": "5-15",
  "p14-medicine-ball-slam": "9-4",
  /* anaerobic */
  "n4-shuttle-sprint": "8-3",
  /* muscular endurance */
  "m1-push-up": "3-13",
  "m4-v-up": "5-2",
  "m5-mountain-climber": "5-3",
  "m6-leg-tuck": "6-4",
  "m7-rower": "3-5",
  "m8-bent-leg-body-twist": "3-12",
  /* mobility / stability (single exercises) */
  "mb1-bend-and-reach": "3-1",
  "mb2-rear-lunge": "3-2",
  "mb3-high-jumper": "3-4",
  "mb4-windmill": "3-8",
  "mb5-prone-row": "3-11",
  /* machines */
  "m1-lat-pulldown": "15-9",
  "m2-seated-cable-row": "15-11",
  "m3-leg-press": "15-1",
  "m5-seated-leg-curl": "15-3",
  "m6-shoulder-press-machine": "15-7"
};

window.BR_ATPF = function (exerciseId) {
  var fig = window.BR_ATP_FIGURES[exerciseId];
  if (!fig) return null;
  return "assets/plates/atp/" + fig + ".webp";
};
