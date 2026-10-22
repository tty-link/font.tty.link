/* font-studio-progress.js — 그린 단계 진행률 부품 하나 (PLAN-STUDIO-002 S3 '진행률 3벌 → 1')
 *
 * 디자인 칸의 그림 세트 진행률과 그리기 탭의 단계 줄이 같은 부품을 쓴다(전에는 디자인은 글 한 줄, 그리기는 따로 만든 막대).
 * 입력은 FontKku.authoringProgress(세트 | 칸 키)의 결과 { stages: [{ stage, have, missing, extra, total }], next }.
 * FontStudio.progress = { NAMES, render(list, report, { target, stageAttribute }) → list, text(report) → 한 줄 }.
 * render는 <ol>에 단계마다 <li class="studio-progress-stage" data-stage data-have data-total data-done data-target data-extra>
 * (이름 · n/m · 막대)를 만들고, 다시 부르면 그 자리를 고친다. 단계 밖의 <li>(그리기의 보조 원본 줄)는 건드리지 않는다.
 * 문자 매핑의 '준비된 자모와 빠진 자모'(글자로 만들기)는 다른 잣대(문자 후보가 있나)라 이 부품을 쓰지 않는다.
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var make = Util.element;

  var Studio = window.FontStudio;
  if (!Studio) {
    return;
  }

  var STAGES = Util.STAGE_ORDER;
  var NAMES = Object.assign({}, Util.STAGE_NAMES);

  function itemFor(list, stage, options) {
    var item = list.querySelector('[data-stage="' + stage + '"]');
    if (item) {
      return item;
    }
    item = make("li", "studio-progress-stage");
    item.dataset.stage = stage;
    if (options.stageAttribute) {
      item.dataset[options.stageAttribute] = stage;
    }
    item.appendChild(make("strong", "studio-progress-name", NAMES[stage] || stage));
    item.appendChild(make("span", "studio-progress-count"));
    var bar = make("span", "studio-progress-bar");
    bar.appendChild(make("span", "studio-progress-fill"));
    item.appendChild(bar);
    /* 단계 줄은 차례대로 — 단계 밖의 줄(보조 원본 등)보다 앞에 */
    var after = null;
    STAGES.slice(STAGES.indexOf(stage) + 1).some(function (next) {
      after = list.querySelector('[data-stage="' + next + '"]');
      return Boolean(after);
    });
    if (!after) {
      after = list.querySelector("li:not([data-stage])");
    }
    list.insertBefore(item, after);
    return item;
  }

  function render(list, report, options) {
    var opts = options || {};
    if (!list || !report || !Array.isArray(report.stages)) {
      return list;
    }
    list.classList.add("studio-progress");
    report.stages.forEach(function (row) {
      var item = itemFor(list, row.stage, opts);
      var have = row.have ? row.have.length : 0;
      var missing = row.missing || [];
      item.dataset.have = String(have);
      item.dataset.total = String(row.total);
      item.dataset.done = String(!missing.length);
      item.dataset.target = String(opts.target === row.stage);
      item.dataset.extra = String(row.extra ? row.extra.length : 0);
      item.querySelector(".studio-progress-count").textContent = have + "/" + row.total;
      item.querySelector(".studio-progress-fill").style.inlineSize = (row.total ? Math.round(have / row.total * 100) : 0) + "%";
      item.title = missing.length ? "남은 자모: " + missing.join(" ") : "다 그림";
    });
    return list;
  }

  function text(report) {
    if (!report || !Array.isArray(report.stages)) {
      return "";
    }
    return report.stages.map(function (row) {
      return (NAMES[row.stage] || row.stage) + " " + (row.have ? row.have.length : 0) + "/" + row.total;
    }).join(" · ") + (report.next ? " — 다음 목표 " + (NAMES[report.next] || report.next) : " — 모두 그림");
  }

  Studio.progress = { NAMES: NAMES, STAGES: STAGES.slice(), render: render, text: text };
})();
