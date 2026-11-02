"use strict";

/* 미리보기 점검(scripts/site_preview_check.py)이 브라우저에서 돌리는 JS를 파일에서 그대로 꺼내 가짜 DOM에 돌린다.
 * - HOSTS_JS('덜 그려짐'): 원고지 빈칸처럼 원문(data-source)이 빈 바탕 요소는 세지 않고, 원문이 있는데 음절이 없거나,
 *   글꼴을 기다리거나, 업그레이드 전이거나, 원문 기록이 아예 없으면 센다.
 * - LAZY_FRAMES_JS: 훑어 내리는 동안 열리지 않은 지연 iframe을 하나씩 화면에 데려와 열고, 끝내 안 열린 것을 돌려준다.
 * - SPRITES_JS: 그릴 차례(rAF)가 오지 않는 화면 밖 iframe(WebKit은 10초에 한 번)에서도 오래 붙잡히지 않는다. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "../scripts/site_preview_check.py"), "utf8");
const pick = (name) => new RegExp(`^${name} = """([\\s\\S]*?)"""`, "m").exec(script)[1];
const HOSTS_JS = pick("HOSTS_JS");
const LAZY_FRAMES_JS = pick("LAZY_FRAMES_JS");
const SPRITES_JS = pick("SPRITES_JS");

function host({ upgraded = true, pending = false, glyph = false, source, font = "crayon", text = "" } = {}) {
  const attrs = new Map();
  if (pending) attrs.set("data-fy-font-pending", "");
  if (source !== undefined) attrs.set("data-source", source);
  return {
    dataset: upgraded ? { fyUpgraded: "true", fyFont: font } : { fyFont: font },
    textContent: text,
    hasAttribute: (name) => attrs.has(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    querySelector: (selector) => (selector === '[part~="glyph"]' && glyph ? {} : null),
  };
}

function check(hosts) {
  const document = { querySelectorAll: () => hosts };
  return new Function("document", "window", `return (${HOSTS_JS})();`)(document, {});
}

test("empty manuscript cells are not counted as unfinished", () => {
  const result = check([
    host({ source: "오", glyph: true, text: "오" }),
    host({ source: "" }),
    host({ source: " " }),
  ]);
  assert.equal(result.hosts, 3);
  assert.equal(result.notReady, 0);
  assert.deepEqual(result.sample, []);
});

test("a host with text but no drawn syllable is still unfinished", () => {
  const result = check([host({ source: "날", text: "날" }), host({ source: "" })]);
  assert.equal(result.notReady, 1);
  assert.deepEqual(result.sample, ["crayon:날"]);
});

test("an empty host still waiting for its font or upgrade is unfinished", () => {
  const result = check([host({ source: "", pending: true }), host({ source: "", upgraded: false })]);
  assert.equal(result.notReady, 2);
});

test("a host without a data-source record is not treated as empty", () => {
  const result = check([host({})]);
  assert.equal(result.notReady, 1);
});

function frame({ src = "./examples/cafe-menu.html", visible = true, opensOnView = true, loaded = false } = {}) {
  let url = loaded ? src : "about:blank";
  const calls = { scrolled: 0 };
  return {
    calls,
    getAttribute: (name) => (name === "src" ? src : null),
    getClientRects: () => (visible ? [{}] : []),
    get contentDocument() { return { URL: url }; },
    scrollIntoView() { calls.scrolled += 1; if (opensOnView) setTimeout(() => { url = src; }, 30); },
  };
}

function openLazy(frames, timeout = 2000) {
  const document = { querySelectorAll: () => frames };
  return new Function("document", "scrollTo", `return (${LAZY_FRAMES_JS})`)(document, () => {})(timeout);
}

test("lazy iframes passed over while scrolling are brought into view until they open", async () => {
  const passed = frame({ src: "./examples/hangul-class.html" });
  const open = frame({ loaded: true });
  const hidden = frame({ visible: false });
  const noSrc = frame({ src: null });
  const result = await openLazy([open, passed, hidden, noSrc]);
  assert.deepEqual(result, { revisited: 1, unopened: [] });
  assert.equal(passed.calls.scrolled, 1);
  assert.equal(open.calls.scrolled + hidden.calls.scrolled + noSrc.calls.scrolled, 0);
});

test("an iframe that never opens is returned as unopened", async () => {
  const stuck = frame({ src: "./examples/certificate.html", opensOnView: false });
  const result = await openLazy([stuck], 250);
  assert.deepEqual(result, { revisited: 1, unopened: ["./examples/certificate.html"] });
});

test("the sprite wait does not hang on a frame whose animation frames are throttled", { timeout: 3000 }, async () => {
  const document = { querySelectorAll: () => [] };
  const neverPaints = () => {};
  const run = new Function("document", "getComputedStyle", "Image", "requestAnimationFrame", `return (${SPRITES_JS})`)(
    document, () => ({}), function Image() {}, neverPaints);
  const started = Date.now();
  assert.equal(await run(6000), 0);
  assert.ok(Date.now() - started < 2000, `waited ${Date.now() - started} ms`);
});
