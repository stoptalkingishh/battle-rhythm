/* Battle Rhythm exercise movement-guide renderer. */
(function (window) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
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

  function guideTargets(guide) {
    return list(guide.targets).map(function (target) {
      return targetKey(typeof target === "object" ? (target.name || target.id || target.label) : target);
    }).filter(function (target) { return TARGETS[target]; });
  }

  function addFigure(svg, x, pose, view, targets, label) {
    var group = svgNode("g", { "class": "coach-pose-" + pose, "data-pose": pose, "aria-label": label });
    var isBack = view === "back";
    var shift = pose === "action" ? -5 : pose === "finish" ? 3 : 0;
    var body = svgNode("g", { transform: "translate(" + x + " " + shift + ")", fill: "currentColor" });
    var targetLayer = svgNode("g", { transform: "translate(" + x + " " + shift + ")", fill: "#d4af37" });
    var i, target, area;

    body.appendChild(svgNode("circle", { cx: 60, cy: 25, r: 12 }));
    body.appendChild(svgNode("path", { d: "M45 40 Q60 35 75 40 L80 82 Q60 91 40 82 Z" }));
    body.appendChild(svgNode("path", { d: "M45 44 L25 77 L31 82 L51 55 M75 44 L95 77 L89 82 L69 55", fill: "none", "stroke": "currentColor", "stroke-width": 9, "stroke-linecap": "round" }));
    body.appendChild(svgNode("path", { d: "M50 83 L45 130 L51 153 M70 83 L75 130 L69 153", fill: "none", "stroke": "currentColor", "stroke-width": 11, "stroke-linecap": "round" }));
    group.appendChild(body);

    for (i = 0; i < targets.length; i++) {
      target = TARGETS[targets[i]];
      area = target[isBack ? "back" : "front"];
      if (!area) continue;
      targetLayer.appendChild(svgNode("rect", {
        x: area[0], y: area[1], width: area[2], height: area[3], rx: 4, opacity: "0.9"
      }));
    }
    group.appendChild(targetLayer);
    group.appendChild(svgNode("text", { x: x + 60, y: 174, "text-anchor": "middle" }, label));
    svg.appendChild(group);
  }

  function diagram(exercise, guide, targets) {
    var name = (exercise && exercise.name) || "Exercise";
    var view = String(guide.view || "front").toLowerCase() === "back" ? "back" : "front";
    var svg = svgNode("svg", {
      "class": "coach-svg", viewBox: "0 0 360 190", role: "img", "aria-labelledby": "coach-svg-title coach-svg-description"
    });
    var title = svgNode("title", { id: "coach-svg-title" }, name + " movement sequence");
    var description = svgNode("desc", { id: "coach-svg-description" }, "Three illustrative " + view + "-view positions: start, action, and finish. Highlighted gold regions indicate target muscle groups.");
    svg.appendChild(title);
    svg.appendChild(description);
    addFigure(svg, 0, "start", view, targets, "Start");
    addFigure(svg, 120, "action", view, targets, "Action");
    addFigure(svg, 240, "finish", view, targets, "Finish");
    return svg;
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
    var steps, warnings, targets, figure, targetList, controls, button, movement;
    root.className = "exercise-coach";

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
    figure.appendChild(diagram(exercise, guide, targets));
    root.appendChild(figure);

    if (targets.length) {
      targetList = node("div");
      targetList.className = "coach-targets";
      targetList.appendChild(node("strong", "Target muscle groups"));
      targetList.appendChild(node("p", targets.map(function (target) { return TARGETS[target].label; }).join(", ")));
      root.appendChild(targetList);
    }

    movement = textOf(guide.movement) || textOf(guide.pattern);
    if (movement) root.appendChild(node("p", movement));

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

    controls = node("div");
    controls.className = "coach-controls";
    button = node("button", "Play motion");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", function () {
      var playing = root.classList.toggle("coach-playing");
      button.setAttribute("aria-pressed", playing ? "true" : "false");
    });
    controls.appendChild(button);
    root.appendChild(controls);
    root.appendChild(node("p", "Illustrative movement guide — follow qualified instruction and unit policy.")).className = "coach-disclaimer";
    return root;
  }

  window.BRExerciseCoach = { render: render };
})(window);
