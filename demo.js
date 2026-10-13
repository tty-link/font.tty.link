(function () {
  "use strict";

  /* 공개 메뉴 — 소개·사례·글꼴·움직임·문서·작업실. category는 내비 링크의 data-demo-category 값
   * (스타일이 읽는 계약)이라 영어로 두고, 화면에는 title을 쓴다. */
  var pages = [
    { slug: "index", href: "./index.html", title: "소개", category: "Start", desc: "폰꾸 소개와 대표 쓰임" },
    { slug: "showcase", href: "./showcase.html", title: "사례", category: "Explore", desc: "청첩장에서 게임까지 — 그대로 쓰고, 고쳐 쓰고, 새로 만드는 사례" },
    { slug: "fonts", href: "./fonts.html", title: "글꼴", category: "Read", desc: "여섯 축과 테마 — 테마 갤러리, 조합기, 글꼴 견본, 내 글꼴 만들기" },
    { slug: "effects", href: "./effects.html", title: "움직임", category: "Explore", desc: "자모 단위 움직임(animate)과 상호작용(data-kku-fx)" },
    { slug: "docs", href: "./docs.html", title: "문서", category: "Docs", desc: "설치·속성·꾸미기·API 레퍼런스" },
    {
      slug: "font-studio",
      href: "./font-studio.html",
      title: "작업실",
      category: "Create",
      desc: "디자인(재료·배치)과 글꼴 CSS 편집, 자모 그리기"
    }
  ];

  /* 메뉴에 없는 이름이 어느 메뉴를 밝히는지 — 자소판 그리기는 작업실의 재료 탭이다. */
  var aliases = { "sprite-draw": "font-studio" };

  /* 개발 도구 — 짜임·그리기 검증과 실험 페이지. 공개 메뉴에서 빼고 문서 끝과 서로의
   * 머리말(이전·다음)에서만 잇는다. 브라우저 회귀 테스트가 이 페이지들을 쓴다. */
  var devPages = [
    { slug: "basic-text", href: "./basic-text.html", title: "기본 글", desc: "sebul·gothic을 같은 문장·혼합 콘텐츠·구조 스트레스 문장으로 비교" },
    { slug: "layout-modes", href: "./layout-modes.html", title: "줄바꿈", desc: "글자·낱말·줄 단위 줄바꿈과 포스터형 대형 배치" },
    { slug: "shape-comparison", href: "./shape-comparison.html", title: "짜임 비교", desc: "네모꼴·탈네모꼴 기준으로 짜임별 자리(문맥 배치)와 문제 글자를 점검" },
    { slug: "api-studio", href: "./api-studio.html", title: "놀이터", desc: "render·renderText·createTextModel을 조작하며 DOM·평문·구조 모델을 나란히 확인" },
    { slug: "sprite-demo", href: "./sprite-demo.html", title: "그림 자소 보기", desc: "자소판에서 자소를 잘라 조합하는 계약과 작은 크기 비교" },
    { slug: "animation-catalog", href: "./animation-catalog.html", title: "움직임 훅", desc: "글자 단위 내장 훅·자모 움직임 확장·직접 만드는 자소 훅과 씨앗값 변주" },
    { slug: "faces", href: "./faces.html", title: "재료와 깊이", desc: "기기 글꼴·CSS 원소·그림 세트 재료, 배치(세벌 고정·세벌 문맥)와 렌더링 깊이(원소·제자·기본·확장), 자모마다 고른 그림" }
  ];

  var DEBUG_BOUNDARY_KEY = "font-kku-demo-show-boundaries";

  function readBoundaryState() {
    try {
      return window.localStorage.getItem(DEBUG_BOUNDARY_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function writeBoundaryState(enabled) {
    try {
      window.localStorage.setItem(DEBUG_BOUNDARY_KEY, enabled ? "true" : "false");
    } catch (error) {
      return;
    }
  }

  function applyBoundaryState(enabled) {
    document.documentElement.dataset.demoBoundaries = enabled ? "on" : "off";
    if (document.body) {
      document.body.dataset.demoBoundaries = enabled ? "on" : "off";
    }
  }

  /* AI 에이전트용 사용 설명서 — 페이지 이동이 아니라 문서 링크라 data-demo-nav-link 없이 메뉴 끝에 둔다.
   * JS 없이 페이지를 글로 읽는 도구를 위해 공개 페이지의 <nav> 원본과 <head>(rel="alternate")에도 같은
   * 링크를 적어 두었다 — 메뉴를 그리면 이 함수가 원본 링크를 덮는다. 사이트 루트의 llms.txt도 같은 곳을 가리킨다. */
  var AI_GUIDE_HREF = "lib/skill/SKILL.md";

  function navMarkup(activeSlug) {
    var activeNav = aliases[activeSlug] || activeSlug;
    return pages
      .map(function (page) {
        var current = page.slug === activeNav ? ' aria-current="page"' : "";
        return (
          '<a href="' + page.href + '" data-demo-nav-link="' + page.slug + '" data-demo-category="' + page.category + '"' + current + ">" +
          '<span class="demo-nav-label">' + page.title + "</span>" +
          "</a>"
        );
      })
      .join("") +
      '<a href="' + AI_GUIDE_HREF + '" data-demo-nav-ai title="AI 에이전트용 사용 설명서(SKILL.md) — AI에게 이 주소를 주세요">' +
      '<span class="demo-nav-label">AI 설명서</span></a>';
  }

  function debugToggleMarkup(enabled) {
    return (
      '<label class="demo-debug-toggle" title="글자·글자 몸통·낱말·공백(glyph, glyph-body, word, space) 경계를 표시합니다.">' +
      '<input type="checkbox" data-demo-boundary-toggle' + (enabled ? " checked" : "") + " />" +
      "<span>경계 보기</span>" +
      "</label>"
    );
  }

  function findDevPage(slug) {
    for (var index = 0; index < devPages.length; index += 1) {
      if (devPages[index].slug === slug) {
        return { index: index, page: devPages[index] };
      }
    }
    return null;
  }

  function contextLinkMarkup(kind, page) {
    return (
      '<a class="demo-context-link" href="' + page.href + '" data-demo-context-' + kind + '="' + page.slug + '">' +
      '<span>' + (kind === "prev" ? "이전" : "다음") + "</span>" +
      "<strong>" + page.title + "</strong>" +
      "</a>"
    );
  }

  /* 개발 도구 페이지에만 머리말을 단다 — 공개 페이지는 메뉴 하나로 충분하다. */
  function renderPageContext(activeSlug) {
    var match = findDevPage(activeSlug);
    var topbar = document.querySelector(".demo-topbar");
    var existing = document.querySelector("[data-demo-context]");
    if (existing) {
      existing.remove();
    }
    if (!match || !topbar) {
      return;
    }

    var previous = devPages[(match.index + devPages.length - 1) % devPages.length];
    var next = devPages[(match.index + 1) % devPages.length];
    topbar.insertAdjacentHTML(
      "afterend",
      '<aside class="demo-context" data-demo-context data-demo-context-page="' + match.page.slug + '">' +
      '<div class="demo-context-current">' +
      '<span class="demo-context-kicker">개발 도구 · <a href="./docs.html#dev-tools">문서로</a></span>' +
      "<strong>" + match.page.title + "</strong>" +
      "<p>" + match.page.desc + "</p>" +
      "</div>" +
      '<div class="demo-context-links">' +
      contextLinkMarkup("prev", previous) +
      contextLinkMarkup("next", next) +
      "</div>" +
      "</aside>"
    );
  }

  function setupTopbarScrollState() {
    var topbar = document.querySelector(".demo-topbar");
    if (!topbar) {
      return;
    }
    var scrolled = false;
    function onScroll() {
      var next = window.scrollY > 12;
      if (next !== scrolled) {
        scrolled = next;
        topbar.dataset.scrolled = next ? "true" : "false";
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function setupScrollReveal() {
    var prefersReduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var selectors = [
      ".demo-hero",
      ".demo-context",
      ".demo-panel",
      ".demo-frame",
      ".demo-metric-card"
    ];

    var targets = document.querySelectorAll(selectors.join(","));
    if (!targets.length) {
      return;
    }

    var delayMap = {};
    Array.prototype.forEach.call(targets, function (el) {
      if (el.classList.contains("demo-reveal")) {
        return;
      }
      el.classList.add("demo-reveal");

      var parent = el.parentElement;
      if (parent) {
        var key = parent.getAttribute("data-reveal-group-id");
        if (!key) {
          key = Math.random().toString(36).slice(2);
          parent.setAttribute("data-reveal-group-id", key);
        }
        delayMap[key] = (delayMap[key] || 0) + 1;
        var n = Math.min(delayMap[key], 4);
        if (n > 1) {
          el.setAttribute("data-reveal-delay", String(n - 1));
        }
      }
    });

    if (prefersReduced || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(targets, function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    Array.prototype.forEach.call(targets, function (el) {
      observer.observe(el);
    });

    window.setTimeout(function () {
      Array.prototype.forEach.call(targets, function (el) {
        el.classList.add("is-visible");
      });
    }, 1600);
  }

  function renderNav(activeSlug) {
    var mount = document.querySelector("[data-demo-nav]");
    if (!mount) {
      return;
    }
    var enabled = readBoundaryState();
    applyBoundaryState(enabled);
    /* 경계 보기는 검증용 — 개발 도구와 작업실에서만 보인다. */
    var tooling = Boolean(findDevPage(activeSlug)) || (aliases[activeSlug] || activeSlug) === "font-studio";
    mount.innerHTML = navMarkup(activeSlug) + (tooling ? debugToggleMarkup(enabled) : "");
    renderPageContext(activeSlug);
    setupTopbarScrollState();
    setupScrollReveal();

    var toggle = mount.querySelector("[data-demo-boundary-toggle]");
    if (!toggle) {
      return;
    }
    toggle.addEventListener("change", function (event) {
      var nextEnabled = Boolean(event.target && event.target.checked);
      applyBoundaryState(nextEnabled);
      writeBoundaryState(nextEnabled);
    });
  }

  function collectModelStats(model) {
    var stats = {
      lines: model && model.lines ? model.lines.length : 0,
      words: 0,
      spaces: 0,
      glyphs: 0,
      hangul: 0,
      plain: 0,
      topologies: {}
    };

    if (!model || !model.lines) {
      return stats;
    }

    model.lines.forEach(function (line) {
      (line.children || []).forEach(function (child) {
        if (child.type === "word") {
          stats.words += 1;
          (child.children || []).forEach(function (glyph) {
            stats.glyphs += 1;
            if (glyph.kind === "hangul") {
              stats.hangul += 1;
              var key = glyph.topology && glyph.topology.placementKey
                ? glyph.topology.placementKey
                : "unknown";
              stats.topologies[key] = (stats.topologies[key] || 0) + 1;
            } else {
              stats.plain += 1;
            }
          });
          return;
        }

        if (child.type === "space") {
          stats.spaces += child.count || 0;
        }
      });
    });

    return stats;
  }

  function metricMarkup(label, value, hint) {
    return (
      '<article class="demo-metric-card">' +
      "<strong>" + value + "</strong>" +
      "<span>" + label + "</span>" +
      "<small>" + hint + "</small>" +
      "</article>"
    );
  }

  function renderMetrics(mount, stats) {
    if (!mount) {
      return;
    }

    mount.innerHTML = [
      metricMarkup("줄", stats.lines, "입력 줄 수"),
      metricMarkup("낱말", stats.words, "공백으로 나눈 낱말"),
      metricMarkup("글자", stats.glyphs, "전체 글자"),
      metricMarkup("한글", stats.hangul, "한글 음절"),
      metricMarkup("비한글", stats.plain, "비한글 글자"),
      metricMarkup("공백", stats.spaces, "줄 안 공백 수")
    ].join("");
  }

  function renderTopologies(mount, stats) {
    if (!mount) {
      return;
    }

    var entries = Object.keys(stats.topologies).sort(function (left, right) {
      return stats.topologies[right] - stats.topologies[left] || left.localeCompare(right);
    });

    if (!entries.length) {
      mount.innerHTML = '<span class="demo-topology-chip"><strong>비한글만</strong><span>0</span></span>';
      return;
    }

    mount.innerHTML = entries
      .map(function (key) {
        return (
          '<span class="demo-topology-chip">' +
          "<strong>" + key + "</strong>" +
          "<span>" + stats.topologies[key] + "</span>" +
          "</span>"
        );
      })
      .join("");
  }

  function renderTextOutput(mount, lines) {
    if (!mount) {
      return;
    }
    mount.textContent = lines.join("\n");
  }

  function renderModelJson(mount, model) {
    if (!mount) {
      return;
    }
    mount.textContent = JSON.stringify(model, null, 2);
  }

  function setupApiStudio() {
    var form = document.querySelector("[data-api-form]");
    if (!form || !window.FontKku) {
      return null;
    }

    var target = document.querySelector("[data-api-output]");
    var textOutput = document.querySelector("[data-api-text-output]");
    var metrics = document.querySelector("[data-api-metrics]");
    var topologies = document.querySelector("[data-api-topologies]");
    var modelOutput = document.querySelector("[data-api-model]");
    var text = form.querySelector("[name='text']");
    var font = form.querySelector("[name='font']");
    var size = form.querySelector("[name='size']");
    var wrapUnit = form.querySelector("[name='wrapUnit']");
    var animate = form.querySelector("[name='animate']");

    function draw() {
      var source = text.value;
      var model = window.FontKku.createTextModel(source);
      var stats = collectModelStats(model);

      if (target) {
        window.FontKku.render(target, {
          text: source,
          font: font.value,
          size: Math.min(80, Math.max(16, Number(size.value) || 34)),
          wrapUnit: wrapUnit.value,
          animate: animate.value || undefined
        });
      }

      renderTextOutput(textOutput, window.FontKku.renderText(source));
      renderMetrics(metrics, stats);
      renderTopologies(topologies, stats);
      renderModelJson(modelOutput, model);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      draw();
    });
    form.addEventListener("input", draw);
    form.addEventListener("change", draw);

    draw();

    return {
      draw: draw,
      form: form
    };
  }

  function setupTextModeStudio() {
    var studio = setupApiStudio();
    if (!studio) {
      return null;
    }

    var text = studio.form.querySelector("[name='text']");
    var font = studio.form.querySelector("[name='font']");
    var size = studio.form.querySelector("[name='size']");
    var wrapUnit = studio.form.querySelector("[name='wrapUnit']");

    Array.prototype.forEach.call(
      document.querySelectorAll("[data-text-preset]"),
      function (button) {
        button.addEventListener("click", function () {
          text.value = button.getAttribute("data-text-preset") || "";
          if (font && button.dataset.font) {
            font.value = button.dataset.font;
          }
          if (size && button.dataset.size) {
            size.value = button.dataset.size;
          }
          if (wrapUnit && button.dataset.wrapUnit) {
            wrapUnit.value = button.dataset.wrapUnit;
          }
          studio.draw();
        });
      }
    );

    return studio;
  }

  window.FontKkuDemo = {
    renderNav: renderNav,
    setupApiStudio: setupApiStudio,
    setupTextModeStudio: setupTextModeStudio,
    pages: pages.slice(),
    devPages: devPages.slice()
  };
})();
