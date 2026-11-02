"use strict";

/* 미리보기 점검(scripts/site_preview_check.py)의 '덜 그려짐' 판정식 HOSTS_JS를 파일에서 그대로 꺼내 가짜 바탕 요소에 돌린다.
 * 원고지 빈칸처럼 원문(data-source)이 빈 바탕 요소는 세지 않고, 원문이 있는데 음절이 없거나, 글꼴을 기다리거나,
 * 업그레이드 전이거나, 원문 기록이 아예 없으면 센다. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "../scripts/site_preview_check.py"), "utf8");
const HOSTS_JS = /^HOSTS_JS = """([\s\S]*?)"""/m.exec(script)[1];

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
