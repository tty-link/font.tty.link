/* font-studio-f-shell.js — 작업실 디자인 도구 탭 껍데기 (설계 v1.2 §13.3–13.6, PLAN-HANGUL-001 F0)
 *
 * 뒤 묶음(조립식 비교·그리기·독립 SVG·팔레트·편집 기록·묶음·출처)이 자기 칸을 붙이는 자리다. FontStudio.f.mount(id, opts)가
 * [data-studio-f=id] 칸(HTML에 없으면 만든다)을 돌려주고 보이기를 맡는다:
 * - 디자인 본문([data-design-main]) 안의 칸은 탭 하나씩 — 탭 줄([data-studio-f-tabs])은 보일 탭이 하나라도 있을 때만 보인다
 * - opts.group이 있으면 그 탭을 고를 때 함께 보인다(탭을 따로 두지 않는다)
 * - 본문 밖의 칸(파일 줄의 묶음, 살펴보기의 출처)은 탭 없이 보인다
 * opts.modes(['svg'|'font'|'primitive'])가 있으면 지금 디자인 재료가 그중 하나일 때만 보인다 — 디자인 change 사건마다 다시 가린다.
 * 보이기·숨기기는 [hidden]만 쓴다. 아무 칸도 붙이지 않으면 화면은 F0 이전과 같다.
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var nav = document.querySelector("[data-studio-f-tabs]");
  var main = document.querySelector("[data-design-main]");
  if (!Studio || !nav || !main) {
    return;
  }

  var MODES = ["primitive", "svg", "font"];
  var mounts = {};
  var order = [];
  var current = null;

  function designMode() {
    var design = Studio.design;
    return design && design.state && design.state.json ? design.state.json.mode : null;
  }

  function allowed(entry) {
    return !entry.modes || entry.modes.indexOf(designMode()) >= 0;
  }

  function tabbed(entry) {
    return entry.kind === "tab";
  }

  function visibleTabs() {
    return order.filter(function (id) { return tabbed(mounts[id]) && allowed(mounts[id]); });
  }

  /* 탭 줄·칸 보이기를 지금 탭과 재료에 맞춘다 */
  function sync() {
    var tabs = visibleTabs();
    if (tabs.indexOf(current) < 0) {
      current = tabs[0] || null;
    }
    nav.hidden = tabs.length === 0;
    order.forEach(function (id) {
      var entry = mounts[id];
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
            setTimeout(function () { throw error; }, 0);
          }
        }
      }
    });
    nav.dataset.current = current || "";
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

  /* mount(id, { label, modes?, group?, tab?, onShow?, onHide? }) → 칸(section). 같은 id를 다시 붙이면 같은 칸을 돌려준다 */
  function mount(id, options) {
    var opts = options || {};
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new TypeError("font-studio: f.mount id must match /^[a-z][a-z0-9-]*$/ (got " + JSON.stringify(id) + ")");
    }
    if (mounts[id]) {
      return mounts[id].section;
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
      onHide: typeof opts.onHide === "function" ? opts.onHide : null
    };
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

  /* 그 칸(또는 그 칸이 따르는 탭)을 고른다. 지금 재료에서 보이지 않는 칸이면 false */
  function show(id) {
    var entry = mounts[id];
    if (!entry || !allowed(entry)) {
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

  Studio.f = {
    mount: mount,
    show: show,
    current: function () { return current; },
    mounted: function () { return order.slice(); },
    visible: function (id) { return Boolean(mounts[id]) && !mounts[id].section.hidden; },
    sync: sync
  };
})();
