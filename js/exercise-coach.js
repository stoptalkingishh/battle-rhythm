/* Battle Rhythm exercise movement-guide renderer. */
(function (window) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var MUSCLE_MAPS = window.BR_MUSCLE_MAPS || {};
  var WORKOUT_CARDS = window.BR_WORKOUT_CARDS || {};
  var AI_PLATES = window.BR_AI_PLATES || [];
  var TARGETS = {
    "chest": { label: "Chest", front: [44, 48, 32, 16], back: [44, 48, 32, 16] },
    "shoulders": { label: "Shoulders", front: [35, 43, 50, 9], back: [35, 43, 50, 9] },
    "triceps": { label: "Triceps", front: [27, 57, 8, 22], back: [79, 57, 8, 22] },
    "biceps": { label: "Biceps", front: [27, 57, 8, 22], back: [79, 57, 8, 22] },
    "upper-back": { label: "Upper back", front: [45, 48, 30, 14], back: [45, 48, 30, 14] },
    "lower-back": { label: "Lower back", front: [48, 65, 24, 13], back: [48, 65, 24, 13] },
    "core": { label: "Core", front: [49, 63, 22, 19], back: [49, 63, 22, 19] },
    "obliques": { label: "Obliques", front: [46, 64, 28, 18], back: [46, 64, 28, 18] },
    "glutes": { label: "Glutes", front: [48, 80, 24, 13], back: [48, 80, 24, 13] },
    "quads": { label: "Quads", front: [48, 93, 10, 32], back: [48, 93, 10, 32] },
    "hamstrings": { label: "Hamstrings", front: [48, 93, 10, 32], back: [48, 93, 10, 32] },
    "calves": { label: "Calves", front: [48, 128, 9, 22], back: [48, 128, 9, 22] },
    "hip-flexors": { label: "Hip flexors", front: [48, 82, 23, 10], back: [48, 82, 23, 10] },
    "grip": { label: "Grip", front: [22, 80, 7, 8], back: [87, 80, 7, 8] }
  };

  function node(tag, text) {
    var element = document.createElement(tag);
    if (text != null) element.textContent = text;
    return element;
  }

  function svgNode(tag, attributes, text) {
    var element = document.createElementNS(SVG_NS, tag);
    var key;
    for (key in attributes) {
      if (attributes.hasOwnProperty(key)) element.setAttribute(key, attributes[key]);
    }
    if (text != null) element.textContent = text;
    return element;
  }

  function list(value) {
    if (!value) return [];
    return Object.prototype.toString.call(value) === "[object Array]" ? value : [value];
  }

  function textOf(value) {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (value && typeof value.text === "string") return value.text;
    if (value && typeof value.label === "string") return value.label;
    return "";
  }

  function targetKey(value) {
    return String(value || "").toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  }

  function camelKey(value) {
    return String(value).split("-").map(function (part, i) {
      return i ? part.charAt(0).toUpperCase() + part.slice(1) : part;
    }).join("");
  }

  /* Muscle-map figure chosen from pattern + pose + exercise id. */
  function figureKey(pattern, pose, id) {
    switch (pattern) {
      case "press":
        if (id === "s3-bench-press") return "bench";
        if (id === "m1-push-up" || id === "m2-hand-release-push-up" || id === "p4-8-count-t-push-up") return "floor";
        return pose === "action" ? "pressUp" : "stand";
      case "pull":
        if (id === "s4-pull-up" || id === "m6-leg-tuck") return "hang";
        if (id === "s7-bent-over-row") return "hinge";
        return pose === "action" ? "hang" : "stand";
      case "hinge":
        return pose === "action" ? "hinge" : "stand";
      case "squat":
        if (id === "n6-burpee-squat-thrust") return pose === "action" ? "floor" : "squat";
        return pose === "action" ? "squat" : "stand";
      case "jump":
        if (id === "p4-8-count-t-push-up") return "floor";
        if (pose === "action") return "jump";
        return pose === "finish" ? "squat" : "stand";
      case "run":
      case "sprint":
        if (id === "a7-etm-session") return "stand";
        return pose === "action" ? "run" : "stand";
      case "ruck":
        return pose === "action" ? "run" : "stand";
      case "core":
        if (id === "m5-mountain-climber") return "floor";
        if (id === "m6-leg-tuck") return "hang";
        return "supine";
      case "static":
        return id === "m3-plank" ? "plank" : "stand";
      case "mobility":
        if (id === "mb5-prone-row" || id === "mb6-shoulder-stability-drill") return "floor";
        if (id === "mb1-bend-and-reach" && pose === "action") return "squat";
        return "stand";
      case "sled":
        return "sled";
      default:
        return "stand";
    }
  }

  function defsNode() {
    var defs = svgNode("defs");
    var grad = svgNode("linearGradient", { id: "coach-skin", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgNode("stop", { offset: "0%", "stop-color": "#e9c39a" }));
    grad.appendChild(svgNode("stop", { offset: "100%", "stop-color": "#caa06f" }));
    defs.appendChild(grad);
    grad = svgNode("linearGradient", { id: "coach-shade", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgNode("stop", { offset: "0%", "stop-color": "#d8ab76" }));
    grad.appendChild(svgNode("stop", { offset: "100%", "stop-color": "#b1834e" }));
    defs.appendChild(grad);
    grad = svgNode("linearGradient", { id: "coach-gold", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgNode("stop", { offset: "0%", "stop-color": "#ffe9a3" }));
    grad.appendChild(svgNode("stop", { offset: "100%", "stop-color": "#c9972e" }));
    defs.appendChild(grad);
    return defs;
  }

  function guideTargets(guide) {
    return list(guide.targets).map(function (target) {
      return targetKey(typeof target === "object" ? (target.name || target.id || target.label) : target);
    }).filter(function (target) { return TARGETS[target]; });
  }

  /* ID-specific geometry keeps shared guide patterns from implying the wrong exercise. */
  function specificPose(id, stage) {
    var action = stage === "action";
    var finish = stage === "finish";
    var stand = { upper: [60, 54], core: [60, 72], hips: [60, 86], legs: [49, 112], calves: [45, 140], arms: [31, 64], grip: [27, 76] };
    var floor = { upper: [46, 109], core: [62, 114], hips: [76, 119], legs: [95, 130], calves: [108, 136], arms: [28, 123], grip: [20, 126] };
    var push = id === "m1-push-up" || id === "m2-hand-release-push-up" || id === "m5-mountain-climber" || id === "p4-8-count-t-push-up";
    var run = /^a[1-6]-|^n[1-5]-|^n7-/.test(id);

    if (id === "s3-bench-press") return { head: [24, 99], body: "M34 96 L72 96 L84 108 L71 116 L34 111 Z", arms: action ? "M49 99 L48 111 M63 99 L64 111" : "M49 99 L47 70 M63 99 L65 70", legs: "M72 111 L91 130 L105 130 M75 113 L89 140 L105 140", extras: "M18 119 L85 119 M25 119 L25 145 M78 119 L78 145 M37 " + (action ? "111" : "70") + " L75 " + (action ? "111" : "70") + " M42 " + (action ? "106" : "65") + " L42 " + (action ? "116" : "75") + " M70 " + (action ? "106" : "65") + " L70 " + (action ? "116" : "75") + " M91 145 L113 145", anchors: floor };
    if (id === "s1-deadlift" || id === "s6-straight-leg-deadlift") return action ? { head: [37, 57], body: "M40 66 L72 72 L77 87 L57 91 Z", arms: "M48 70 L43 113 M58 72 L54 113", legs: id === "s1-deadlift" ? "M62 88 L57 124 L54 151 M72 87 L79 124 L82 151" : "M62 88 L61 132 L58 151 M72 87 L75 132 L78 151", extras: "M35 114 L62 114 M39 108 L39 120 M58 108 L58 120 M48 66 L72 72 M50 113 L50 84", anchors: stand } : { head: [60, 25], body: "M45 40 Q60 35 75 40 L80 82 Q60 91 40 82 Z", arms: "M47 46 L47 111 M73 46 L73 111", legs: "M50 83 L47 132 L43 151 M70 83 L73 132 L77 151", extras: "M35 112 L85 112 M40 106 L40 118 M80 106 L80 118", anchors: stand };
    if (id === "s5-sumo-squat" && action) return { head: [60, 47], body: "M44 60 Q60 55 76 60 L79 91 L43 91 Z", arms: "M45 65 L28 89 M75 65 L92 89", legs: "M51 91 L31 119 L16 119 M69 91 L89 119 L104 119", extras: "M16 119 L10 123 M104 119 L110 123 M35 115 L28 89 M85 115 L92 89", anchors: stand };
    if (id === "s7-bent-over-row") return { head: [37, 57], body: "M40 66 L72 72 L77 87 L57 91 Z", arms: action ? "M48 70 L48 86 M58 72 L60 86" : "M48 70 L43 112 M58 72 L54 112", legs: "M62 88 L65 133 L61 151 M72 87 L80 133 L84 151", extras: action ? "M42 87 L66 87 M46 81 L46 93 M62 81 L62 93 M48 66 L72 72" : "M35 113 L62 113 M39 107 L39 119 M58 107 L58 119 M48 66 L72 72", anchors: stand };
    if (id === "p5-kettlebell-swing") return action ? { head: [60, 25], body: "M45 40 Q60 35 75 40 L80 82 Q60 91 40 82 Z", arms: "M48 47 L45 69 M72 47 L75 69", legs: "M50 83 L47 132 L43 151 M70 83 L73 132 L77 151", extras: "M38 72 Q60 30 82 72 M45 70 Q60 80 75 70", anchors: stand } : { head: [38, 57], body: "M41 66 L70 72 L76 86 L57 91 Z", arms: "M48 70 L43 110 M57 72 L53 110", legs: "M62 88 L65 133 L61 151 M72 87 L80 133 L84 151", extras: "M38 112 Q48 126 58 112", anchors: stand };
    if (id === "s4-pull-up" || id === "m6-leg-tuck") return { head: [60, action ? 38 : 50], body: "M47 " + (action ? "50" : "62") + " Q60 " + (action ? "45" : "57") + " 73 " + (action ? "50" : "62") + " L76 " + (action ? "87" : "96") + " Q60 " + (action ? "94" : "103") + " 44 " + (action ? "87" : "96") + " Z", arms: "M48 " + (action ? "52" : "64") + " L39 34 L39 18 M72 " + (action ? "52" : "64") + " L81 34 L81 18", legs: id === "m6-leg-tuck" && action ? "M52 88 L43 72 L52 62 M68 88 L77 72 L68 62" : "M52 " + (action ? "88" : "97") + " L49 132 L43 151 M68 " + (action ? "88" : "97") + " L71 132 L77 151", extras: "M22 17 L98 17", anchors: stand };
    if (push) return { head: [25, action ? 118 : 103], body: "M35 " + (action ? "115" : "100") + " L77 " + (action ? "121" : "108") + " L88 " + (action ? "130" : "118") + " L75 " + (action ? "134" : "124") + " L35 " + (action ? "126" : "112") + " Z", arms: (id === "m2-hand-release-push-up" || id === "p4-8-count-t-push-up") && action ? "M40 120 L18 120 M46 121 L68 121" : "M42 " + (action ? "120" : "106") + " L20 137 M48 " + (action ? "122" : "108") + " L29 140", legs: id === "m5-mountain-climber" && action ? "M77 120 L61 137 L48 137 M80 124 L105 137 L113 139" : "M77 " + (action ? "124" : "112") + " L103 138 L112 140 M77 " + (action ? "130" : "118") + " L102 147 L112 149", extras: "M14 150 L114 150", anchors: floor };
    if (id === "m3-plank") return { head: [25, 104], body: "M36 100 L79 108 L91 119 L78 125 L36 115 Z", arms: "M42 108 L27 128 L17 128 M48 110 L39 132", legs: "M79 114 L105 127 L113 127 M79 120 L104 138 L113 138", extras: "M14 145 L115 145 M29 128 L39 132 L42 120", anchors: floor };
    if (id === "m4-v-up" || id === "m7-rower" || id === "m8-bent-leg-body-twist") return action ? { head: [49, 112], body: "M55 111 L72 96 L82 107 L68 124 Z", arms: "M57 108 L42 91 M60 109 L48 88", legs: id === "m8-bent-leg-body-twist" ? "M73 111 L97 105 L105 115 M76 117 L100 111 L108 121" : "M73 111 L96 86 L106 91 M76 117 L101 106 L110 110", extras: "M15 145 L115 145", anchors: floor } : { head: [25, 113], body: "M35 108 L70 112 L82 122 L70 130 L35 122 Z", arms: "M40 116 L18 130 M46 118 L26 137", legs: "M72 118 L94 105 L106 112 M76 124 L98 116 L110 122", extras: "M15 145 L115 145", anchors: floor };
    if (id === "mb5-prone-row" || id === "mb6-shoulder-stability-drill") return { head: [25, 113], body: "M35 108 L78 114 L89 124 L76 132 L35 122 Z", arms: action ? "M42 116 L62 96 M48 118 L78 102" : "M42 116 L18 130 M48 118 L26 138", legs: "M78 120 L104 132 L113 132 M78 126 L103 142 L113 142", extras: "M15 148 L115 148", anchors: floor };
    if (id === "mb8-recovery-drill-stretches") return { head: [51, 40], body: "M43 53 L68 49 L74 83 L52 89 Z", arms: "M46 57 L29 36 M65 53 L80 32", legs: "M55 87 L38 125 L25 125 M71 83 L91 112 L105 112", extras: "M15 145 L115 145", anchors: stand };
    if (id === "p6-sled-push-drag") return { head: [43, 61], body: "M45 70 L70 77 L77 91 L57 98 Z", arms: finish ? "M51 75 L26 92 M60 78 L29 101" : "M51 75 L85 96 L94 96 M60 78 L88 105 L96 105", legs: "M61 96 L43 124 L29 124 M74 92 L93 112 L106 112", extras: finish ? "M12 113 L38 102 M12 130 L108 130" : "M94 78 L94 130 M105 78 L105 130 M88 130 L112 130 M12 130 L88 130", anchors: stand };
    if (id === "a4-foot-march-ruck-march") return { head: [55, 31], body: "M43 45 L68 42 L78 78 L54 85 Z", arms: "M46 50 L31 63 M69 48 L82 65", legs: action ? "M57 83 L40 112 L25 112 M73 80 L89 112 L102 112" : "M57 83 L48 119 L35 119 M73 81 L88 111 L102 111", extras: "M44 43 Q27 47 32 80 L54 83 L54 48 Z M34 57 L66 57 M37 72 L66 72 M15 145 L113 145", anchors: stand };
    if (id === "a7-etm-session") return { head: [45, 43], body: "M40 56 L64 55 L70 85 L50 89 Z", arms: "M45 61 L75 78 M60 60 L78 74", legs: action ? "M54 87 L76 111 L91 111 M65 86 L54 120 L41 120" : "M54 87 L65 115 L82 115 M65 86 L76 108 L91 108", extras: "M74 74 L88 60 L96 60 M76 111 L102 111 L108 132 M45 120 L72 120 M15 145 L115 145", anchors: stand };
    if (id === "n6-burpee-squat-thrust" && action) return { head: [25, 104], body: "M35 100 L77 108 L88 119 L75 126 L35 112 Z", arms: "M42 108 L20 130 M48 110 L30 135", legs: "M77 114 L104 130 L112 130 M77 120 L102 140 L112 140", extras: "M15 148 L115 148", anchors: floor };
    if (run) return { head: [55, action ? 31 : 37], body: "M43 45 L68 42 L78 78 L54 85 Z", arms: "M46 50 L29 68 M69 48 L83 31", legs: action ? "M57 83 L34 116 L20 116 M73 80 L94 99 L108 99" : "M57 83 L40 112 L25 112 M73 80 L89 112 L102 112", extras: id === "n5-hill-repeats" ? "M12 145 L112 85 M12 150 L112 150" : "M12 150 L112 150 M18 145 L18 155 M106 145 L106 155", anchors: stand };
    return null;
  }

  /* Coordinates describe original silhouettes in one 120 x 160 pose cell. */
  function poseGeometry(pattern, stage, id) {
    var specific = specificPose(id, stage);
    if (specific) return specific;
    var upright = {
      head: [60, 25], body: "M45 40 Q60 35 75 40 L80 82 Q60 91 40 82 Z",
      arms: "M45 45 L28 76 M75 45 L92 76", legs: "M50 83 L47 132 L43 151 M70 83 L73 132 L77 151",
      anchors: { upper: [60, 54], core: [60, 72], hips: [60, 86], legs: [49, 112], calves: [45, 140], arms: [31, 64], grip: [27, 76] }
    };
    var floor = {
      head: [28, 105], body: "M38 100 L77 108 L88 119 L75 126 L38 116 Z",
      arms: "M42 108 L20 125 M48 111 L29 132", legs: "M77 114 L103 128 L112 130 M77 120 L102 138 L112 140",
      anchors: { upper: [46, 109], core: [62, 114], hips: [76, 119], legs: [95, 130], calves: [108, 136], arms: [28, 123], grip: [20, 126] }
    };
    var g = upright;
    var isAction = stage === "action";
    var isFinish = stage === "finish";

    if (pattern === "hinge") {
      g = isAction ? {
        head: [39, 55], body: "M42 65 L70 72 L76 86 L57 91 Z", arms: "M48 70 L39 105 M57 72 L49 106", legs: "M62 88 L65 133 L61 151 M72 87 L80 133 L84 151",
        extras: "M31 108 L58 108 M35 102 L35 114 M54 102 L54 114", anchors: { upper: [51, 74], core: [61, 84], hips: [67, 89], legs: [67, 116], calves: [63, 141], arms: [43, 91], grip: [42, 106] }
      } : upright;
      if (isFinish) g.extras = "M29 112 L91 112 M34 106 L34 118 M86 106 L86 118";
    } else if (pattern === "squat") {
      g = isAction ? {
        head: [60, 48], body: "M44 61 Q60 55 76 61 L79 91 L43 91 Z", arms: "M45 65 L26 91 M75 65 L94 91", legs: "M51 91 L36 116 L24 116 M69 91 L84 116 L96 116",
        anchors: { upper: [60, 69], core: [60, 83], hips: [60, 92], legs: [43, 106], calves: [28, 115], arms: [31, 84], grip: [26, 92] }
      } : upright;
      if (isFinish) g.arms = "M45 45 L35 70 M75 45 L85 70";
    } else if (pattern === "press") {
      g = isAction || isFinish ? {
        head: [60, 34], body: "M45 48 Q60 43 75 48 L79 86 Q60 94 41 86 Z", arms: "M48 51 L45 18 M72 51 L75 18", legs: "M51 87 L48 132 L44 151 M69 87 L72 132 L76 151",
        extras: "M33 16 L87 16 M38 11 L38 21 M82 11 L82 21", anchors: { upper: [60, 55], core: [60, 75], hips: [60, 88], legs: [49, 112], calves: [45, 140], arms: [46, 32], grip: [45, 18] }
      } : {
        head: [60, 28], body: "M45 43 Q60 38 75 43 L79 83 Q60 91 41 83 Z", arms: "M45 50 L36 65 L48 70 M75 50 L84 65 L72 70", legs: "M51 84 L48 132 L44 151 M69 84 L72 132 L76 151",
        extras: "M34 67 L86 67 M38 62 L38 72 M82 62 L82 72", anchors: upright.anchors
      };
    } else if (pattern === "pull") {
      g = isAction ? {
        head: [60, 37], body: "M47 49 Q60 44 73 49 L76 87 Q60 94 44 87 Z", arms: "M48 52 L39 30 L39 18 M72 52 L81 30 L81 18", legs: "M52 88 L49 126 L43 146 M68 88 L71 126 L77 146",
        extras: "M25 17 L95 17", anchors: { upper: [60, 57], core: [60, 76], hips: [60, 88], legs: [50, 111], calves: [45, 135], arms: [42, 38], grip: [39, 18] }
      } : {
        head: [60, 49], body: "M47 61 Q60 56 73 61 L76 96 Q60 103 44 96 Z", arms: "M48 64 L39 42 L39 18 M72 64 L81 42 L81 18", legs: "M52 97 L49 132 L43 151 M68 97 L71 132 L77 151",
        extras: "M25 17 L95 17", anchors: { upper: [60, 68], core: [60, 86], hips: [60, 98], legs: [50, 116], calves: [45, 140], arms: [42, 48], grip: [39, 18] }
      };
    } else if (pattern === "run" || pattern === "sprint" || pattern === "ruck") {
      var fast = pattern === "sprint";
      g = isAction ? {
        head: [55, 31], body: "M43 45 L68 42 L78 78 L54 85 Z", arms: fast ? "M46 50 L29 68 M69 48 L83 31" : "M46 50 L31 63 M69 48 L82 65", legs: fast ? "M57 83 L34 116 L20 116 M73 80 L94 99 L108 99" : "M57 83 L40 112 L25 112 M73 80 L89 112 L102 112",
        anchors: { upper: [57, 55], core: [63, 72], hips: [66, 83], legs: [47, 101], calves: [29, 113], arms: [34, 62], grip: [29, 68] }
      } : upright;
      if (isFinish) g = {
        head: [62, 28], body: "M48 42 L72 43 L78 80 L54 85 Z", arms: "M50 49 L35 62 M71 50 L84 67", legs: "M57 83 L48 119 L35 119 M73 81 L88 111 L102 111",
        anchors: { upper: [60, 53], core: [64, 71], hips: [66, 82], legs: [53, 102], calves: [38, 117], arms: [37, 61], grip: [35, 63] }
      };
      if (pattern === "ruck") g.extras = "M44 43 Q30 50 35 80 L53 82 L53 49 Z M40 64 L68 64";
    } else if (pattern === "jump") {
      g = isAction ? {
        head: [60, 19], body: "M46 32 Q60 27 74 32 L78 65 Q60 72 42 65 Z", arms: "M48 36 L31 16 M72 36 L89 16", legs: "M52 65 L43 91 L31 91 M68 65 L77 91 L89 91",
        anchors: { upper: [60, 42], core: [60, 57], hips: [60, 67], legs: [47, 80], calves: [34, 90], arms: [34, 20], grip: [31, 16] }
      } : isFinish ? {
        head: [60, 47], body: "M45 60 Q60 55 75 60 L78 91 Q60 98 42 91 Z", arms: "M47 64 L31 84 M73 64 L89 84", legs: "M52 91 L39 119 L27 119 M68 91 L81 119 L93 119",
        anchors: { upper: [60, 68], core: [60, 83], hips: [60, 93], legs: [44, 108], calves: [29, 118], arms: [34, 80], grip: [31, 84] }
      } : {
        head: [60, 45], body: "M45 58 Q60 53 75 58 L78 88 Q60 95 42 88 Z", arms: "M47 62 L30 86 M73 62 L90 86", legs: "M52 88 L38 115 L26 115 M68 88 L82 115 L94 115", anchors: upright.anchors
      };
    } else if (pattern === "core" || pattern === "static") {
      g = isAction && pattern === "core" ? {
        head: [50, 112], body: "M55 111 L72 96 L82 107 L68 124 Z", arms: "M57 108 L42 91 M60 109 L48 88", legs: "M73 111 L96 86 L106 91 M76 117 L101 106 L110 110",
        anchors: { upper: [59, 107], core: [67, 111], hips: [75, 113], legs: [91, 99], calves: [105, 91], arms: [48, 94], grip: [42, 91] }
      } : floor;
      if (pattern === "static") g = {
        head: [32, 101], body: "M42 96 L77 105 L88 116 L75 122 L42 112 Z", arms: "M44 105 L24 122 L18 135 M50 107 L35 130", legs: "M77 112 L104 124 L113 126 M77 117 L101 137 L112 139", anchors: floor.anchors
      };
    } else if (pattern === "mobility") {
      g = isAction ? {
        head: [53, 35], body: "M40 49 L68 45 L76 82 L52 89 Z", arms: "M43 54 L27 35 M66 50 L82 25", legs: "M55 87 L39 121 L25 121 M72 82 L91 111 L104 111",
        anchors: { upper: [54, 57], core: [61, 74], hips: [64, 86], legs: [47, 105], calves: [29, 119], arms: [31, 39], grip: [27, 35] }
      } : upright;
    } else if (pattern === "sled") {
      g = {
        head: [43, 61], body: "M45 70 L70 77 L77 91 L57 98 Z", arms: "M51 75 L85 96 L94 96 M60 78 L88 105 L96 105", legs: isFinish ? "M61 96 L48 128 L33 128 M74 92 L88 120 L102 120" : "M61 96 L43 124 L29 124 M74 92 L93 112 L106 112",
        extras: "M94 78 L94 130 M105 78 L105 130 M88 130 L112 130 M91 97 L108 97", anchors: { upper: [53, 77], core: [64, 88], hips: [68, 96], legs: [51, 111], calves: [32, 123], arms: [80, 94], grip: [94, 96] }
      };
    }
    return g;
  }

  function targetSpot(target, anchors) {
    if (target === "shoulders" || target === "chest" || target === "upper-back") return anchors.upper;
    if (target === "core" || target === "obliques" || target === "lower-back") return anchors.core;
    if (target === "glutes" || target === "hip-flexors") return anchors.hips;
    if (target === "quads" || target === "hamstrings") return anchors.legs;
    if (target === "calves") return anchors.calves;
    if (target === "biceps" || target === "triceps") return anchors.arms;
    return anchors.grip;
  }

  function musclePath(muscles, target) {
    if (!muscles) return null;
    if (muscles[target]) return muscles[target];
    return muscles[camelKey(target)] || null;
  }

  function addFigure(svg, x, pose, view, targets, label, pattern, exerciseId) {
    var group = svgNode("g", { "class": "coach-pose-" + pose, "data-pose": pose, "data-view": view, "aria-label": label + ", " + view + " view" });
    var geometry = poseGeometry(pattern, pose, exerciseId);
    var key = figureKey(pattern, pose, exerciseId);
    var map = key && MUSCLE_MAPS[key];
    var viewMap = map && (map[view] || map.front);
    if (viewMap && viewMap.muscles) {
      var inner = svgNode("g", { transform: "translate(" + x + " 0)" });
      var i, key, path, spot;
      inner.appendChild(svgNode("path", { "class": "coach-figure-body", d: viewMap.body }));
      inner.appendChild(svgNode("path", { "class": "coach-figure-arms", d: viewMap.arms }));
      inner.appendChild(svgNode("path", { "class": "coach-figure-legs", d: viewMap.legs }));
      inner.appendChild(svgNode("circle", { "class": "coach-figure-head", cx: viewMap.head[0], cy: viewMap.head[1], r: viewMap.head[2] }));
      for (key in viewMap.muscles) {
        if (!viewMap.muscles.hasOwnProperty(key)) continue;
        if (targets.indexOf(key) !== -1 || targets.indexOf(camelKey(key)) !== -1) continue;
        inner.appendChild(svgNode("path", { "class": "coach-muscle", d: viewMap.muscles[key], "data-muscle": key }));
      }
      if (viewMap.lines) inner.appendChild(svgNode("path", { "class": "coach-muscle-lines", d: viewMap.lines }));
      for (i = 0; i < targets.length; i++) {
        path = musclePath(viewMap.muscles, targets[i]);
        if (path) {
          inner.appendChild(svgNode("path", { "class": "coach-muscle coach-muscle-target", d: path, "data-muscle": targets[i] }));
        } else {
          spot = targetSpot(targets[i], geometry.anchors);
          inner.appendChild(svgNode("ellipse", { "class": "coach-muscle-target", cx: spot[0], cy: spot[1], rx: 7, ry: 5, "data-muscle": targets[i] }));
        }
      }
      group.appendChild(inner);
      group.appendChild(svgNode("text", { x: x + 60, y: 178, "text-anchor": "middle" }, label));
      svg.appendChild(group);
      return;
    }
    var body = svgNode("g", { transform: "translate(" + x + " 0)", fill: "currentColor" });
    var targetLayer = svgNode("g", { "class": "coach-targets", transform: "translate(" + x + " 0)" });
    var spot;
    body.appendChild(svgNode("circle", { cx: geometry.head[0], cy: geometry.head[1], r: 10 }));
    body.appendChild(svgNode("path", { d: geometry.body }));
    body.appendChild(svgNode("path", { d: geometry.arms, fill: "none", "stroke-width": 9 }));
    body.appendChild(svgNode("path", { d: geometry.legs, fill: "none", "stroke-width": 11 }));
    if (view === "back") body.appendChild(svgNode("path", { d: "M60 " + (geometry.head[1] + 11) + " L60 " + geometry.anchors.hips[1], fill: "none", "stroke-width": 2 }));
    if (geometry.extras) body.appendChild(svgNode("path", { d: geometry.extras, fill: "none", "stroke-width": 4 }));
    group.appendChild(body);

    for (i = 0; i < targets.length; i++) {
      spot = targetSpot(targets[i], geometry.anchors);
      targetLayer.appendChild(svgNode("ellipse", { cx: spot[0], cy: spot[1], rx: 7, ry: 5, opacity: "0.9" }));
    }
    group.appendChild(targetLayer);
    group.appendChild(svgNode("text", { x: x + 60, y: 178, "text-anchor": "middle" }, label));
    svg.appendChild(group);
  }

  function diagram(exercise, guide, targets) {
    var name = (exercise && exercise.name) || "Exercise";
    var requestedView = String(guide.view || "front").toLowerCase();
    var view = requestedView === "back" ? "back" : "front";
    var svg = svgNode("svg", {
      "class": "coach-svg", viewBox: "0 0 360 190", role: "img", "aria-labelledby": "coach-svg-title coach-svg-description"
    });
    svg.appendChild(defsNode());
    var title = svgNode("title", { id: "coach-svg-title" }, name + " movement sequence");
    var description = svgNode("desc", { id: "coach-svg-description" }, "Three illustrative " + view + "-view positions: start, action, and finish. Highlighted gold regions indicate target muscle groups.");
    svg.appendChild(title);
    svg.appendChild(description);
    addFigure(svg, 0, "start", view, targets, "Start", guide.pattern, exercise && exercise.id);
    addFigure(svg, 120, "action", requestedView === "both" ? "back" : view, targets, "Action", guide.pattern, exercise && exercise.id);
    addFigure(svg, 240, "finish", view, targets, "Finish", guide.pattern, exercise && exercise.id);
    return svg;
  }

  function workoutCard(exercise) {
    var card = WORKOUT_CARDS[exercise && exercise.id];
    if (!card && Object.prototype.toString.call(WORKOUT_CARDS) === "[object Array]") {
      card = WORKOUT_CARDS.find(function (item) { return item.id === exercise.id; });
    }
    var ai = AI_PLATES.find(function (plate) { return plate.id === exercise.id; });
    if (ai) {
      return {
        src: ai.webp || ai.png || (card && card.src),
        alt: (card && card.alt) || exercise.name + " anatomy plate"
      };
    }
    return card;
  }

  function anatomyPlate(exercise, card) {
    var image = node("img");
    image.className = "coach-anatomy-plate";
    image.src = card.src;
    image.alt = card.alt || exercise.name + " anatomy plate";
    return image;
  }

  function appendMotionControls(root) {
    var controls = node("div");
    var button = node("button", "Play motion");
    controls.className = "coach-controls";
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", function () {
      var playing = root.classList.toggle("coach-playing");
      button.setAttribute("aria-pressed", playing ? "true" : "false");
    });
    controls.appendChild(button);
    root.appendChild(controls);
  }

  function appendList(parent, values) {
    var listElement = node("ol");
    values.forEach(function (value) {
      var text = textOf(value);
      if (text) listElement.appendChild(node("li", text));
    });
    if (listElement.children.length) parent.appendChild(listElement);
  }

  function render(exercise, guide) {
    var root = node("section");
    var cues = list(exercise && exercise.cues);
    var steps, warnings, targets, figure, targetList, movement, card;
    card = workoutCard(exercise);
    var hasAnatomyPlate = !!(card && card.src);
    root.className = "exercise-coach";
    if (hasAnatomyPlate) root.classList.add("has-anatomy-plate");

    if (!guide) {
      if (cues.length) {
        var cueContent = node("div");
        cueContent.className = "coach-steps";
        appendList(cueContent, cues);
        root.appendChild(cueContent);
      }
      root.appendChild(node("p", "Illustrative movement guide — follow qualified instruction and unit policy.")).className = "coach-disclaimer";
      return root;
    }

    targets = guideTargets(guide);
    figure = node("figure");
    figure.className = "coach-figure";
    var runVisual = (window.BRRunVisual && window.BRRunVisual.render(exercise)) || null;
    if (runVisual) {
      root.classList.add("has-run-visual");
      figure.appendChild(runVisual);
    } else if (hasAnatomyPlate) {
      var plate = anatomyPlate(exercise, card);
      plate.addEventListener("error", function () {
        figure.replaceChild(diagram(exercise, guide, targets), plate);
        root.classList.remove("has-anatomy-plate");
        appendMotionControls(root);
      }, { once: true });
      figure.appendChild(plate);
    } else {
      figure.appendChild(diagram(exercise, guide, targets));
    }
    root.appendChild(figure);

    if (targets.length) {
      targetList = node("div");
      targetList.className = "coach-targets";
      targetList.appendChild(node("strong", "Target muscle groups"));
      targetList.appendChild(node("p", targets.map(function (target) { return TARGETS[target].label; }).join(", ")));
      root.appendChild(targetList);
    }

    movement = guide.movement || {};
    var movementContent = node("div");
    movementContent.className = "coach-movement";
    movementContent.appendChild(node("strong", "Movement sequence"));
    [
      ["Start", textOf(movement.start)],
      ["Action", textOf(movement.action)],
      ["Finish", textOf(movement.finish)]
    ].forEach(function (stage) {
      if (stage[1]) movementContent.appendChild(node("p", stage[0] + ": " + stage[1]));
    });
    if (!movementContent.querySelector("p")) movementContent.appendChild(node("p", textOf(guide.pattern)));
    root.appendChild(movementContent);

    steps = list(guide.steps).map(textOf).filter(Boolean).slice(0, 3);
    while (steps.length < 3 && cues.length) steps.push(textOf(cues.shift()));
    while (steps.length < 3) steps.push(["Set a stable starting position.", "Move with control through the working range.", "Return to the finish with control."][steps.length]);
    var stepContent = node("div");
    stepContent.className = "coach-steps";
    stepContent.appendChild(node("strong", "Coaching steps"));
    appendList(stepContent, steps);
    root.appendChild(stepContent);

    warnings = list(guide.warnings).map(textOf).filter(Boolean);
    if (!warnings.length && exercise && exercise.safety) warnings = [exercise.safety];
    if (warnings.length) {
      var warningContent = node("div");
      warningContent.className = "coach-warning";
      warningContent.appendChild(node("strong", "Safety"));
      appendList(warningContent, warnings);
      root.appendChild(warningContent);
    }

    if (!hasAnatomyPlate) {
      appendMotionControls(root);
    }
    root.appendChild(node("p", "Illustrative movement guide — follow qualified instruction and unit policy.")).className = "coach-disclaimer";
    return root;
  }

  window.BRExerciseCoach = { render: render };
})(window);
