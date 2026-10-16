"use strict";

/* 소개 페이지의 AI 답 세트(src/landing-ai-sets.js) — 답 HTML을 고치지 않고 그 등록 코드를 그대로 돌려 얻은 칸이
 * 원형 8칸 칸 계약 세트이고, 그 8칸만으로 현대 자모가 모두 조립되며(원소 획·CSS 상자로 대체 없음), 소개가 내세우는
 * 숫자(ㄱ을 고치면 바뀌는 3,444자)가 조립 계획에서 나온다는 것을 DOM 없이 확인한다. */

const test = require("node:test");
const assert = require("node:assert/strict");

const path = require("node:path");
require(path.resolve(process.env.FONT_KKU_PACKAGE_DIR || path.join(__dirname, "../dist/lib"), "font-kku.js"));
const FontKku = globalThis.FontKku;
const Sets = require("../src/landing-ai-sets.js");

const ORIGIN8 = ["ㄱ", "ㄴ", "ㅁ", "ㅅ", "ㅇ", "ㆍ", "ㅡ", "ㅣ"];
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("");

function cellsOf(jamo, set, role, context) {
  const used = new Set();
  const plan = FontKku.planJamo(jamo, { set, role, context });
  for (const item of plan.items) {
    assert.ok(item.drawing || item.alias, `${set} ${jamo} (${role}) has a stroke drawn by no cell`);
    if (item.drawing) used.add(item.drawing);
    if (item.alias) used.add(item.alias);
  }
  return used;
}

test("AI answers are recorded unedited and register the 8 origin cells as box-frame sets", () => {
  assert.deepEqual(Sets.sets.map((set) => set.id),
    ["claude-marker-1", "claude-marker-2", "claude-brush-1", "claude-balloon-1", "claude-balloon-2", "claude-pen-1"]);
  for (const set of Sets.sets) {
    assert.equal(set.edited, false, set.id);
    assert.match(set.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(set.by && set.where && set.attempt && set.feel, set.id);
    const read = Sets.read(set);
    assert.ok(read, `${set.id}: the answer registers a set`);
    assert.deepEqual(Object.keys(read.cells), ORIGIN8, set.id);
    assert.equal(read.options.frame, "box", set.id);
    assert.match(read.width, /^0\.\d+em$/, set.id);
    for (const key of ORIGIN8) {
      const cell = read.cells[key];
      assert.equal(cell.box.length, 4, `${set.id} ${key}`);
      assert.ok(cell.box[2] > cell.box[0] && cell.box[3] > cell.box[1], `${set.id} ${key} box`);
      assert.ok(cell.shapes.length > 0, `${set.id} ${key} shapes`);
    }
    /* 대화창 답 하나에 들어가는 크기 — 칸 자료는 1KB 안팎 */
    assert.ok(Buffer.byteLength(JSON.stringify(read.cells)) < 1200, `${set.id} cells stay around 1KB`);
    const result = FontKku.registerJamo(set.id, read.cells, read.options);
    assert.deepEqual(result, { name: set.id, cells: 8 });
  }
});

test("the 8 cells assemble every modern jamo, and redrawing ㄱ changes 3,444 syllables", () => {
  for (const set of Sets.sets) {
    const cho = CHO.map((j) => ({ cho: cellsOf(j, set.id, "initial", "cho"), bar: cellsOf(j, set.id, "initial", "bar") }));
    const jung = JUNG.map((j) => cellsOf(j, set.id, "medial"));
    const jong = [new Set()].concat(JONG.map((j) => cellsOf(j, set.id, "final", "jong")));
    const counts = {};
    for (const key of ORIGIN8) {
      let n = 0;
      for (let l = 0; l < 19; l += 1) {
        for (let v = 0; v < 21; v += 1) {
          const initial = "ㅗㅛㅜㅠㅡ".includes(JUNG[v]) ? cho[l].bar : cho[l].cho;
          for (let t = 0; t < 28; t += 1) {
            if (initial.has(key) || jung[v].has(key) || jong[t].has(key)) n += 1;
          }
        }
      }
      counts[key] = n;
    }
    /* ㄱ은 ㄱ·ㄲ·ㅋ 초성(3 × 21 × 28)과 나머지 초성의 ㄱ·ㄲ·ㄳ·ㄺ·ㅋ 받침(16 × 21 × 5) */
    assert.equal(counts["ㄱ"], 3 * 21 * 28 + 16 * 21 * 5, set.id);
    for (const key of ORIGIN8) {
      assert.ok(counts[key] > 0 && counts[key] <= 11172, `${set.id} ${key} ${counts[key]}`);
    }
  }
});

test("the prompt links the usage guide and asks for the 8 origin cells", () => {
  const prompt = Sets.prompt(Sets.MARKER);
  assert.ok(prompt.startsWith("이 설명서를 읽고 따라 해 줘: https://font.tty.link/lib/skill/SKILL.md"));
  assert.match(prompt, /원형 8칸 ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ/);
  assert.match(prompt, /frame: "box"/);
  assert.ok(prompt.includes("느낌: " + Sets.MARKER));
  const feels = [Sets.MARKER, Sets.BRUSH, Sets.BALLOON, Sets.PEN];
  for (const set of Sets.sets) {
    assert.ok(feels.includes(set.feel), set.id);
  }
  /* 소개의 느낌 고르기는 답이 있는 느낌만 둔다 — 느낌마다 실제로 받은 답이 하나 이상 */
  for (const feel of feels) {
    assert.ok(Sets.sets.some((set) => set.feel === feel), feel);
  }
  /* 같은 대화에서 고쳐 달라고 한 답은 그 부탁 글을 함께 싣는다 */
  for (const set of Sets.sets.filter((item) => /고쳐/.test(item.attempt))) {
    assert.ok(typeof set.followup === "string" && set.followup.length > 0, set.id);
  }
});
