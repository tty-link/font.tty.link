/* font-studio-f-shell.js — 작업실 디자인 도구 탭 껍데기와 모듈 수명 (설계 v1.2 §13.3–13.6, PLAN-HANGUL-001 F0, PLAN-STUDIO-002 S1)
 *
 * 뒤 묶음(조립식 비교·그리기·독립 SVG·팔레트·편집 기록·묶음·출처)이 자기 칸을 붙이는 자리다. FontStudio.f.mount(id, opts)가
 * [data-studio-f=id] 칸(HTML에 없으면 만든다)을 돌려주고 보이기를 맡는다:
 * - 디자인 본문([data-design-main]) 안의 칸은 탭 하나씩 — 탭 줄([data-studio-f-tabs])은 보일 탭이 하나라도 있을 때만 보인다
 * - opts.group이 있으면 그 탭을 고를 때 함께 보인다(탭을 따로 두지 않는다)
 * - 본문 밖의 칸(파일 줄의 묶음, 살펴보기의 출처)은 탭 없이 보인다
 * opts.modes(['svg'|'font'|'primitive'])가 있으면 지금 디자인 재료가 그중 하나일 때만 보인다 — 디자인 change 사건마다 다시 가린다.
 * 보이기·숨기기는 [hidden]만 쓴다. 아무 칸도 붙이지 않으면 화면은 F0 이전과 같다.
 *
 * 모듈 수명(S1): 칸이 실제로 보일 때만 '깨어 있다'(active) — 칸이 [hidden]이 아니고, 지금 작업실 페이지가 그 칸의 페이지이고
 * (opts.pages, 없으면 칸을 둘러싼 [data-studio-pages]), 디자인 본문 안이면 본문이 펼쳐져 있고, opts.mode가 있으면 작업실 모드
 * ([data-studio] data-studio-mode, 없으면 precise)가 같을 때. 깨면 opts.activate(ctx)를, 잠들면 opts.deactivate()를 부른다.
 * ctx의 도우미(on·onRender·listen·setTimeout·setInterval·lease)로 단 것은 잠들 때 저절로 걷힌다 — 감춰진 페이지·탭의 모듈은
 * 렌더 훅을 받지 않고 타이머도 돌지 않는다. 칸이 없는 모듈(검수·재료·디자인 비교)은 f.lifecycle(id, opts)로 같은 수명을 쓴다.
 * opts.onShow/onHide(칸 [hidden]이 바뀔 때)는 예전 그대로 돈다.
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var nav = document.querySelector("[data-studio-f-tabs]");
  var main = document.querySelector("[data-design-main]");
  var studioRoot = document.querySelector("[data-studio]");
  if (!Studio || !nav || !main) {
    return;
  }

  var MODES = ["primitive", "svg", "font"];
  var STUDIO_MODES = ["easy", "precise"];
  var HOOKS = ["load", "select", "project", "render", "page"];
  var mounts = {};
  var order = [];
  var current = null;
  var dispatching = {};

  function designMode() {
    var design = Studio.design;
    return design && design.state && design.state.json ? design.state.json.mode : null;
  }

  /* 보일 수 있는가 — 지금 디자인 재료(opts.modes)와 작업실 모드(opts.mode — 정밀 전용 탭·칸은 쉬운 모드에서 감춘다, S3) */
  function allowed(entry) {
    return (!entry.modes || entry.modes.indexOf(designMode()) >= 0) && modeAllows(entry);
  }

  function modeAllows(entry) {
    return !entry.mode || entry.mode === studioMode();
  }

  function tabbed(entry) {
    return entry.kind === "tab";
  }

  function visibleTabs() {
    return order.filter(function (id) { return tabbed(mounts[id]) && allowed(mounts[id]); });
  }

  function later(error) {
    setTimeout(function () { throw error; }, 0);
  }

  // ── 수명 ────────────────────────────────────────────────────────────

  function studioPage() {
    return typeof Studio.page === "function" ? Studio.page() : studioRoot ? studioRoot.dataset.page : null;
  }

  function studioMode() {
    var mode = studioRoot && studioRoot.dataset.studioMode;
    return STUDIO_MODES.indexOf(mode) >= 0 ? mode : "precise";
  }

  /* 칸의 페이지 — opts.pages, 없으면 칸을 둘러싼 [data-studio-pages](칸 자신 포함), 그것도 없으면 모든 페이지(null) */
  function pagesOf(entry) {
    if (entry.pages) {
      return entry.pages;
    }
    var holder = entry.section && entry.section.closest ? entry.section.closest("[data-studio-pages]") : null;
    return holder ? holder.getAttribute("data-studio-pages").split(/\s+/).filter(Boolean) : null;
  }

  function wakeful(entry) {
    if (entry.section && entry.section.hidden) {
      return false;
    }
    if (entry.section && main.contains(entry.section) && main.hidden) {
      return false; // 디자인 본문을 접었다
    }
    if (entry.watch && entry.watch.closest && entry.watch.closest("[hidden]")) {
      return false;
    }
    var pages = pagesOf(entry);
    if (pages && pages.indexOf(studioPage()) < 0) {
      return false;
    }
    return modeAllows(entry);
  }

  /* 깨어 있는 동안만 쓰는 도우미 — 잠들면(dispose) 모두 걷는다 */
  function makeContext(entry) {
    var timers = [];
    var intervals = [];
    var listeners = [];
    var undo = [];
    var leases = [];
    var disposed = false;
    var ctx = {
      id: entry.id,
      section: entry.section,
      active: function () { return !disposed && entry.ctx === ctx; },
      /* 작업실 훅(load·select·project·render·page) — 깨어 있는 동안만 받는다 */
      on: function (name, listener) {
        if (HOOKS.indexOf(name) < 0 || typeof listener !== "function") {
          throw new TypeError("font-studio: f ctx.on(" + JSON.stringify(name) + ") — hooks are " + HOOKS.join(", "));
        }
        if (!disposed) {
          listeners.push({ name: name, listener: listener });
          dispatch(name);
        }
        return ctx;
      },
      onRender: function (listener) { return ctx.on("render", listener); },
      /* DOM 사건(addEventListener) 또는 on/off 사건 판(design·draw) — 잠들면 뗀다 */
      listen: function (target, name, listener) {
        if (disposed || !target) {
          return ctx;
        }
        if (typeof target.addEventListener === "function") {
          target.addEventListener(name, listener);
          undo.push(function () { target.removeEventListener(name, listener); });
        } else if (typeof target.on === "function") {
          var off = target.on(name, listener);
          undo.push(typeof off === "function" ? off : function () {
            if (typeof target.off === "function") { target.off(name, listener); }
          });
        }
        return ctx;
      },
      setTimeout: function (callback, ms) {
        if (disposed) {
          return null;
        }
        var id = setTimeout(function () {
          timers = timers.filter(function (entryId) { return entryId !== id; });
          if (ctx.active()) {
            callback();
          }
        }, ms);
        timers.push(id);
        return id;
      },
      clearTimeout: function (id) {
        clearTimeout(id);
        timers = timers.filter(function (entryId) { return entryId !== id; });
      },
      setInterval: function (callback, ms) {
        if (disposed) {
          return null;
        }
        var id = setInterval(function () {
          if (ctx.active()) {
            callback();
          }
        }, ms);
        intervals.push(id);
        return id;
      },
      clearInterval: function (id) {
        clearInterval(id);
        intervals = intervals.filter(function (entryId) { return entryId !== id; });
      },
      /* 미리보기 root(그림자 뿌리)가 글꼴 시트를 받게 한다 — 잠들면 놓는다(그 root는 제 chrome만 남는다) */
      lease: function (root, chrome) {
        if (!disposed && root) {
          Studio.addPreviewRoot(root, chrome || []);
          leases.push(root);
        }
        return root;
      },
      /* 한 일 하나를 센다(시험·측정: f.workCounts()) */
      work: function () {
        entry.works += 1;
      },
      _listeners: function (name) {
        return listeners.filter(function (item) { return item.name === name; }).map(function (item) { return item.listener; });
      },
      _dispose: function () {
        disposed = true;
        timers.forEach(clearTimeout);
        intervals.forEach(clearInterval);
        timers = [];
        intervals = [];
        listeners = [];
        undo.splice(0).forEach(function (fn) {
          try { fn(); } catch (error) { later(error); }
        });
        if (typeof Studio.removePreviewRoot === "function") {
          leases.forEach(function (root) { Studio.removePreviewRoot(root); });
        }
        leases = [];
      }
    };
    return ctx;
  }

  /* 작업실 훅 하나를 처음 쓸 때 한 번 구독하고, 깨어 있는 모듈의 처리기에만 넘긴다 */
  function dispatch(name) {
    if (dispatching[name]) {
      return;
    }
    dispatching[name] = true;
    Studio.on(name, function (payload) {
      order.forEach(function (id) {
        var entry = mounts[id];
        if (!entry.ctx || !entry.active) {
          return;
        }
        entry.ctx._listeners(name).forEach(function (listener) {
          if (!entry.active) {
            return; // 앞 처리기가 페이지를 바꿔 잠들었다
          }
          try {
            listener(payload);
          } catch (error) {
            later(error);
          }
        });
      });
    });
  }

  function sleep(entry) {
    if (!entry.active) {
      return;
    }
    entry.active = false;
    var ctx = entry.ctx;
    entry.ctx = null;
    if (ctx) {
      ctx._dispose();
    }
    if (entry.deactivate) {
      try {
        entry.deactivate();
      } catch (error) {
        later(error);
      }
    }
    entry.flips += 1;
  }

  function wake(entry) {
    if (entry.active) {
      return;
    }
    entry.active = true;
    entry.flips += 1;
    entry.ctx = makeContext(entry);
    if (entry.activate) {
      try {
        entry.activate(entry.ctx);
      } catch (error) {
        later(error);
      }
    }
  }

  /* 깨어 있을 것을 다시 가린다 — 잠들 것부터(나눠 쓰는 것을 먼저 놓는다) */
  function syncLife() {
    var next = order.map(function (id) { return wakeful(mounts[id]); });
    order.forEach(function (id, index) {
      if (!next[index]) {
        sleep(mounts[id]);
      }
    });
    order.forEach(function (id, index) {
      if (next[index] && mounts[id] && !mounts[id].active) {
        wake(mounts[id]);
      }
    });
  }

  // ── 칸 보이기 ───────────────────────────────────────────────────────

  /* 탭 줄·칸 보이기를 지금 탭과 재료에 맞춘다 */
  function sync() {
    var tabs = visibleTabs();
    if (tabs.indexOf(current) < 0) {
      current = tabs[0] || null;
    }
    nav.hidden = tabs.length === 0;
    order.forEach(function (id) {
      var entry = mounts[id];
      if (entry.kind === "life") {
        return;
      }
      var was = !entry.section.hidden;
      var show = allowed(entry) && (entry.kind === "free" || (entry.kind === "tab" ? id === current : entry.group === current));
      entry.section.hidden = !show;
      if (entry.tab) {
        entry.tab.hidden = !allowed(entry);
        entry.tab.setAttribute("aria-selected", String(id === current));
        entry.tab.tabIndex = id === current ? 0 : -1;
      }
      if (show !== was) {
        var callback = show ? entry.onShow : entry.onHide;
        if (callback) {
          try {
            callback(entry.section);
          } catch (error) {
            later(error);
          }
        }
      }
    });
    nav.dataset.current = current || "";
    syncLife();
  }

  /* HTML에 없는 칸은 본문의 마지막 F 칸 뒤(없으면 탭 줄 뒤)에 만든다 */
  function sectionFor(id, kind) {
    var section = document.querySelector('[data-studio-f="' + id + '"]');
    if (section) {
      return section;
    }
    section = document.createElement("section");
    section.className = "studio-f-panel";
    section.dataset.studioF = id;
    section.hidden = true;
    if (kind === "free") {
      main.appendChild(section);
      return section;
    }
    var panels = main.querySelectorAll("[data-studio-f]");
    var after = panels.length ? panels[panels.length - 1] : nav;
    after.parentNode.insertBefore(section, after.nextSibling);
    return section;
  }

  function makeTab(entry) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "studio-f-tab";
    button.id = "studio-f-tab-" + entry.id;
    button.dataset.studioFTab = entry.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", entry.section.id || (entry.section.id = "studio-f-" + entry.id));
    button.setAttribute("aria-selected", "false");
    button.textContent = entry.label;
    entry.section.setAttribute("role", "tabpanel");
    entry.section.setAttribute("aria-labelledby", button.id);
    nav.appendChild(button);
    return button;
  }

  function checkId(id, what) {
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new TypeError("font-studio: " + what + " id must match /^[a-z][a-z0-9-]*$/ (got " + JSON.stringify(id) + ")");
    }
  }

  function lifeOptions(entry, opts) {
    entry.pages = Array.isArray(opts.pages) && opts.pages.length ? opts.pages.slice() : null;
    entry.mode = STUDIO_MODES.indexOf(opts.mode) >= 0 ? opts.mode : null;
    entry.activate = typeof opts.activate === "function" ? opts.activate : null;
    entry.deactivate = typeof opts.deactivate === "function" ? opts.deactivate : null;
  }

  /* 늦게 싣는 모듈의 자리(opts.placeholder)를 그 모듈이 같은 id로 붙이면 이어받는다 — 칸·탭은 그대로, 처리기만 바꾼다 */
  function upgrade(entry, opts) {
    var wasActive = entry.active;
    sleep(entry); // 자리의 수명(모듈 싣기 청하기)을 끝낸다
    entry.placeholder = false;
    if (opts.label) {
      entry.label = String(opts.label);
      if (entry.tab) {
        entry.tab.textContent = entry.label;
      }
    }
    entry.onShow = typeof opts.onShow === "function" ? opts.onShow : null;
    entry.onHide = typeof opts.onHide === "function" ? opts.onHide : null;
    lifeOptions(entry, opts);
    if (!entry.section.hidden && entry.onShow) {
      try {
        entry.onShow(entry.section); // 자리일 때 이미 보였다 — 모듈에는 처음 보이는 것이다
      } catch (error) {
        later(error);
      }
    }
    if (wasActive || wakeful(entry)) {
      syncLife();
    }
    return entry.section;
  }

  /* mount(id, { label, modes?, group?, tab?, onShow?, onHide?, pages?, mode?, activate?(ctx), deactivate?(), placeholder? }) → 칸(section).
   * 같은 id를 다시 붙이면 같은 칸을 돌려준다(자리였으면 이어받는다) */
  function mount(id, options) {
    var opts = options || {};
    checkId(id, "f.mount");
    if (mounts[id]) {
      return mounts[id].placeholder && !opts.placeholder ? upgrade(mounts[id], opts) : mounts[id].section;
    }
    var modes = Array.isArray(opts.modes) ? opts.modes.filter(function (mode) { return MODES.indexOf(mode) >= 0; }) : null;
    var existing = document.querySelector('[data-studio-f="' + id + '"]');
    var kind = opts.group ? "group" : opts.tab === false || (existing && !main.contains(existing)) ? "free" : "tab";
    var entry = {
      id: id,
      label: String(opts.label || id),
      modes: modes && modes.length ? modes : null,
      group: opts.group || null,
      kind: kind,
      section: sectionFor(id, kind),
      tab: null,
      onShow: typeof opts.onShow === "function" ? opts.onShow : null,
      onHide: typeof opts.onHide === "function" ? opts.onHide : null,
      placeholder: Boolean(opts.placeholder),
      watch: null,
      active: false,
      ctx: null,
      works: 0,
      flips: 0
    };
    lifeOptions(entry, opts);
    entry.section.classList.add("studio-f-panel");
    entry.section.dataset.studioFKind = kind;
    if (kind === "tab") {
      entry.tab = makeTab(entry);
    }
    mounts[id] = entry;
    order.push(id);
    sync();
    return entry.section;
  }

  /* 칸 없는 모듈의 수명 — lifecycle(id, { pages?, element?, mode?, activate?(ctx), deactivate?() }). element가 [hidden] 안이면 잠든다.
   * → { active(), ctx() } */
  function lifecycle(id, options) {
    var opts = options || {};
    checkId(id, "f.lifecycle");
    if (mounts[id]) {
      throw new Error("font-studio: f.lifecycle " + id + " is already registered");
    }
    var entry = {
      id: id, label: id, modes: null, group: null, kind: "life", section: null, tab: null, onShow: null, onHide: null,
      placeholder: false, watch: opts.element || null, active: false, ctx: null, works: 0, flips: 0
    };
    lifeOptions(entry, opts);
    mounts[id] = entry;
    order.push(id);
    syncLife();
    return {
      active: function () { return entry.active; },
      ctx: function () { return entry.ctx; },
      work: function () { entry.works += 1; }
    };
  }

  /* 그 칸(또는 그 칸이 따르는 탭)을 고른다. 지금 재료에서 보이지 않는 칸이면 false */
  function show(id) {
    var entry = mounts[id];
    if (!entry || entry.kind === "life" || !allowed(entry)) {
      return false;
    }
    var tab = entry.kind === "group" ? mounts[entry.group] : entry;
    if (tab && tab.kind === "tab") {
      if (!allowed(tab)) {
        return false;
      }
      current = tab.id;
    }
    if (main.hidden && Studio.design && Studio.design.fold) {
      Studio.design.fold(true);
    }
    sync();
    return !entry.section.hidden;
  }

  nav.addEventListener("click", function (event) {
    var button = event.target.closest("[data-studio-f-tab]");
    if (button) {
      show(button.dataset.studioFTab);
    }
  });

  /* 탭 줄 방향키(←·→·Home·End) */
  nav.addEventListener("keydown", function (event) {
    var tabs = visibleTabs();
    var index = tabs.indexOf(current);
    var next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length]
      : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : null;
    if (next && show(next)) {
      event.preventDefault();
      mounts[next].tab.focus();
    }
  });

  if (Studio.design && typeof Studio.design.on === "function") {
    Studio.design.on("change", sync);
  }
  /* 페이지·디자인 본문 접기·작업실 모드가 바뀌면 깨어 있을 것을 다시 가린다 */
  Studio.on("page", syncLife);
  if (typeof MutationObserver === "function") {
    new MutationObserver(syncLife).observe(main, { attributes: true, attributeFilter: ["hidden"] });
    if (studioRoot) {
      /* 모드가 바뀌면 정밀 전용 탭·칸 보이기도 다시 가린다(S3) — sync가 수명까지 맞춘다 */
      new MutationObserver(sync).observe(studioRoot, { attributes: true, attributeFilter: ["data-studio-mode"] });
    }
  }

  Studio.f = {
    mount: mount,
    lifecycle: lifecycle,
    show: show,
    current: function () { return current; },
    mounted: function () { return order.filter(function (id) { return mounts[id].kind !== "life"; }); },
    visible: function (id) { return Boolean(mounts[id]) && Boolean(mounts[id].section) && !mounts[id].section.hidden; },
    /* 모듈이 깨어 있는가(칸이 보이고 그 페이지·모드일 때) */
    active: function (id) { return Boolean(mounts[id]) && mounts[id].active; },
    /* 깨어 있는 모듈 id — 칸 있는 것과 없는 것(lifecycle) 모두 */
    awake: function () { return order.filter(function (id) { return mounts[id].active; }); },
    /* 모듈마다 센 일(ctx.work)과 깨고 잠든 횟수 — 시험·측정용. reset이면 0으로 */
    workCounts: function (reset) {
      var out = {};
      order.forEach(function (id) {
        out[id] = { works: mounts[id].works, flips: mounts[id].flips, active: mounts[id].active };
        if (reset) {
          mounts[id].works = 0;
          mounts[id].flips = 0;
        }
      });
      return out;
    },
    sync: sync
  };
})();
