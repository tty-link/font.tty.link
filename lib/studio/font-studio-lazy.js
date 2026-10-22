/* font-studio-lazy.js — 무거운 모듈을 처음 쓸 때 싣기 (PLAN-STUDIO-002 S1 모듈 수명과 성능)
 *
 * 처음 화면에 필요 없는 모듈(조립식 후보·출처·그리기·독립 SVG·글꼴 팔레트·글꼴 파일 내보내기, S6부터 자소판·검수 페이지 모듈)은 index.html에
 * <script type="text/x-font-studio-lazy" data-studio-lazy="<무리>" src="…">로만 적는다 — 브라우저는 이런 type의 src를 받지도
 * 돌리지도 않는다. 이 파일이 그 목록을 읽어 FontStudio.need(이름)가 처음 불릴 때 같은 주소(문서 기준 — npm 패키지·mount
 * iframe·file:// 모두 정적 태그와 같다)로 차례대로 싣는다. 목록이 HTML에 있으니 패키지 검사(check_distribution.py)가 주소를 본다.
 *
 * 언제 싣나(처음 쓸 때):
 * - palette: 디자인 페이지에서 '글꼴 팔레트' 탭이 깨면(탭은 처음부터 자리로 있다)
 * - recipes: 디자인 페이지에서 자모를 고르면(또는 고른 채 디자인 페이지로 오면)
 * - provenance: 디자인·고치기 페이지에서 자모를 고르면
 * - draw(독립 SVG 포함): '그리기 8 → 24 → 40' 단추, 주소 #draw, 그림 문서가 든 초안·프로젝트·묶음을 열 때
 * - export: 자소판의 글꼴 파일(TTF) 내보내기
 * - reach: 고치기 페이지에서 자모를 고르면(바뀔 곳의 '현대 한글 n자' 셈, S4), api.edit의 reach.total
 * - looks: 검수 페이지가 처음 깨면(검수 칸의 꾸밈·바탕 목록 — authoring/themes-data.js의 전역 FontKkuThemes, S5-C)
 * - material: 자소판 페이지가 보이면, 그림 자소 글꼴을 열면(어느 페이지든), PNG 열기(S6)
 * - review: 검수 페이지가 보이면(material 다음), 자동화 계약 review.*(S6)
 * 실패하면 작업실 알림으로 알리고 그 기능만 쓰지 못한다(mount는 죽지 않는다 — bridge.js 필수 목록은 핵심만).
 * FontStudio.need(이름) → Promise<모듈>, FontStudio.loaded(이름?) → bool | 실린 이름 목록, FontStudio.loading() → 싣는 중인가.
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  if (!Studio) {
    return;
  }
  var studioRoot = document.querySelector("[data-studio]");
  var ALIASES = { drawDetach: "draw", "draw-detach": "draw" };
  var LABELS = { recipes: "조립식 후보", provenance: "출처", draw: "그리기", palette: "글꼴 팔레트", "export": "글꼴 파일 내보내기",
    reach: "현대 한글 수 세기", looks: "꾸밈·바탕 목록", material: "자소판", review: "검수" };
  var groups = {};
  var pending = 0;

  function words(tag, name) {
    return (tag.getAttribute(name) || "").split(/\s+/).filter(Boolean);
  }

  Array.prototype.forEach.call(document.querySelectorAll("script[data-studio-lazy]"), function (tag) {
    var name = tag.getAttribute("data-studio-lazy");
    groups[name] = groups[name] || { name: name, scripts: [], state: "idle", promise: null, error: null, pages: [], needs: [] };
    groups[name].scripts.push({ url: tag.src, global: tag.getAttribute("data-studio-global") || null });
    /* 페이지 무리(S6): data-studio-lazy-pages — 그 페이지가 보이면 싣는다. data-studio-lazy-needs — 그 무리를 먼저 싣는다 */
    words(tag, "data-studio-lazy-pages").forEach(function (page) {
      if (groups[name].pages.indexOf(page) < 0) { groups[name].pages.push(page); }
    });
    words(tag, "data-studio-lazy-needs").forEach(function (other) {
      if (groups[name].needs.indexOf(other) < 0) { groups[name].needs.push(other); }
    });
  });

  function keyOf(name) {
    return Object.prototype.hasOwnProperty.call(ALIASES, name) ? ALIASES[name] : name;
  }

  /* 그 이름이 내주는 것 — export는 전역 FontKkuExport, looks는 전역 FontKkuThemes(자료만), 나머지는 FontStudio[이름] */
  function provided(name) {
    return name === "export" ? window.FontKkuExport : name === "looks" ? window.FontKkuThemes : Studio[name];
  }

  function present(item) {
    if (item.global && window[item.global]) {
      return true; // 쪽이 따로 실었다(옛 호스트 쪽·시험)
    }
    return Array.prototype.some.call(document.querySelectorAll("script[data-studio-lazy-loaded]"), function (tag) {
      return tag.src === item.url;
    });
  }

  function inject(item) {
    if (present(item)) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.async = false;
      script.src = item.url;
      script.setAttribute("data-studio-lazy-loaded", "");
      script.addEventListener("load", function () { resolve(); }, { once: true });
      script.addEventListener("error", function () {
        script.remove(); // 다시 청하면 새로 받는다
        var error = new Error("font-studio: could not load " + item.url);
        error.code = "STUDIO_MODULE_LOAD_FAILED";
        reject(error);
      }, { once: true });
      document.body.appendChild(script);
    });
  }

  function mark() {
    if (studioRoot) {
      studioRoot.dataset.lazyLoaded = Object.keys(groups).filter(function (name) { return groups[name].state === "loaded"; }).join(" ");
      studioRoot.dataset.lazyLoading = String(pending > 0);
    }
  }

  function need(name) {
    var key = keyOf(name);
    var group = groups[key];
    if (!group) {
      var ready = provided(name);
      return ready ? Promise.resolve(ready)
        : Promise.reject(new TypeError("font-studio: need(" + JSON.stringify(name) + ") — modules are " + Object.keys(groups).concat(Object.keys(ALIASES)).join(", ")));
    }
    if (!group.promise) {
      group.state = "loading";
      group.error = null;
      pending += 1;
      mark();
      /* 먼저 실을 무리(needs) — 실패하면 이 무리도 실패로 본다 */
      var first = group.needs.filter(function (other) { return groups[other] && other !== key; }).reduce(function (chain, other) {
        return chain.then(function () { return need(other); });
      }, Promise.resolve());
      group.promise = group.scripts.reduce(function (chain, item) {
        return chain.then(function () { return inject(item); });
      }, first).then(function () {
        if (!provided(key)) {
          var error = new Error("font-studio: module " + key + " did not initialize");
          error.code = "STUDIO_MODULE_INIT_FAILED";
          throw error;
        }
        group.state = "loaded";
        pending -= 1;
        mark();
        if (typeof Studio.moduleLoaded === "function") {
          Studio.moduleLoaded(key); // 먼저 붙은 모듈(자동화 계약 등)이 늦게 온 모듈에 붙게
        }
        return provided(key);
      }, function (error) {
        throw error;
      }).catch(function (error) {
        if (group.state === "loading") {
          pending -= 1;
        }
        group.state = "failed";
        group.error = error;
        group.promise = null; // 다음에 청하면 다시 해 본다
        mark();
        if (studioRoot) {
          studioRoot.dataset.lazyError = key;
        }
        if (typeof Studio.message === "function") {
          Studio.message((LABELS[key] || key) + " 모듈을 싣지 못해 이 기능을 쓸 수 없습니다. 연결을 확인하고 다시 해 보세요.", "error",
            error && error.message);
        }
        throw error;
      });
    }
    return group.promise.then(function () { return provided(name); });
  }

  /* 청한 것만 — 처리기 안에서 실패를 다시 던지지 않는다(알림은 need가 띄운다) */
  function want(name) {
    need(name).catch(function () {});
  }

  Studio.need = need;
  Studio.loaded = function (name) {
    if (name === undefined) {
      return Object.keys(groups).filter(function (key) { return groups[key].state === "loaded"; });
    }
    var group = groups[keyOf(name)];
    return group ? group.state === "loaded" : Boolean(provided(name));
  };
  Studio.loading = function () { return pending > 0; };
  Studio.lazyModules = function () {
    var out = {};
    Object.keys(groups).forEach(function (key) {
      out[key] = { state: groups[key].state, scripts: groups[key].scripts.map(function (item) { return item.url; }),
        error: groups[key].error ? groups[key].error.message : null };
    });
    return out;
  };
  mark();

  // ── 언제 싣나 ───────────────────────────────────────────────────────

  function page() {
    return typeof Studio.page === "function" ? Studio.page() : null;
  }

  /* 고른 자모 — 디자인 페이지면 조립식 후보, 디자인·고치기 페이지면 출처 */
  function onSelection() {
    var node = typeof Studio.selected === "function" ? Studio.selected() : null;
    if (!node) {
      return;
    }
    if (groups.provenance && !Studio.provenance && (page() === "design" || page() === "edit")) {
      want("provenance");
    }
    if (groups.recipes && !Studio.recipes && page() === "design") {
      want("recipes");
    }
  }
  Studio.on("select", onSelection);
  Studio.on("page", onSelection);

  /* 글꼴 팔레트 탭 — 자리를 먼저 붙이고(글꼴 재료일 때 탭이 보인다) 깨면 싣는다. 모듈이 같은 id로 붙으면 이어받는다 */
  if (groups.palette && Studio.f && !Studio.palette) {
    Studio.f.mount("palette", { label: "글꼴 팔레트", modes: ["font"], mode: "precise", placeholder: true, activate: function () { want("palette"); } });
  }

  /* 그리기 — 디자인 칸의 입구 단추는 처음부터 있다(누르면 싣고 모듈의 단추를 누른다) */
  function savedDrawing(options) {
    var saved = options && options.design && options.design.participants;
    return Boolean(saved && typeof saved === "object" && saved.drawings);
  }

  function drawEntry() {
    var pick = document.querySelector("[data-studio-design] .studio-design-pick");
    if (!pick || Studio.draw || pick.querySelector("[data-draw-entry-row]")) {
      return;
    }
    var row = document.createElement("p");
    row.className = "studio-draw-entry";
    row.setAttribute("data-draw-entry-row", "");
    row.setAttribute("data-studio-lazy-stub", "draw");
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-draw-entry", "");
    button.textContent = "그리기 8 → 24 → 40";
    var hint = document.createElement("small");
    hint.textContent = "원형 8(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)부터 직접 그립니다 — 나머지는 조립식이 만들고, 그린 세트는 첫 획을 그을 때 디자인에 들어갑니다.";
    row.appendChild(button);
    row.appendChild(hint);
    pick.appendChild(row);
    button.addEventListener("click", function () {
      button.disabled = true;
      need("draw").then(function () {
        var real = document.querySelector("[data-draw-entry]");
        if (real && real !== button) {
          real.click();
        }
      }, function () {
        button.disabled = false;
      });
    });
  }

  if (groups.draw && !Studio.draw) {
    drawEntry();
    Studio.on("load", function (options) {
      if (savedDrawing(options)) {
        want("draw");
      }
    });
    if (location.hash === "#draw" || savedDrawing(typeof Studio.lastLoadOptions === "function" ? Studio.lastLoadOptions() : null)) {
      want("draw");
    }
  }

  /* 페이지 무리(PLAN-STUDIO-002 S6 성능) — 여는 페이지의 화면 모듈만 처음 싣는다. 무리에 적은 페이지(data-studio-lazy-pages)가
   * 보이면(처음 연 페이지 포함) 싣는다:
   * - material(자소판 편집기·자소판 모델): 자소판 페이지. 그리고 그림 자소 글꼴을 열면 어느 페이지에서나 — 미리보기에 거는 고친
   *   자소판(초안·묶음)과 저장할 자소판 그림을 이 모듈이 들고 있다. 다른 글꼴에서는 하는 일이 없다(state.active false)
   * - review(검수): 검수 페이지(자동화 계약 review.*는 FontStudio.need로 싣는다). 자소판 바뀜을 받으려고 material 다음에 싣는다.
   *   싣기 전의 검수 기록은 작업실이 불러온 그대로 저장에 넘긴다(projectSnapshot — 실리지 않은 모듈은 기록을 바꿀 수 없다)
   * 싣는 동안 FontStudio.loading()이 참이라 settled()·mount ready가 기다린다 */
  function pageGroups() {
    var now = page();
    Object.keys(groups).forEach(function (name) {
      if (groups[name].pages.indexOf(now) >= 0 && !provided(name)) {
        want(name);
      }
    });
  }

  function spriteFont() {
    var Model = window.FontStudioModel;
    var source = typeof Studio.doc === "function" && Studio.doc() ? Studio.doc() : typeof Studio.css === "function" ? Studio.css() : "";
    if (!source || !Model || typeof Model.readMetadata !== "function") {
      return false;
    }
    try {
      return Model.readMetadata(source).material === "sprite";
    } catch (error) {
      return false;
    }
  }

  function spriteGroups() {
    if (groups.material && !Studio.material && spriteFont()) {
      want("material");
    }
  }

  Studio.on("page", pageGroups);
  Studio.on("load", spriteGroups);
  pageGroups();
  spriteGroups();
})();
