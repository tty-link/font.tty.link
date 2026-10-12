/* 공개 페이지(소개·사례·글꼴·문서) 공용 동작 — 복사 버튼, CDN 주소, 템플릿 내려받기.
 *
 * - [data-copy="<선택자>"]     그 요소의 textContent를 복사한다
 * - [data-copy-text="<글>"]    속성 값을 그대로 복사한다
 * - [data-copy-skill]          AI 설명서 전체(skills/font-kku-use/의 SKILL.md 목차와 그 표가 가리키는 주제
 *                              파일)를 한 글로 이어 복사한다 — 링크를 열 수 없는 AI에 통째로 붙여 넣는다.
 *                              읽지 못하면 CDN의 설명서를 새 탭으로 연다
 * - [data-template="<경로>"]   그 템플릿 HTML을 CDN 주소로 바꿔 복사한다
 *   [data-template-download]  함께 붙이면 복사 대신 파일로 내려받는다
 *
 * 저장소 안 페이지와 템플릿은 런타임을 상대 경로(`lib/font-kku.js`)로 불러 npm에 올리기 전의
 * 변경도 그대로 보여 준다. 밖으로 가져가는 코드는 toCdn()이 jsDelivr 주소로 바꾼다. 런타임은
 * jsDelivr 압축본 RUNTIME(`font-kku.min.js`)이다 — 런타임이 CSS·글꼴·확장도 `.min`으로 받는다(ADR-019 §2).
 * SKILL_PATH는 이 사이트가 직접 읽는 설명서 자리(배포 빌드가 lib/skill/로 옮긴다)이고, 프롬프트에 넣는
 * SKILL_URL은 font.tty.link의 최신 설명서다 — 문서는 npm 공개 없이 사이트로 고친다(ADR-022 §6, 2026-10-13).
 * 설명서 안의 코드 주소는 공개된 판(jsDelivr `@<버전>`)에 고정돼 있어 받는 코드와 어긋나지 않는다. */
(function () {
  "use strict";

  var CDN = "https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/";
  var SKILL_PATH = "skill/SKILL.md";
  var SKILL_URL = "https://font.tty.link/lib/skill/SKILL.md";
  var SITE_ROOT = new URL("lib/", document.currentScript ? document.currentScript.src : location.href).href;
  /* 배포 빌드가 CDN을 사이트 lib/로 바꾸면(--base) 그곳에는 즉석 압축본이 없어 원본 이름을 쓴다. */
  var RUNTIME = CDN + (/^https:\/\/cdn\.jsdelivr\.net\//.test(CDN) ? "font-kku.min.js" : "font-kku.js");

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function flash(button, message) {
    if (!button) {
      return;
    }
    var label = button.getAttribute("data-label") || button.textContent;
    button.setAttribute("data-label", label);
    button.textContent = message;
    window.setTimeout(function () {
      button.textContent = label;
    }, 1600);
  }

  /* 비보안 문맥(http로 연 사내·tailnet 주소)에는 clipboard API가 없다 — execCommand로 폴백. */
  function copyText(text, button) {
    function done(ok) {
      flash(button, ok ? "복사됨" : "복사 실패");
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }

  function download(name, text, button) {
    var blob = new Blob([text], { type: "text/html;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    flash(button, "내려받음");
  }

  /* 상대 경로 런타임과 확장(`lib/font-kku.js`, `../lib/font-kku-fx.js`, `lib/font-kku-looks.css`, `lib/profiles/x.css` …)을
   * CDN 주소로 바꾼다 — 가져간 HTML 한 장이 저장소 밖에서도 열리게. 런타임 `font-kku.js`만 RUNTIME으로 —
   * 직접 적은 CSS·확장은 이름 그대로 둔다(런타임이 받는 `.min`과 겹쳐 받지 않게). */
  function toCdn(html) {
    return String(html).replace(
      /((?:src|href)=["'])(?:\.\.\/)+(?:lib\/)?((?:font-kku(?:-fx|-ime|-export)?\.m?js)|(?:font-kku(?:-looks|-motion)?\.css)|(?:profiles\/[a-z0-9-]+\.(?:css|svg|jamo\.js)))(["'])/g,
      function (match, attr, file, quote) {
        return attr + (file === "font-kku.js" ? RUNTIME : CDN + file) + quote;
      });
  }

  /* SKILL.md(목차) 뒤에 목차 표가 가리키는 같은 폴더의 주제 파일을 차례대로 잇는다. */
  function skillBundle() {
    var dir = SITE_ROOT + SKILL_PATH.replace(/[^/]+$/, "");
    return fetchText(SITE_ROOT + SKILL_PATH).then(function (index) {
      var names = [];
      index.replace(/\[([a-z0-9-]+\.md)\]\(/g, function (match, name) {
        if (name !== "SKILL.md" && names.indexOf(name) < 0) {
          names.push(name);
        }
        return match;
      });
      return Promise.all(names.map(function (name) { return fetchText(dir + name); })).then(function (parts) {
        return [index].concat(parts.map(function (text, i) {
          return "\n\n---\n\n<!-- 파일: " + names[i] + " -->\n\n" + text;
        })).join("");
      });
    });
  }

  function fetchText(path) {
    return fetch(new URL(path, location.href).href).then(function (response) {
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      return response.text();
    });
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") {
      return;
    }
    var button = target.closest("[data-copy]");
    if (button) {
      var source = document.querySelector(button.getAttribute("data-copy"));
      if (source) {
        copyText(source.textContent, button);
      }
      return;
    }
    button = target.closest("[data-copy-text]");
    if (button) {
      copyText(button.getAttribute("data-copy-text"), button);
      return;
    }
    button = target.closest("[data-copy-skill]");
    if (button) {
      skillBundle().then(function (text) {
        copyText(text, button);
      }, function () {
        window.open(SKILL_URL, "_blank", "noopener");
      });
      return;
    }
    button = target.closest("[data-template]");
    if (button) {
      var path = button.getAttribute("data-template");
      fetchText(path).then(function (text) {
        var html = toCdn(text);
        if (button.hasAttribute("data-template-download")) {
          download(path.split("/").pop(), html, button);
        } else {
          copyText(html, button);
        }
      }, function () {
        flash(button, "불러오기 실패");
      });
    }
  });

  window.FontKkuSite = {
    CDN: CDN,
    RUNTIME: RUNTIME,
    SKILL_URL: SKILL_URL,
    copyText: copyText,
    toCdn: toCdn,
    download: download,
    skillBundle: skillBundle
  };
})();
