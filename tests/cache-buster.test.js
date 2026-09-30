"use strict";
/* Integration tests for the cache-buster tooling (scripts/bump-cache-buster.mjs,
 * scripts/check-cache-buster.mjs, scripts/lib/cache-buster.mjs) using only Node
 * built-ins. Run: node --test tests/
 *
 * These two scripts are the one pair that must agree on what a cache-buster tag
 * looks like: the guard fails CI, the bump tool rewrites the file, and if they
 * disagree the bump tool writes a file the guard still rejects. Every scenario
 * below runs both against a throwaway repo root built from this repository's
 * real index.html, so the fixture cannot drift from the shipped markup.
 *
 * Nothing here writes to the working tree outside a temp directory.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const baseHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "br-cache-buster-"));
process.on("exit", () => fs.rmSync(tempRoot, { recursive: true, force: true }));

/** A minimal repo root: index.html plus the script tree they resolve against. */
function fixture(html, name) {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  for (const file of ["bump-cache-buster.mjs", "check-cache-buster.mjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(dir, "scripts", file));
  }
  fs.copyFileSync(
    path.join(root, "scripts", "lib", "cache-buster.mjs"),
    path.join(dir, "scripts", "lib", "cache-buster.mjs")
  );
  return dir;
}

function run(dir, file, args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [path.join(dir, "scripts", file)].concat(args || []), { encoding: "utf8", stdio: "pipe" }) };
  } catch (err) {
    return { code: err.status == null ? 1 : err.status, out: (err.stdout || "") + (err.stderr || "") };
  }
}

const guard = dir => run(dir, "check-cache-buster.mjs");
const bump = (dir, args) => run(dir, "bump-cache-buster.mjs", args);
const read = dir => fs.readFileSync(path.join(dir, "index.html"), "utf8");
const tags = html => (html.match(/\?v=battle-rhythm-(\d+)/g) || []).map(tag => tag.replace(/\D+/g, ""));
/** Collapse version digits so two files can be compared for "everything else identical". */
const normalize = html => html.replace(/\?v=battle-rhythm-\d+/g, "?v=battle-rhythm-X");

/** Retag every local reference in a fixture to one version, to build drift cases. */
function withVersion(html, from, to) {
  return html.split("?v=battle-rhythm-" + from).join("?v=battle-rhythm-" + to);
}

test("the shipped index.html is uniform, and the guard agrees", () => {
  const versions = [...new Set(tags(baseHtml))];
  assert.deepEqual(versions.length, 1, "index.html tags disagree: " + versions.join(", "));
  const result = guard(fixture(baseHtml, "shipped"));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /all cache-busted at v\d+/);
});

test("dry run reports the rewrite and writes nothing", () => {
  const dir = fixture(baseHtml, "dry-run");
  const before = read(dir);
  const result = bump(dir, ["--dry-run"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /would rewrite \d+ local references to v\d+ \(dry run, nothing written\)/);
  assert.equal(read(dir), before);
});

test("bump advances every tag and changes nothing else in the file", () => {
  const dir = fixture(baseHtml, "bump");
  const before = read(dir);
  const from = Number(tags(before)[0]);
  const result = bump(dir);
  assert.equal(result.code, 0, result.out);

  const after = read(dir);
  const unique = [...new Set(tags(after))];
  assert.deepEqual(unique, [String(from + 1)], "every tag should be at one new version");
  assert.equal(tags(after).length, tags(before).length, "no reference added or lost");
  assert.equal(normalize(after), normalize(before), "only the version digits may change");
  assert.equal(after.length, before.length, "same-width version keeps the byte length");

  const check = guard(dir);
  assert.equal(check.code, 0, check.out);
  assert.match(check.out, new RegExp("all cache-busted at v" + (from + 1) + "\\."));
});

test("bump leaves remote and data: references alone", () => {
  const html = baseHtml.replace('<link rel="stylesheet"', '<script src="https://cdn.example.com/x.js"></script>\n  <link rel="stylesheet"');
  const dir = fixture(html, "remote");
  assert.equal(bump(dir).code, 0);
  const after = read(dir);
  assert.ok(after.includes('<script src="https://cdn.example.com/x.js"></script>'), "protocol-relative/remote src untouched");
  assert.ok(after.includes('href="data:image/svg+xml'), "data: URI untouched");
});

test("bump repairs drift that the guard rejects", () => {
  const dir = fixture(withVersion(baseHtml, String(tags(baseHtml)[0]), "1"), "drift");
  // One tag left behind at the old version: the classic partial bump.
  const broken = read(dir).replace("js/data/doctrine.js?v=battle-rhythm-1", "js/data/doctrine.js?v=battle-rhythm-" + tags(baseHtml)[0]);
  fs.writeFileSync(path.join(dir, "index.html"), broken, "utf8");

  const failed = guard(dir);
  assert.equal(failed.code, 1, "guard must fail on drift");
  assert.match(failed.out, /distinct versions in use/);
  assert.match(failed.out, /Fix with: npm run bump:bust/);

  const result = bump(dir);
  assert.equal(result.code, 0, result.out);
  assert.deepEqual([...new Set(tags(read(dir)))].length, 1, "drift repaired");
  assert.equal(guard(dir).code, 0);
});

test("bump tags an untagged local reference that has no query string", () => {
  const dir = fixture(baseHtml, "untagged");
  const broken = read(dir).replace("js/data/wakelock.js?v=battle-rhythm-" + tags(baseHtml)[0], "js/data/wakelock.js");
  assert.notEqual(broken, baseHtml, "fixture edit must apply");
  fs.writeFileSync(path.join(dir, "index.html"), broken, "utf8");

  assert.equal(guard(dir).code, 1, "guard must fail on an untagged local reference");
  const result = bump(dir);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /1 previously untagged reference\(s\) tagged/);
  assert.match(read(dir), /js\/data\/wakelock\.js\?v=battle-rhythm-\d+/);
  assert.equal(guard(dir).code, 0);
});

test("bump refuses an untagged reference that already has a query string, and names the line", () => {
  const dir = fixture(baseHtml, "untaggable");
  const broken = read(dir).replace("js/data/wakelock.js?v=battle-rhythm-" + tags(baseHtml)[0], "js/data/wakelock.js?debug=1");
  fs.writeFileSync(path.join(dir, "index.html"), broken, "utf8");

  const before = read(dir);
  const result = bump(dir);
  assert.equal(result.code, 1, "appending &v= would not match the guard, so this must refuse");
  assert.match(result.out, /query string but no cache-buster tag/);
  assert.match(result.out, /index\.html:\d+\s+js\/data\/wakelock\.js\?debug=1/);
  assert.equal(read(dir), before, "a refusal must not modify the file");
});

test("an explicit version equal to the current one is a reported no-op", () => {
  const dir = fixture(baseHtml, "noop");
  const current = Number(tags(baseHtml)[0]);
  assert.equal(bump(dir, [String(current + 1)]).code, 0);
  const once = read(dir);

  const again = bump(dir, [String(current + 1)]);
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /already at v\d+ across \d+ local references — nothing to write/);
  assert.equal(read(dir), once, "a no-op run must not rewrite the file");
});

test("invalid arguments fail without touching the file", () => {
  const dir = fixture(baseHtml, "args");
  const before = read(dir);
  for (const args of [["--wat"], ["abc"], ["0"], ["-5"]]) {
    const result = bump(dir, args);
    assert.equal(result.code, 1, "args " + args.join(" ") + " should fail: " + result.out);
    assert.equal(read(dir), before, "args " + args.join(" ") + " must not write");
  }
});

test("neither tool passes vacuously when there are no local references", () => {
  const dir = fixture('<html><script src="https://cdn.example.com/x.js"></script></html>', "empty");
  const checked = guard(dir);
  assert.equal(checked.code, 1);
  assert.match(checked.out, /no local <script src> or <link href> references found/);
  const bumped = bump(dir);
  assert.equal(bumped.code, 1);
  assert.match(bumped.out, /refusing to rewrite a file it did not understand/);
});

test("the rewrite preserves line endings and line count", () => {
  const dir = fixture(baseHtml, "endings");
  assert.equal(bump(dir).code, 0);
  const after = read(dir);
  assert.equal(after.split("\n").length, baseHtml.split("\n").length);
  assert.equal(after.includes("\r\n"), baseHtml.includes("\r\n"));
});