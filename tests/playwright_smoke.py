#!/usr/bin/env python3
from __future__ import annotations
import contextlib
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import re
import subprocess
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from browser_launch import browser_flavor, launch_browser

ROOT_DIR = Path(os.environ.get("FONT_KKU_SITE_DIST", str(Path(__file__).resolve().parents[1] / "dist"))).resolve()
DEMO_FILE = ROOT_DIR / "index.html"
PUBLIC_NAV = ["index", "showcase", "fonts", "effects", "docs", "font-studio"]


def assert_legacy_core_cases(page, label: str) -> None:
    host = page.locator("[data-case='legacy-core'][data-fy-upgraded='true']").first
    if host.count() != 1:
        raise AssertionError(f"{label}: legacy core sample was not upgraded")

    wang = host.locator("[part='glyph'][data-source='왕']").first
    if wang.get_attribute("data-layout-key") != "split-right:single":
        raise AssertionError(f"{label}: 왕 layout key mismatch")
    wang_pos = wang.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-fy-pos'))"
    )
    if wang_pos != ["hts", "ttr", "bbrs"]:
        raise AssertionError(f"{label}: 왕 placement mismatch {wang_pos!r}")

    gwa = host.locator("[part='glyph'][data-source='과']").first
    if gwa.get_attribute("data-layout-key") != "split-right:none":
        raise AssertionError(f"{label}: 과 layout key mismatch")
    gwa_pos = gwa.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-fy-pos'))"
    )
    if gwa_pos != ["hs", "trs"]:
        raise AssertionError(f"{label}: 과 placement mismatch {gwa_pos!r}")

    hwek = host.locator("[part='glyph'][data-source='획']").first
    if hwek.get_attribute("data-layout-key") != "split-right:single":
        raise AssertionError(f"{label}: 획 layout key mismatch")
    hwek_pos = hwek.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-fy-pos'))"
    )
    if hwek_pos != ["hts", "ttr", "bbrs"]:
        raise AssertionError(f"{label}: 획 placement mismatch {hwek_pos!r}")

    balp = host.locator("[part='glyph'][data-source='밟']").first
    if balp.get_attribute("data-layout-key") != "right:double":
        raise AssertionError(f"{label}: 밟 layout key mismatch")
    balp_pos = balp.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-fy-pos'))"
    )
    if balp_pos != ["tlc", "trc", "brw"]:
        raise AssertionError(f"{label}: 밟 placement mismatch {balp_pos!r}")

    # Verify the resolved layout made it into computed styles.
    wang_css = wang.locator("[part~='jamo']").first.evaluate(
        """(node) => {
            const style = getComputedStyle(node);
            return {
                fontSize: style.fontSize,
                top: style.insetBlockStart,
            };
        }"""
    )
    if not wang_css["fontSize"] or wang_css["fontSize"] == "0px" or wang_css["top"] == "auto":
        raise AssertionError(f"{label}: CSS positioning not applied {wang_css!r}")


@contextlib.contextmanager
def static_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


SMOKE_MODES_ENV = "FONT_KKU_SMOKE_MODES"


REQUIRE_ENGINES_ENV = "FONT_KKU_REQUIRE_ENGINES"


CPU_THROTTLE_ENV = "FONT_KKU_SMOKE_CPU_THROTTLE"


def smoke_modes() -> tuple[str, ...]:
    """pytest 스모크가 모든 검사를 도는 모드. 기본은 ("server",), FONT_KKU_SMOKE_MODES=both면 ("file", "server")(공개 층).
    file:// 길이 따로 있는 검사는 이 값과 상관없이 늘 두 모드를 돈다(tests/test_playwright_smoke.py FILE_DIFFERS)."""
    raw = os.environ.get(SMOKE_MODES_ENV, "").strip().lower() or "server"
    if raw not in ("server", "both"):
        raise ValueError(f"{SMOKE_MODES_ENV} must be 'server' or 'both', got {raw!r}")
    return ("file", "server") if raw == "both" else ("server",)


def require_engines() -> bool:
    """FONT_KKU_REQUIRE_ENGINES=1이면 Firefox·WebKit이 없을 때 건너뛰지 않고 실패한다(공개 층)."""
    return os.environ.get(REQUIRE_ENGINES_ENV, "").strip().lower() in ("1", "true", "yes")


def smoke_cpu_throttle() -> float:
    """FONT_KKU_SMOKE_CPU_THROTTLE=N(N > 1)이면 N, 아니면 0. 느린 기기를 흉내 내 부하에 약한 검사를 기계에 부하를 주지 않고 재현한다."""
    raw = os.environ.get(CPU_THROTTLE_ENV, "").strip()
    if not raw:
        return 0.0
    try:
        rate = float(raw)
    except ValueError as error:
        raise ValueError(f"{CPU_THROTTLE_ENV} must be a number such as 4, got {raw!r}") from error
    return rate if rate > 1 else 0.0


def _throttle_page(page, rate: float) -> None:
    if getattr(page, "_fk_cpu_throttle", None) == rate:
        return
    page._fk_cpu_throttle = rate
    page.context.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": rate})


def _throttle_context(context, rate: float):
    if getattr(context, "_fk_cpu_throttle", None) == rate:
        return context
    context._fk_cpu_throttle = rate
    new_page = context.new_page

    def throttled_new_page(*args, **kwargs):
        page = new_page(*args, **kwargs)
        _throttle_page(page, rate)
        return page

    context.new_page = throttled_new_page
    # window.open 같은 팝업 — 사건은 new_page가 돌아온 뒤에 오므로 new_page는 위에서 바로 건다
    context.on("page", lambda page: _throttle_page(page, rate))
    return context


def throttle_browser(browser):
    """FONT_KKU_SMOKE_CPU_THROTTLE=N이면 이 Chromium이 여는 모든 페이지(browser.new_page, new_context().new_page, 팝업)에
    CDP Emulation.setCPUThrottlingRate(N)을 건다. 페이지 이동 뒤에도 남는다. Firefox·WebKit과 값이 없을 때는 그대로 둔다.
    `page.context.browser`는 같은 객체를 돌려주므로 검사 안에서 새로 연 창도 늦춰진다."""
    rate = smoke_cpu_throttle()
    if not rate or browser.browser_type.name != "chromium" or getattr(browser, "_fk_cpu_throttle", None) == rate:
        return browser
    browser._fk_cpu_throttle = rate
    new_context = browser.new_context
    new_page = browser.new_page

    def throttled_new_context(*args, **kwargs):
        return _throttle_context(new_context(*args, **kwargs), rate)

    def throttled_new_page(*args, **kwargs):
        page = new_page(*args, **kwargs)
        _throttle_page(page, rate)
        _throttle_context(page.context, rate)
        return page

    browser.new_context = throttled_new_context
    browser.new_page = throttled_new_page
    return browser


SETTLE_JS = """(ms) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ms))))"""


def settle(page, ms: int = 0) -> None:
    """화면이 두 번 그려진 뒤(rAF 두 번) ms를 더 기다린다. 고정 sleep은 부하가 크면 그리기 한 번 없이 지나가, 런타임이 다음
    프레임에 하는 일(맞춤·관찰자·크기 바뀜 처리)이 끝나기 전 상태를 잰다."""
    page.evaluate(SETTLE_JS, ms)


def poll(page, script: str, ok, arg=None, timeout: float = 8.0, interval: int = 50):
    """script 값을 ok(값)가 참이 될 때까지 다시 읽어 돌려준다. 제한 시간(초)이 지나면 마지막 값을 돌려준다 — 부르는 쪽이 그
    값으로 단언하고 실패 문구를 낸다. 'sleep 뒤 한 번 읽기' 대신 쓴다: 늦게 서는 상태는 기다리고, 끝내 안 서면 실패한다."""
    import time

    deadline = time.monotonic() + timeout
    while True:
        value = page.evaluate(script) if arg is None else page.evaluate(script, arg)
        if ok(value) or time.monotonic() >= deadline:
            return value
        page.wait_for_timeout(interval)


def assert_demo(page, label: str) -> None:
    page.wait_for_function("() => Boolean(window.FontKku)")
    page.wait_for_function(
        "() => document.querySelectorAll('[data-fy-upgraded=\"true\"]').length >= 2"
    )

    title = page.title()
    if title != "폰꾸 font-kku — 8칸으로 만드는 나만의 한글 글꼴":
        raise AssertionError(f"{label}: unexpected title {title!r}")

    upgraded = page.locator("[data-fy-upgraded='true']")
    if upgraded.count() < 2:
        raise AssertionError(f"{label}: expected upgraded hosts, got {upgraded.count()}")

    nav_links = page.locator("[data-demo-nav] [data-demo-nav-link]")
    if nav_links.count() != len(PUBLIC_NAV):
        raise AssertionError(f"{label}: expected {len(PUBLIC_NAV)} nav links, got {nav_links.count()}")

    # AI 에이전트용 설명서: 그린 메뉴 끝 링크와 <head>의 rel=alternate. 페이지를 글로만 읽는 도구(JS 없음)를
    # 위해 모든 공개 페이지의 HTML 원본에도 같은 링크가 있다 — 사이트 주소만 받은 에이전트가 설명서를 찾는다
    skill = "lib/skill/SKILL.md"
    ai = page.evaluate(
        """() => [document.querySelector('[data-demo-nav] [data-demo-nav-ai]')?.getAttribute('href'),
          document.querySelector('link[rel="alternate"][type="text/markdown"]')?.getAttribute('href')]"""
    )
    if [value.removeprefix("./") if value else value for value in ai] != [skill, skill]:
        raise AssertionError(f"{label}: the menu and <head> should link the AI guide {ai!r}")
    for slug in PUBLIC_NAV:
        source = (ROOT_DIR / f"{slug}.html").read_text(encoding="utf-8")
        if not re.search(r'data-demo-nav[^>]*>\s*<a[^>]+href=[\"\'](?:\./)?' + re.escape(skill) + r'[\"\'][^>]*data-demo-nav-ai', source) or not re.search(r'rel=\"alternate\" type=\"text/markdown\" href=\"(?:\./)?' + re.escape(skill) + r'\"', source):
            raise AssertionError(f"{label}: site/{slug}.html must carry the AI guide link without JS (static <nav> and <head>)")
    # 설명서 전체 복사: 목차(SKILL.md) 뒤에 표가 가리키는 주제 파일 10개를 잇는다(file://은 fetch가 막혀 서버에서만)
    if label == "server":
        bundle = page.evaluate("() => FontKkuSite.skillBundle()")
        parts = re.findall(r"<!-- 파일: ([a-z-]+\.md) -->", bundle)
        if not bundle.startswith("---\nname: font-kku-use") or len(parts) != 10 or "# 붙이기 — 스크립트 한 줄과 속성" not in bundle:
            raise AssertionError(f"{label}: the copied guide should be SKILL.md plus its 10 topic files, got {parts!r}")

    # 히어로의 세 갈래: 작업실 그리기 탭으로 바로(#draw), AI에게 맡길 문장 복사(→ #ai), 내 페이지에 쓰는 코드(#web).
    # 제목은 고정 문장 하나다 — 무작위로 바꿔 치는 타자 제목은 없다
    hero = page.evaluate(
        """() => ({
          links: [...document.querySelectorAll('.k-land-actions a')].map((a) => a.getAttribute('href')),
          prompt: document.querySelector('.k-land-actions [data-copy-prompt]')?.getAttribute('data-copy-prompt'),
          title: [...document.querySelectorAll('#hero-title .font-kku')].map((h) => h.dataset.source).join(' '),
          typing: document.querySelectorAll('[data-hero-type], .k-hero-ghost').length,
        })"""
    )
    if hero != {"links": ["./font-studio.html#draw", "#web"], "prompt": "#ai", "title": "8칸만 그리면, 세상에 없던 한글 글꼴", "typing": 0}:
        raise AssertionError(f"{label}: the hero should lead to drawing, the AI prompt and the page code under one fixed title {hero!r}")

    # 랜딩은 한 줄 설치로 런타임·바탕 CSS·세벌(data-fonts="sebul")과 꾸밈·움직임 확장만 미리 받는다.
    # 다른 글꼴은 그 글꼴을 쓰는 요소가 화면 가까이 올 때 런타임이 CSS 한 장씩 받는다(필요할 때 받기,
    # ADR-019) — 처음 화면에는 글꼴 CSS가 몇 장뿐이고, 움직임 타일까지 내려가면 '고장 난 네온'의 네온 글꼴이 받아진다.
    def profile_links():
        return page.evaluate(
            """() => [...document.querySelectorAll('link[rel="stylesheet"]')]
              .map((link) => new URL(link.href).pathname)
              .filter((path) => path.endsWith('/font-kku.css') || path.includes('/profiles/'))
              .map((path) => path.slice(path.lastIndexOf('/') + 1))"""
        )
    first = profile_links()
    if not first or first[0] != "font-kku.css" or "sebul.css" not in first or len(first) > 8 or "neon.css" in first:
        raise AssertionError(f"{label}: the landing should fetch only a few font CSS files up front {first!r}")
    page.locator("[data-fxgrid]").scroll_into_view_if_needed()
    page.wait_for_function(
        """() => {
          const host = document.querySelector('[data-fxgrid] font-kku[font="neon"]');
          return host && FontKku.fontInfo(host)?.loaded && !host.hasAttribute('data-fy-font-pending');
        }""",
        timeout=15000,
    )
    if page.evaluate("document.querySelectorAll('style[data-font-kku-loader]').length") != 0:
        raise AssertionError(f"{label}: the script-tag loader left its veil in place")
    fetched = profile_links()
    if "neon.css" not in fetched:
        raise AssertionError(f"{label}: the neon tile font was not fetched on demand {fetched!r}")
    page.evaluate("window.scrollTo(0, 0)")
    # 그린 뒤에 꾸밈 클래스를 붙이거나 떼도 그림 자소의 마스크 칠이 따라온다(런타임이 class를 지켜본다). 소개는 그림 자소 글꼴을
    # 미리 받지 않으므로 화면 안(고정 위치)에 붙여 그 글꼴을 받게 한다
    page.evaluate(
        """() => { const h = document.createElement('font-kku'); h.id = 'late-look'; h.setAttribute('font', 'pixel');
          h.style.cssText = 'position: fixed; top: 0; left: 0'; h.textContent = '가'; document.body.append(h); }"""
    )
    page.wait_for_function("() => document.querySelector('#late-look [part~=\"jamo\"]') && !document.querySelector('#late-look').dataset.fySpritePaint", timeout=15000)
    page.evaluate("() => document.querySelector('#late-look').classList.add('kku-look-neon')")
    page.wait_for_function("() => document.querySelector('#late-look').dataset.fySpritePaint === 'mask'", timeout=5000)
    page.evaluate("() => document.querySelector('#late-look').classList.remove('kku-look-neon')")
    page.wait_for_function("() => !document.querySelector('#late-look').dataset.fySpritePaint", timeout=5000)
    page.evaluate("() => document.querySelector('#late-look').remove()")
    # 기기 글꼴 재료(--fy-face: device)에 네온 꾸밈을 붙이면 빛 칠(ADR-021)이 켜진다 — '노'의 ㅗ는 slot clip을
    # ::before가 받고 자모 노드는 clip 없이 filter로 빛만 그려, 넓은 빛이 자른 선에서 곧게 끊기지 않는다
    page.evaluate(
        """() => { const h = document.createElement('font-kku'); h.id = 'late-glow'; h.setAttribute('font', 'sebul');
          h.style.setProperty('--fy-face', 'device'); h.textContent = '노'; document.body.append(h); }"""
    )
    page.wait_for_function("() => document.querySelector('#late-glow [part~=\"jungseong\"]') && !document.querySelector('#late-glow').dataset.fyGlow")
    page.evaluate("() => document.querySelector('#late-glow').classList.add('kku-look-neon')")
    page.wait_for_function("() => document.querySelector('#late-glow').dataset.fyGlow === 'filter'", timeout=5000)
    glow = page.evaluate(
        """() => { const j = document.querySelector('#late-glow [part~="jungseong"]');
          const node = getComputedStyle(j), before = getComputedStyle(j, '::before');
          return [node.clipPath, node.visibility, node.filter.startsWith('drop-shadow'), before.clipPath.startsWith('inset'), before.content]; }"""
    )
    # 기기 글꼴 맞춤(ADR-023)이 켜져 있으면 ::before는 그 글꼴의 조합용 자모(ᅩ)가 표준 상자에 있으면 그대로,
    # 아니면 낱자(ㅗ)를 그린다(ADR-024 §6). 0.1.4-rc.4부터 맞춤 노드는 숨기지 않는다 — 노드 글자는 이미 ::first-letter
    # 크기 0이고, 보이는 글자가 있어야 WebKit 그림자 트리 선택이 닿는다(font-kku 145139d, ADR-021)
    if glow[:4] != ["none", "visible", True, True] or glow[4] not in ('"ᅩ"', '"ㅗ"'):
        raise AssertionError(f"{label}: neon look on a device font should move the slot clip to ::before and glow from the jamo {glow!r}")
    page.evaluate("() => document.querySelector('#late-glow').classList.remove('kku-look-neon')")
    page.wait_for_function("() => !document.querySelector('#late-glow').dataset.fyGlow", timeout=5000)
    page.evaluate("() => document.querySelector('#late-glow').remove()")
    # 원소 재료(기반 글꼴의 기본, ADR-024)에서는 꾸밈의 element 구간을 자모마다 쓴다(ADR-017, 2026-10-13) — 획은 옅은 속 칠,
    # 자모 하나의 테두리·빛은 자모 노드 filter(--fy-font-glow), 한글 글자의 글자 단위 filter는 끈다. 획마다 외곽선을 그리지 않는다
    page.evaluate(
        """() => { const h = document.createElement('font-kku'); h.id = 'late-element'; h.setAttribute('font', 'sebul');
          h.className = 'kku-look-neon'; h.textContent = '노'; document.body.append(h); }"""
    )
    page.wait_for_function("() => document.querySelector('#late-element [part=\"element\"]') !== null", timeout=5000)
    drawn = page.evaluate(
        """() => { const h = document.querySelector('#late-element');
          const line = getComputedStyle(h.querySelector('[part="element"][data-element="line"]'));
          const jamo = getComputedStyle(h.querySelector('[part~="jungseong"]'));
          return [h.dataset.fyFace, h.dataset.fyGlow || null, getComputedStyle(h.querySelector('[part="glyph"]')).filter,
            jamo.filter.split('drop-shadow').length - 1, line.backgroundColor, getComputedStyle(h).getPropertyValue('--fy-el-o').trim(),
            jamo.color]; }"""
    )
    if drawn[:3] != ["element", None, "none"] or drawn[3] != 6 or drawn[4] in ("rgba(0, 0, 0, 0)", "transparent", drawn[6]) or \
            drawn[5] != "0px":
        raise AssertionError(f"{label}: neon look on the element face should draw pale tubes ringed and lit per jamo {drawn!r}")
    page.evaluate("() => document.querySelector('#late-element').remove()")

    # AI 구간: 느낌마다 프롬프트(설명서 링크와 원형 8칸)와, 그 느낌으로 실제로 받은 답(고치지 않음)이 같은 문장으로 나란히 선다.
    # 느낌을 고르면 그 느낌의 답 줄이 표시된다 — 답이 없는 느낌은 두지 않는다
    prompt = page.locator("#ai-prompt").inner_text()
    if "skill/SKILL.md" not in prompt or "원형 8칸" not in prompt or "registerJamo" not in prompt:
        raise AssertionError(f"{label}: the AI prompt must link the guide and ask for the 8 origin cells, got {prompt!r}")
    answers = page.evaluate(
        """() => [...document.querySelectorAll('[data-ai-answers] .k-answer')].map((card) => [card.dataset.answer,
          card.querySelector('.k-answer-head').textContent.includes('고치지 않음'), Boolean(card.querySelector('details pre')?.textContent.includes('registerJamo'))])"""
    )
    if [a[0] for a in answers] != list(LANDING_SETS) or not all(a[1] and a[2] for a in answers):
        raise AssertionError(f"{label}: the AI answers should be listed unedited with their raw HTML {answers!r}")
    presets = []
    for index in range(page.locator("[data-ai-preset]").count()):
        page.click(f"[data-ai-preset='{index}']")
        presets.append(page.evaluate(
            """() => [document.querySelector('#ai-prompt').textContent.split('느낌: ')[1].split('\\n')[0],
              [...document.querySelectorAll('.k-answer[data-active="true"]')].map((card) => card.dataset.answer)]"""
        ))
    page.click("[data-ai-preset='0']")
    if len(presets) != 4 or not all(answer for _, answer in presets):
        raise AssertionError(f"{label}: every feel preset should point at at least one real answer {presets!r}")

    # 히어로 데모는 네모 글꼴(font="sebul" 문맥 배치)로 그리고, 제목 둘째 줄도 고른 세트를 따라간다(data-follow-set)
    hero_follow = page.evaluate(
        """() => [document.querySelector('[data-maker-host]').getAttribute('font'),
          document.querySelector('#hero-title [data-follow-set]')?.dataset.jamoSet, document.querySelector('#hero-title [data-follow-set]')?.dataset.fyFace]"""
    )
    if hero_follow != ["sebul", "claude-marker-1", "svg"]:
        raise AssertionError(f"{label}: the hero sentence and the title's second line should draw with the picked set {hero_follow!r}")

    sebul_host = page.locator("font-kku[font='sebul']").first
    if sebul_host.get_attribute("data-fy-upgraded") != "true":
        raise AssertionError(f"{label}: sebul custom element was not upgraded")
    if sebul_host.get_attribute("data-fy-expression") != "sebeol":
        raise AssertionError(f"{label}: sebul font expression mode mismatch")

    decorator_host = page.locator(".font-kku[data-font='sebul']").first
    if decorator_host.get_attribute("data-fy-host") != "decorator":
        raise AssertionError(f"{label}: decorator mode host not marked correctly")
    if decorator_host.get_attribute("data-fy-expression") != "sebeol":
        raise AssertionError(f"{label}: sebul decorator expression mode mismatch")


SCROLL_THROUGH_JS = """async () => {
  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await frames();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await frames();
  }
}"""


VISIBLE_LOADED_JS = """(selector) => {
  const hosts = [...document.querySelectorAll(selector)].filter((host) => host.getClientRects().length);
  return hosts.length > 0 && hosts.every((host) => FontKku.fontInfo(host)?.loaded && !host.hasAttribute('data-fy-font-pending'));
}"""


def scroll_and_wait_fonts(page, selector="font-kku, .font-kku", timeout=20000) -> None:
    page.evaluate(SCROLL_THROUGH_JS)
    try:
        page.wait_for_function(VISIBLE_LOADED_JS, arg=selector, timeout=timeout)
        page.evaluate("window.scrollTo(0, 0)")
    except Exception as error:
        stuck = page.evaluate(
            """(selector) => [...document.querySelectorAll(selector)].filter((host) => host.getClientRects().length &&
              (!(FontKku.fontInfo(host)?.loaded) || host.hasAttribute('data-fy-font-pending')))
              .slice(0, 6).map((host) => [host.getAttribute('font') || host.dataset.font, FontKku.fontInfo(host),
                host.hasAttribute('data-fy-font-pending'), host.closest('[id]')?.id])""", selector)
        raise AssertionError(f"fonts did not arrive for visible hosts {stuck!r}") from error


def assert_public_pages(page, url: str, label: str) -> None:
    """공개 페이지(사례·글꼴·문서): 메뉴 6개와 현재 표시, 폰꾸 요소 업그레이드·CSS 도착,
    가로 넘침 없음, 페이지별 핵심 동작(글꼴 시험대의 그림 자소 글꼴 파일 받기 포함)."""

    def open_public(name: str, slug: str) -> None:
        page.goto(url.replace("index.html", name), wait_until="load")
        scroll_and_wait_fonts(page)
        page.wait_for_function(
            """() => {
              const hosts = [...document.querySelectorAll('font-kku, .font-kku')];
              return hosts.length > 0;
            }""",
            timeout=15000,
        )
        state = page.evaluate(
            """() => ({
              nav: [...document.querySelectorAll('[data-demo-nav] [data-demo-nav-link]')].map((a) => a.dataset.demoNavLink),
              current: document.querySelector('[data-demo-nav] [aria-current="page"]')?.dataset.demoNavLink,
              overflow: document.documentElement.scrollWidth - innerWidth,
            })"""
        )
        if state["nav"] != PUBLIC_NAV or state["current"] != slug:
            raise AssertionError(f"{label}: {name} menu should be {PUBLIC_NAV!r} with {slug} current, got {state!r}")
        if state["overflow"] > 0:
            raise AssertionError(f"{label}: {name} overflows horizontally by {state['overflow']}px")

    # 사례: 목록(index.json)대로 카드가 서고, 가져가는 코드는 CDN 주소로 바뀐다 — 런타임은 jsDelivr 압축본
    # (ADR-019 §2), 직접 적은 CSS는 이름 그대로
    open_public("showcase.html", "showcase")
    to_cdn = page.evaluate(
        """() => FontKkuSite.toCdn('<script src="../../font-kku.js" data-fonts="neon"><link href="../../profiles/neon.css">')"""
    )
    if not re.fullmatch(r'<script src="https://cdn\.jsdelivr\.net/npm/@tty\.link/font-kku@[^/]+/font-kku\.min\.js" '
                        r'data-fonts="neon"><link href="https://cdn\.jsdelivr\.net/npm/@tty\.link/font-kku@[^/]+/profiles/neon\.css">',
                        to_cdn):
        raise AssertionError(f"{label}: template code is not rewritten to the CDN runtime {to_cdn!r}")
    if label == "server":
        page.wait_for_function("() => document.querySelectorAll('[data-showcase] [data-case]').length > 0")
        cards = page.evaluate(
            """async () => {
              const data = await (await fetch('./examples/index.json')).json();
              const nodes = [...document.querySelectorAll('[data-showcase] [data-case]')];
              return {
                expected: data.examples.map((item) => item.file),
                cards: nodes.map((card) => card.dataset.case),
                actions: nodes.every((card) =>
                  card.querySelectorAll('[data-template]').length === 2 && Boolean(card.querySelector('[data-copy-text]'))),
              };
            }"""
        )
        if cards["cards"] != cards["expected"] or not cards["actions"]:
            raise AssertionError(f"{label}: showcase cards do not match examples/index.json {cards!r}")
    else:
        # file://에서는 fetch가 막힌다 — 목록 대신 안내가 보여야 한다
        page.wait_for_function("() => document.querySelector('[data-showcase]').textContent.includes('index.json')")

    # 글꼴: 글꼴 축(FontKkuThemes.fonts)마다 견본 행, 시험대 문장이 모든 견본에 닿고, 모든 행에 꾸미기가 있다
    # (테마 갤러리·조합기는 assert_fonts_themes)
    open_public("fonts.html", "fonts")
    registry = page.evaluate(
        "() => Object.entries(FontKkuThemes.fonts).map(([id, font]) => [id, font.group])"
    )
    rows = page.locator("[data-font-row]").count()
    if rows != len(registry):
        raise AssertionError(f"{label}: fonts page should list every font of the font axis ({len(registry)}), got {rows}")
    page.fill("[data-tester] input[name='text']", "한글날")
    page.wait_for_function(
        "() => [...document.querySelectorAll('.k-fontrow-stage font-kku')].every((host) => host.dataset.source === '한글날')"
    )
    ids = page.locator("[data-font-row]").evaluate_all("(n) => n.map((x) => x.dataset.fontRow)")
    custom = page.locator("[data-customize-font]").evaluate_all("(n) => n.map((x) => x.dataset.customizeFont)")
    if custom != ids or sorted(ids) != sorted(font for font, _group in registry):
        raise AssertionError(f"{label}: every font row should offer 꾸미기 {custom!r}")
    # 그림 자소 글꼴(기기 글꼴이 아닌 무리)은 글꼴 파일 받기 버튼을 갖고, 누르면 11,172자 TTF가 내려받아진다(ADR-015).
    download_buttons = page.locator("[data-download-font]").evaluate_all("(nodes) => nodes.map((n) => n.dataset.downloadFont)")
    expected_downloads = sorted(font for font, group in registry if group != "system")
    if sorted(download_buttons) != expected_downloads or "pixel" not in expected_downloads:
        raise AssertionError(f"{label}: sprite fonts should offer a font file {download_buttons!r}")
    # 꾸미기: 그림 자소에 색을 고르면 마스크 칠로 바뀌고, 미리보기에 붙인 CSS가 보이는 CSS와 같다
    page.click("[data-customize-font='pixel']")
    page.wait_for_function("() => document.querySelector('[data-kku]')?.open")
    page.click("[data-kku-preset='0']")
    page.wait_for_function(
        "() => document.querySelector('[data-kku-live]')?.dataset.fySpritePaint === 'mask' && location.hash.startsWith('#kku=')"
    )
    kku = page.evaluate("""() => {
      const live = document.querySelector('[data-kku-live]');
      const jung = live.querySelector('[part~="jungseong"]');
      return { same: document.querySelector('[data-kku-style]').textContent === document.querySelector('[data-kku-css]').textContent,
               css: FontKkuCustomizer.css(), cls: live.className, color: jung && getComputedStyle(jung).color, hash: location.hash };
    }""")
    if not kku["same"] or kku["cls"] != "kku-my-pixel" or kku["color"] != "rgb(31, 79, 209)" or "--fy-sprite-paint: mask" not in kku["css"]:
        raise AssertionError(f"{label}: customizer should apply its CSS to the preview {kku!r}")
    # 링크(해시)로 다시 열면 복원되고, Esc로 닫으면 해시가 지워지고 포커스가 행 버튼으로 돌아온다
    page.goto(url.replace("index.html", "fonts.html") + kku["hash"], wait_until="load")
    page.wait_for_function("() => document.querySelector('[data-kku]')?.open")
    if page.evaluate("FontKkuCustomizer.css()") != kku["css"]:
        raise AssertionError(f"{label}: #kku= link should restore the same customization")
    page.keyboard.press("Escape")
    after = page.evaluate("[document.querySelector('[data-kku]').open, location.hash, document.activeElement?.dataset.customizeFont]")
    if after != [False, "", "pixel"]:
        raise AssertionError(f"{label}: closing the customizer should clear the hash and restore focus {after!r}")
    # 옛 꾸러미 글꼴(neon 등, 이제는 테마)로 만든 #kku= 링크도 열린다
    legacy = page.evaluate("FontKkuCustomizer.encode(Object.assign(FontKkuCustomizer.drawState('abc12'), {f: 'neon', n: 'kku-my-neon'}))")
    page.goto(url.replace("index.html", "fonts.html") + "#kku=" + legacy, wait_until="load")
    page.wait_for_function("() => document.querySelector('[data-kku]')?.open && FontKkuCustomizer.state().f === 'neon'")
    page.keyboard.press("Escape")
    # 씨앗: 시험대가 모든 행에 seed·jamo-seeds를 걸고 떼며, 씨앗 반응 글꼴만 코드에 속성이 붙는다
    page.click("[data-var='fixed']")
    vary = page.evaluate("""() => {
      const hs = [...document.querySelectorAll('.k-fontrow-stage font-kku')];
      return { seeds: [...new Set(hs.map((h) => h.getAttribute('seed')))], js: hs.every((h) => h.hasAttribute('jamo-seeds')),
               tags: [...document.querySelectorAll('.fl-seed-tag')].map((t) => t.closest('[data-font-row]').dataset.fontRow),
               attrs: [FontKkuLab.attrs({ id: 'malang', seed: true }), FontKkuLab.attrs({ id: 'sebul' })] };
    }""")
    # 씨앗 반응 글꼴(ADR-016)은 씨앗을 켜면 자모 노드가 실제로 흔들린다 — 크레용 받침 색이 역할 기본색에서 벗어난다
    seeded = page.evaluate("""() => {
      const host = document.querySelector('[data-font-row="crayon"] font-kku');
      return host.dataset.fyJamoSeeds === 'true' &&
        [...host.querySelectorAll('[data-jamo]')].some((n) => getComputedStyle(n).getPropertyValue('--fy-jamo-rotate').trim() !== '');
    }""")
    page.click("[data-var='off']")
    off = page.evaluate("() => [...document.querySelectorAll('.k-fontrow-stage font-kku')].some((h) => h.hasAttribute('seed') || h.hasAttribute('jamo-seeds'))")
    tags = sorted(vary.pop("tags"))
    if (vary != {"seeds": ["kku"], "js": True, "attrs": [' seed="kku" jamo-seeds', ""]}
            or tags != ["chalk", "crayon", "jasu", "malang"] or off or not seeded):
        raise AssertionError(f"{label}: tester variation should seed every row and only tag seed-aware fonts {vary!r} off={off!r} seeded={seeded!r}")
    # 글꼴 뽑기: 같은 뽑기 씨앗은 같은 CSS, 만드는 기능 카드의 '이걸로 꾸미기'가 뽑기 번호가 달린 꾸미기 창을 연다.
    # 옛 꾸러미 글꼴(legacy)은 뽑지 않는다
    same = page.evaluate("() => FontKkuCustomizer.cssFor(FontKkuCustomizer.drawState('abc12')) === FontKkuCustomizer.cssFor(FontKkuCustomizer.drawState('abc12'))")
    drawn_fonts = page.evaluate("() => [...new Set(Array.from({ length: 60 }, (_, i) => FontKkuCustomizer.drawState('d' + i).f))]")
    if any(font not in [f for f, _g in registry] for font in drawn_fonts):
        raise AssertionError(f"{label}: draw should only pick fonts of the font axis {drawn_fonts!r}")
    page.click("[data-lab-draw-open]")
    page.wait_for_function("() => document.querySelector('[data-kku]')?.open")
    drawn = page.evaluate("() => { const s = FontKkuCustomizer.state(); return [Boolean(s.dr), s.n === 'kku-draw-' + s.dr, !document.querySelector('[data-kku-draw-no]').hidden]; }")
    page.keyboard.press("Escape")
    if not same or drawn != [True, True, True]:
        raise AssertionError(f"{label}: draw should be deterministic and open the customizer {same!r} {drawn!r}")
    # 꾸미기 변주: 켜면 견본에 seed·jamo-seeds, CSS는 --fy-jamo-seed로 흔든다
    page.click("[data-customize-font='sebul']")
    page.wait_for_function("() => document.querySelector('[data-kku]')?.open")
    page.check("[data-kku='vo']")
    v = page.evaluate("() => { const live = document.querySelector('[data-kku-live]'); return [live.getAttribute('seed'), live.hasAttribute('jamo-seeds'), FontKkuCustomizer.css().includes('var(--fy-jamo-seed, 0.5)')]; }")
    page.keyboard.press("Escape")
    if v != ["kku", True, True]:
        raise AssertionError(f"{label}: customizer variation should seed the preview {v!r}")
    if page.locator("#make-fonts .fl-card").count() != 7:
        raise AssertionError(f"{label}: the make-fonts section should offer 7 tools")
    if label == "server":
        with page.expect_download(timeout=60000) as download_info:
            page.click("[data-download-font='pixel']")
        download = download_info.value
        if download.suggested_filename != "fontkku-pixel.ttf":
            raise AssertionError(f"{label}: unexpected font file name {download.suggested_filename!r}")
        exported = page.locator("[data-download-font='pixel']").get_attribute("data-exported")
        if exported != "11223":
            raise AssertionError(f"{label}: the pixel font file should hold 11,223 glyphs, got {exported!r}")
        # 내보내기 모듈이 code를 단 오류로 거절하면 빈 파일을 내려받지 않고 단추에 까닭을 쓴다
        other = page.evaluate(
            "() => [...document.querySelectorAll('[data-download-font]')].map((b) => b.dataset.downloadFont).find((id) => id !== 'pixel')"
        )
        page.evaluate(
            """() => { window.__realExportFont = FontKkuExport.exportFont;
              FontKkuExport.exportFont = () => Promise.reject(Object.assign(new Error('font-kku-export: refused'),
                { name: 'FontKkuExportError', code: 'EXPORT_UNSUPPORTED_FACE', face: 'element' })); }"""
        )
        downloads: list = []

        def on_download(download) -> None:
            downloads.append(download)

        page.on("download", on_download)
        try:
            page.click(f"[data-download-font='{other}']")
            page.wait_for_function(
                "(id) => document.querySelector(`[data-download-font='${id}']`).dataset.exportError === 'EXPORT_UNSUPPORTED_FACE'",
                arg=other,
            )
            refusal = page.locator(f"[data-download-font='{other}']").text_content()
        finally:
            page.evaluate("() => { FontKkuExport.exportFont = window.__realExportFont; }")
            page.remove_listener("download", on_download)
        if downloads or refusal != "이 글꼴은 글꼴 파일이 되지 않습니다":
            raise AssertionError(f"{label}: a refused export should show its reason without a download {refusal!r} {downloads!r}")

    # 문서: 목차의 모든 링크가 제자리를 가리킨다
    open_public("docs.html", "docs")
    missing = page.evaluate(
        """() => [...document.querySelectorAll('.k-docs-nav a[href^="#"]')]
          .map((a) => a.getAttribute('href').slice(1))
          .filter((id) => !document.getElementById(id))"""
    )
    if missing:
        raise AssertionError(f"{label}: docs sidebar links to missing sections {missing!r}")
    for section in ("start", "hosts", "wrap", "customize", "motion", "text", "ai", "api", "dev-tools"):
        if page.locator(f"#{section}").count() != 1:
            raise AssertionError(f"{label}: docs is missing the #{section} section")


SHOWCASE_PROMPT_GOLDEN = (
    (
        {"what": "집들이 초대 쪽지", "font": "draw", "feel": "연필로 빠르게 흘려 쓴, 살짝 오른쪽으로 기운 글씨", "seed": True},
        "이 설명서를 읽고 따라 해 줘: https://font.tty.link/lib/skill/SKILL.md\n"
        "\n"
        "집들이 초대 쪽지 페이지를 HTML 파일 하나로 만들어 줘.\n"
        "- 제목과 짧은 강조 문구만 폰꾸로 꾸미고, 본문은 폰꾸 없이 페이지 글꼴로 둬.\n"
        "- 제목 글꼴은 새로 그려 줘. 느낌: 연필로 빠르게 흘려 쓴, 살짝 오른쪽으로 기운 글씨. draw-jamo.md의 「세벌·고딕에 그림 세트 걸기」대로"
        " ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ 여덟 칸만 SVG 경로로 그려 FontKku.registerJamo로 등록하고, 제목에 jamo-set으로 걸어 줘.\n"
        "- 제목은 같은 글자도 볼 때마다 조금씩 다르게 해 줘(styling.md의 씨앗 — seed=\"auto\"와 jamo-seeds).\n"
        "- 움직임 줄이기 설정이면 움직이지 않게, 휴대폰 폭 360px에서도 가로로 넘치지 않게 해 줘.",
    ),
    (
        {"what": "동네 빵집의 오늘의 빵 안내판", "font": "auto", "assemble": True, "input": True},
        "이 설명서를 읽고 따라 해 줘: https://font.tty.link/lib/skill/SKILL.md\n"
        "\n"
        "동네 빵집의 오늘의 빵 안내판 페이지를 HTML 파일 하나로 만들어 줘.\n"
        "- 제목과 짧은 강조 문구만 폰꾸로 꾸미고, 본문은 폰꾸 없이 페이지 글꼴로 둬.\n"
        "- 폰꾸 글꼴은 설명서 fonts.md의 글꼴 표에서 페이지 바탕에 어울리는 것으로 골라 줘.\n"
        "- 제목이 화면에 들어올 때 자모가 모여 글자가 되게 해 줘(compose.md의 움직임).\n"
        "- 입력칸에 쓴 글을 그 자리에서 폰꾸로 다시 그리게 해 줘(setup.md의 동적 변경).\n"
        "- 움직임 줄이기 설정이면 움직이지 않게, 휴대폰 폭 360px에서도 가로로 넘치지 않게 해 줘.",
    ),
)


REMIX_PREVIEW_READY_JS = """() => {
  const frame = document.querySelector('[data-remix-preview]');
  const doc = frame && frame.contentDocument;
  if (!doc || doc.readyState !== 'complete' || document.querySelector('[data-remix-frame]').dataset.loaded !== 'true') return false;
  const hosts = [...doc.querySelectorAll('font-kku, .font-kku')];
  return hosts.length > 0 && hosts.every((host) => host.dataset.fyUpgraded === 'true' && !host.hasAttribute('data-fy-font-pending'));
}"""


def assert_showcase_page(page, url: str, label: str) -> None:
    """사례(사례 모음·고쳐 쓰기·새로 만들기): 요청 글 만들기(buildPrompt)는 정해진 글을 바이트까지 그대로 만들고, 화면의 고르기도
    같은 글을 낸다. 쓰임 고르기는 그 쓰임 카드만 남기고(차례는 그대로) 셈이 index.json과 맞다. 카드의 글꼴 표는 index.json의
    fonts이고 "fixed"(글꼴 이름을 비운 곳)는 '세벌식' → fonts.html#layout이다. 'AI에게 고쳐 달라기'는 공개 사이트의 사례
    주소를 담는다. 고쳐 쓰기는 마커 세트를 고르면 미리보기의 바탕 요소가 모두 그 세트(SVG 그림)로 그려지고, 복사할 HTML에
    registerJamo와 jsDelivr 런타임이 들며, '원래 글꼴'이면 'HTML 복사'와 같은 글이다. 글꼴 이름이 없는 바탕 요소는 제 칩
    '세벌식'으로 켜고 끄며 그림 세트만 걸어 세벌식 배치를 지킨다. 세트를 골랐는데 켠 칩이 없으면 '바꿀 글꼴을 하나 이상
    켜세요'와 함께 복사·내려받기가 막힌다. 다른 탭에서 그린 칸을 지우면 '내가 그린 8칸'으로 만든 글도 마커로 다시 만든다.
    폭을 바꿔도 미리보기 틀이 window 오류(ResizeObserver loop)를 내지 않는다. 요청 글 만들기 옆 '이 설정 불러오기'는 AI 첫 답의
    요청 글(made.prompt)을 그대로 다시 만든다. 카드의 펼침 제목과 증거 줄이 같은 말을 쓰고, 쓰임 고르기로 숨은 카드를 가리키는
    링크는 고르기를 풀고 간다. 주소의 #apps·#case-<이름>은 카드가 늦게 서도 그 자리(머리말 밑)에 닿는다. made(AI에게 받은 답
    기록)가 있는 항목은 표지와 요청 원문을 보인다. file://에서는 고쳐 쓰기 대신 안내가 보인다."""
    errors, stop = collect_page_errors(page)
    showcase_url = url.replace("index.html", "showcase.html")
    page.add_init_script(
        "window.__fkWindowErrors = []; addEventListener('error', (event) => window.__fkWindowErrors.push(String(event.message)));"
    )
    page.goto(showcase_url, wait_until="load")
    page.wait_for_function("() => Boolean(window.FontKkuShowcase)")
    for options, expected in SHOWCASE_PROMPT_GOLDEN:
        built = page.evaluate("(options) => FontKkuShowcase.buildPrompt(options)", options)
        if built != expected:
            raise AssertionError(f"{label}: buildPrompt({options!r}) drifted from the golden text:\n{built}")
    # 화면에서 고른 것도 같은 글 — 직접 적기 + 기본 글꼴 + 조립 + 입력
    page.fill("[data-builder] input[name='what']", "동네 빵집의 오늘의 빵 안내판")
    page.check("[data-builder] input[name='assemble']")
    page.check("[data-builder] input[name='input']")
    shown = page.evaluate("() => document.querySelector('[data-builder-out]').textContent")
    if shown != SHOWCASE_PROMPT_GOLDEN[1][1]:
        raise AssertionError(f"{label}: the prompt builder form should produce the same text as buildPrompt {shown!r}")
    # 이 글꼴로 — 고른 글꼴의 이름과 id가 들어가고, 설명서에 없는 API 이름은 없다
    page.check("[data-builder] input[name='font'][value='pick']")
    page.select_option("[data-builder-fonts]", "neon")
    picked = page.evaluate("() => document.querySelector('[data-builder-out]').textContent")
    if "- 폰꾸 글꼴은 이것으로: 네온(neon). fonts.md에 적힌 그 글꼴의 바탕 조건을 지켜 줘." not in picked:
        raise AssertionError(f"{label}: picking a font should name it in the prompt {picked!r}")

    if label != "server":
        stop()
        # file://에서는 사례 HTML을 읽을 수 없다 — 고쳐 쓰기 대신 안내, 카드 대신 index.json 안내
        state = page.evaluate("() => [document.querySelector('[data-remix-off]').hidden, document.querySelector('[data-remix]').hidden]")
        if state != [False, True]:
            raise AssertionError(f"{label}: file:// should show the remix note instead of the workbench {state!r}")
        return

    page.wait_for_function("() => document.querySelectorAll('[data-showcase] [data-case]').length > 0")
    data = page.evaluate("async () => (await (await fetch('./examples/index.json')).json()).examples")
    # 쓰임 고르기: 모두 + 쓰임마다 버튼, 셈이 목록과 같고, 누르면 그 쓰임만(hidden만 주므로 차례는 그대로)
    buttons = page.evaluate(
        "() => [...document.querySelectorAll('[data-showcase-kinds] button')].map((b) => [b.dataset.kind, Number(b.querySelector('.sc-n').textContent)])"
    )
    kinds = sorted({item.get("kind") for item in data if item.get("kind")})
    if buttons[0] != ["", len(data)] or sorted(kind for kind, _count in buttons[1:]) != kinds:
        raise AssertionError(f"{label}: the use filter should offer 모두 and every kind {buttons!r}")
    for kind, count in buttons[1:]:
        page.click(f"[data-showcase-kinds] button[data-kind='{kind}']")
        visible = page.evaluate(
            "() => [...document.querySelectorAll('[data-showcase] [data-case]')].filter((card) => !card.hidden).map((card) => card.dataset.kind)"
        )
        expected = sum(1 for item in data if item.get("kind") == kind)
        if visible != [kind] * expected or count != expected:
            raise AssertionError(f"{label}: filtering by {kind} should show only its {expected} cards, got {visible!r} (button {count})")
    page.click("[data-showcase-kinds] button[data-kind='']")
    order = page.evaluate("() => [...document.querySelectorAll('[data-showcase] [data-case]')].filter((card) => !card.hidden).map((card) => card.dataset.case)")
    if order != [item["file"] for item in data]:
        raise AssertionError(f"{label}: 모두 should show every card in index.json order {order!r}")
    # 카드의 글꼴 표: index.json의 fonts 차례대로, "fixed"(글꼴 이름을 비운 곳)는 '세벌식' → 글꼴 페이지의 배치 설명
    tags = page.evaluate(
        "() => [...document.querySelectorAll('[data-case] .sc-tags a')].map((a) => [a.closest('[data-case]').dataset.case, a.textContent, a.getAttribute('href')])"
    )
    expected_tags = [[item["file"], "세벌식", "./fonts.html#layout"] if font == "fixed" else [item["file"], font, f"./fonts.html#{font}"]
                     for item in data for font in item.get("fonts", [])]
    if tags != expected_tags or not any(tag[1] == "세벌식" for tag in tags):
        raise AssertionError(f"{label}: card font tags should follow index.json fonts (fixed → 세벌식) {tags!r}")
    # 'AI에게 고쳐 달라기' — 설명서 주소로 시작하고 공개 사이트의 사례 주소를 담는다
    site_url = page.evaluate("FontKkuSite.SITE_URL")
    asks = page.evaluate(
        "() => [...document.querySelectorAll('[data-showcase] [data-case]')].map((card) => [card.dataset.case, card.querySelector('[data-ask-ai]')?.dataset.copyText || ''])"
    )
    for file, text in asks:
        if not text.startswith("이 설명서를 읽고 따라 해 줘: https://") or f"{site_url}examples/{file}" not in text:
            raise AssertionError(f"{label}: {file} 'AI에게 고쳐 달라기' should carry the public template address {text!r}")

    # 고쳐 쓰기: 카페 메뉴판 × 마커
    page.evaluate("() => document.getElementById('remix').scrollIntoView()")
    page.evaluate("() => FontKkuShowcase.pickTemplate('cafe-menu.html')")
    page.check("[data-remix-sets] input[value='claude-marker-1']")
    page.wait_for_function(
        "() => { const s = FontKkuShowcase.remixState(); return s.ready && s.file === 'cafe-menu.html' && s.set === 'claude-marker-1'; }"
    )
    page.wait_for_function(REMIX_PREVIEW_READY_JS, timeout=20000)
    preview = page.evaluate(
        """() => [...document.querySelector('[data-remix-preview]').contentDocument.querySelectorAll('font-kku, .font-kku')]
          .map((host) => [host.getAttribute('jamo-set') || host.getAttribute('data-jamo-set'), host.dataset.fyFont, host.dataset.fyFace])"""
    )
    if not preview or any(host != ["my-font", "sebul", "svg"] for host in preview):
        raise AssertionError(f"{label}: every remix preview host should draw with the marker set {preview!r}")
    remixed = page.evaluate("() => [FontKkuShowcase.remixState().html, FontKkuSite.RUNTIME, document.querySelector('[data-remix-diff-title]').textContent]")
    html, runtime, diff_title = remixed
    if ('FontKku.registerJamo("my-font"' not in html or f'<script src="{runtime}" data-fonts="sebul"></script>' not in html
            or "cdn.jsdelivr.net" not in runtime or "<base" in html or not re.fullmatch(r"바뀐 줄 \(\+\d+ −\d+\)", diff_title)):
        raise AssertionError(f"{label}: the remixed HTML should register the set and load the jsDelivr runtime ({diff_title!r})")
    # 원래 글꼴이면 바뀐 줄이 없고, 복사할 글이 'HTML 복사'와 같다
    page.check("[data-remix-sets] input[value='']")
    page.wait_for_function("() => { const s = FontKkuShowcase.remixState(); return s.ready && s.set === ''; }")
    same = page.evaluate(
        "async () => FontKkuShowcase.remixState().html === FontKkuSite.toCdn(await (await fetch('./examples/cafe-menu.html')).text())"
    )
    if not same or page.evaluate("document.querySelector('[data-remix-diff-title]').textContent") != "바뀐 줄 없음":
        raise AssertionError(f"{label}: '원래 글꼴' should copy the template unchanged")
    page.wait_for_function(REMIX_PREVIEW_READY_JS, timeout=20000)
    # 폭을 바꿔도 미리보기 틀이 window 오류를 내지 않는다(관찰 콜백 안에서 높이를 쓰면 'ResizeObserver loop' 오류)
    for width in (1100, 700, 480, 390, 1280):
        page.set_viewport_size({"width": width, "height": 720})
        settle(page, 100)  # 관찰 콜백은 그릴 때 돈다 — 시간이 아니라 그리기 두 번을 기다린다
    window_errors = page.evaluate("window.__fkWindowErrors")
    if window_errors:
        raise AssertionError(f"{label}: resizing the remix preview raised window errors {window_errors!r}")

    # 집들이 쪽지 × 마커: 글꼴 이름을 비운 제목(세벌식)은 제 칩 '세벌식'으로 켜고 끄고, 그림 세트만 걸어 세벌식
    # 배치를 지킨다. 쓰지 않게 된 AI 자신의 세트 등록(pencil-quick)은 빠지고, 제목을 그대로 두면 남는다
    page.evaluate("() => FontKkuShowcase.pickTemplate('house-warming-note.html')")
    page.check("[data-remix-sets] input[value='claude-marker-1']")
    page.wait_for_function(
        "() => { const s = FontKkuShowcase.remixState(); return s.ready && s.file === 'house-warming-note.html' && s.set === 'claude-marker-1'; }"
    )
    page.wait_for_function(REMIX_PREVIEW_READY_JS, timeout=20000)
    fixed = page.evaluate("""() => {
      const doc = document.querySelector('[data-remix-preview]').contentDocument;
      const title = doc.querySelector('h1.font-kku');
      const state = FontKkuShowcase.remixState();
      return { chips: [...document.querySelectorAll('[data-remix-font]')].map((b) => [b.dataset.remixFont, b.textContent.trim(), b.getAttribute('aria-pressed')]),
               set: title.getAttribute('data-jamo-set'), font: title.getAttribute('data-font'),
               layout: doc.defaultView.FontKku.fontInfo(title)?.layout?.profile || null, hosts: state.hosts,
               pencil: state.html.includes('pencil-quick') };
    }""")
    if fixed != {"chips": [["fixed", "세벌식", "true"], ["gothic", "고딕 gothic", "true"]], "set": "my-font", "font": None,
                 "layout": "sebul-cases-v1", "hosts": 2, "pencil": False}:
        raise AssertionError(f"{label}: an unnamed host should keep 세벌식 with only the drawn set swapped in {fixed!r}")
    page.click("[data-remix-font='fixed']")
    page.wait_for_function("() => { const s = FontKkuShowcase.remixState(); return s.ready && s.fonts.join() === 'gothic'; }")
    kept = page.evaluate("""() => { const s = FontKkuShowcase.remixState();
      return [s.hosts, s.html.includes('data-jamo-set="pencil-quick"'), s.html.includes('FontKku.registerJamo("pencil-quick"')]; }""")
    if kept != [1, True, True]:
        raise AssertionError(f"{label}: turning 세벌식 off should leave the AI title and its set untouched {kept!r}")

    # 세트를 골랐는데 켠 칩이 없으면 바꾼 곳이 없다 — 사례 그대로이고, 복사·내려받기를 막고 그렇게 말한다
    page.evaluate("() => FontKkuShowcase.pickTemplate('blog-post.html')")
    page.wait_for_function("() => { const s = FontKkuShowcase.remixState(); return s.ready && s.file === 'blog-post.html'; }")
    for font in page.evaluate("() => [...document.querySelectorAll('[data-remix-font][aria-pressed=\"true\"]')].map((b) => b.dataset.remixFont)"):
        page.click(f"[data-remix-font='{font}']")
    page.wait_for_function("() => { const s = FontKkuShowcase.remixState(); return s.ready && !s.fonts.length && s.empty; }")
    empty = page.evaluate("""async () => { const s = FontKkuShowcase.remixState();
      return { hosts: s.hosts, same: s.html === FontKkuSite.toCdn(await (await fetch('./examples/blog-post.html')).text()),
               copy: document.querySelector('[data-remix-copy]').disabled, download: document.querySelector('[data-remix-download]').disabled,
               note: document.querySelector('[data-remix-fonts-note]').textContent, diff: document.querySelector('[data-remix-diff-title]').textContent }; }""")
    if (empty["hosts"] or not empty["same"] or not empty["copy"] or not empty["download"]
            or "바꿀 글꼴을 하나 이상 켜세요" not in empty["note"] or empty["diff"] != "바뀐 줄 없음"):
        raise AssertionError(f"{label}: a set with no font chip on should export nothing and say so {empty!r}")
    page.click("[data-remix-font='sebul']")
    page.wait_for_function("() => { const s = FontKkuShowcase.remixState(); return s.ready && !s.empty && s.hosts > 0; }")
    if page.evaluate("document.querySelector('[data-remix-copy]').disabled"):
        raise AssertionError(f"{label}: turning a font chip back on should re-enable copy")

    # 다른 탭에서 그린 칸을 지우면 '내가 그린 8칸'으로 만든 미리보기·복사본도 마커로 다시 만든다
    page.evaluate("""() => { const a = FontKkuLandingSets.read(FontKkuLandingSets.byId('claude-pen-1'));
      localStorage.setItem('font-kku:landing-draft', JSON.stringify({ v: 1, from: 'claude-pen-1', width: '0.12em', edited: ['ㄱ'], cells: a.cells })); }""")
    page.goto("about:blank")
    page.goto(showcase_url + "#remix=cafe-menu", wait_until="load")
    page.wait_for_function("() => FontKkuShowcase.remixState().ready && !document.querySelector('[data-remix-draft]').hidden")
    page.check("[data-remix-sets] input[value='draft']")
    page.wait_for_function("() => { const s = FontKkuShowcase.remixState(); return s.ready && s.set === 'draft' && s.html.includes('내가 그린 칸'); }")
    # 다른 문서(같은 출처의 빈 iframe)에서 지워야 이 창에 storage 사건이 온다
    page.evaluate("""() => { const other = document.createElement('iframe'); other.hidden = true; document.body.appendChild(other);
      other.contentWindow.localStorage.removeItem('font-kku:landing-draft'); other.remove(); }""")
    page.wait_for_function(
        "() => { const s = FontKkuShowcase.remixState(); return s.ready && s.set === 'claude-marker-1' && !s.html.includes('내가 그린 칸'); }"
    )

    # 요청 글 만들기 옆 증거: made.builder가 있는 AI 답마다 '이 설정 불러오기'가 그 답을 받은 요청 글을 그대로 다시 만든다
    made_items = [item for item in data if isinstance(item.get("made"), dict) and item["made"].get("builder")]
    if not made_items or page.locator("[data-builder-load]").count() != len(made_items):
        raise AssertionError(f"{label}: every made answer with builder settings should offer '이 설정 불러오기'")
    for item in made_items:
        page.click(f"[data-builder-load='{item['file']}']")
        loaded = page.evaluate("() => [document.querySelector('[data-builder-out]').textContent, document.querySelector('[data-builder-made-status]').textContent]")
        if loaded[0] != item["made"]["prompt"] or "한 글자도 같습니다" not in loaded[1]:
            raise AssertionError(f"{label}: '이 설정 불러오기' for {item['file']} should rebuild made.prompt exactly {loaded!r}")
    # 카드의 펼침 제목을 증거 줄이 그대로 옮긴다
    summaries, evidence = page.evaluate(
        "() => [[...document.querySelectorAll('[data-made] summary')].map((s) => s.textContent), document.querySelector('[data-evidence]').textContent]"
    )
    if not summaries or any(not re.fullmatch(r"이 페이지를 받은 요청 글 \(.+\)", text) or f"'{text}'" not in evidence for text in summaries):
        raise AssertionError(f"{label}: the evidence line should quote the card label exactly {summaries!r} {evidence!r}")
    # 쓰임 고르기로 숨은 카드를 가리키는 증거 줄 링크는 고르기를 풀고 그 카드로 간다
    hidden = next(item for item in made_items if item.get("kind") != "학교·배움")
    case_id = "case-" + hidden["file"].removesuffix(".html")
    page.click("[data-showcase-kinds] button[data-kind='학교·배움']")
    page.click(f"[data-evidence] a[href='#{case_id}']")
    page.wait_for_function(
        """(id) => { const card = document.getElementById(id); const top = card.getBoundingClientRect().top;
          const header = document.querySelector('.k-header').getBoundingClientRect().bottom;
          return !card.hidden && top >= header - 1 && top < header + 120; }""",
        arg=case_id,
    )
    if page.evaluate("() => document.querySelector('[data-showcase-kinds] [aria-pressed=\"true\"]').dataset.kind") != "":
        raise AssertionError(f"{label}: following a link to a filtered-out card should clear the filter")

    page.wait_for_function(REMIX_PREVIEW_READY_JS, timeout=20000)
    overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
    if overflow > 0:
        raise AssertionError(f"{label}: showcase overflows horizontally by {overflow}px")

    # 주소의 #…: 카드가 늦게 서도 구획(#apps)과 카드(#case-)가 제자리(scroll-margin, 카드는 머리말 밑)에 닿는다.
    # 고정 sleep 뒤 한 번 읽지 않는다 — 최대 8초 동안 다시 읽어 제자리에 두 번 내리 있으면 통과, 끝내 오지 않으면 실패
    try:
        for width, height in ((1280, 720), (390, 844)):
            page.set_viewport_size({"width": width, "height": height})
            for target in ("apps", "new", case_id):
                page.goto("about:blank")
                page.goto(f"{showcase_url}#{target}", wait_until="load")
                page.wait_for_function("() => document.querySelectorAll('[data-showcase] [data-case]').length > 0")
                seen: dict = {}

                def landed(value, target=target, seen=seen) -> bool:
                    top, header, margin = value
                    ok = abs(top - margin) <= 4 and not (target.startswith("case-") and top < header - 1)
                    steady = ok and seen.get("top") is not None and abs(seen["top"] - top) < 1
                    seen["top"] = top if ok else None
                    return steady

                top, header, margin = poll(
                    page,
                    """(id) => { const node = document.getElementById(id);
                      return [node.getBoundingClientRect().top, document.querySelector('.k-header').getBoundingClientRect().bottom,
                              parseFloat(getComputedStyle(node).scrollMarginTop)]; }""",
                    landed,
                    arg=target,
                )
                if abs(top - margin) > 4 or (target.startswith("case-") and top < header - 1):
                    raise AssertionError(f"{label}: showcase.html#{target} at {width}px should land at its scroll margin "
                                         f"(top {top:.0f}, margin {margin:.0f}, header {header:.0f})")
    finally:
        page.set_viewport_size({"width": 1280, "height": 720})
    stop()
    if errors:
        raise AssertionError(f"{label}: showcase console errors {errors!r}")

    # made — 요청 글로 AI에게 받은 답이라는 기록: 표지, 요청 원문, 새로 만들기의 증거 줄
    made = {"by": "Claude Opus 5.5", "where": "Claude Code — 설명서 링크만", "date": "2026-10-13", "attempt": "1번째 답",
            "edited": False, "prompt": SHOWCASE_PROMPT_GOLDEN[0][1]}

    def with_made(route) -> None:
        body = json.loads(route.fetch().text())
        body["examples"][0]["made"] = made
        route.fulfill(body=json.dumps(body, ensure_ascii=False), content_type="application/json")

    page.route("**/examples/index.json", with_made)
    try:
        page.goto(showcase_url, wait_until="load")
        page.wait_for_function("() => document.querySelector('[data-showcase] [data-made]')")
        first = data[0]
        shown = page.evaluate(
            """(file) => { const card = document.querySelector(`[data-case="${file}"]`);
              return { badge: card.querySelector('.sc-badge')?.textContent, prompt: card.querySelector('.sc-made-prompt')?.textContent,
                       evidence: document.querySelector('[data-evidence]').textContent }; }""",
            first["file"],
        )
    finally:
        page.unroute("**/examples/index.json", with_made)
    if (shown["badge"] != "AI 답 · 고치지 않음" or shown["prompt"] != made["prompt"]
            or first["title"] not in shown["evidence"] or "고치지 않음" not in shown["evidence"]):
        raise AssertionError(f"{label}: a made entry should show its badge, request and evidence {shown!r}")


def assert_fonts_themes(page, url: str, label: str) -> None:
    """글꼴 페이지의 여섯 축(ADR-017): 축 그림 여섯 칸, 테마 카드 수 = 정본(FontKkuThemes) 테마 수,
    거르기, 테마 코드(확장이 필요하면 data-addons), 화면에 다가온 카드만 견본을 그린다, 조합기(축을 고르면
    견본의 font·class·seed·animate와 코드가 바뀐다), 주소 해시 왕복, 옛 글꼴 주소(#neon)가 테마 카드로 잇는다."""
    fonts_url = url.replace("index.html", "fonts.html")
    page.goto(fonts_url, wait_until="load")
    page.wait_for_function("() => window.FontKkuThemesPage && document.querySelectorAll('[data-theme-card]').length > 0")
    counts = page.evaluate("""() => ({
      axes: [...document.querySelectorAll('[data-theme-axes] > li')].map((li) => li.dataset.axis),
      cards: document.querySelectorAll('[data-theme-card]').length,
      themes: Object.keys(FontKkuThemes.themes).length,
      rendered: document.querySelectorAll('[data-theme-stage][data-rendered]').length,
    })""")
    if counts["axes"] != ["font", "look", "vary", "motion", "interaction", "tone"]:
        raise AssertionError(f"{label}: fonts page should draw the six axes in order {counts!r}")
    if counts["cards"] != counts["themes"] or counts["rendered"] >= counts["cards"]:
        raise AssertionError(f"{label}: one card per theme, samples drawn only near the viewport {counts!r}")
    # 테마 코드: 꾸밈·변주는 looks, 자모 움직임은 motion, 상호작용은 fx 확장을 data-addons로 붙인다
    snippets = page.evaluate("""() => Object.entries(FontKkuThemes.recipes).map(([id, r]) => {
      const code = FontKkuThemesPage.snippet(r, '한글');
      return [id, r.addons.join(' '), (/data-addons="([^"]*)"/.exec(code) || [])[1] || '',
              code.includes('font="' + r.font + '"') && r.classes.every((c) => code.includes(c))];
    })""")
    bad = [row for row in snippets if row[1] != row[2] or not row[3]]
    if bad or not any(row[1] for row in snippets):
        raise AssertionError(f"{label}: theme snippets should carry their addons and classes {bad!r}")
    short = page.evaluate("() => FontKkuThemesPage.snippet(FontKkuThemes.recipes.neon, '네온', 'neon')")
    if 'data-fonts="neon"' not in short or "data-addons" in short or 'font="neon"' not in short:
        raise AssertionError(f"{label}: a shortcut theme should also copy as the one-file font {short!r}")
    # 복사 코드의 런타임은 jsDelivr 압축본(ADR-019 §2) — 테마·글꼴 견본·꾸미기가 같은 주소를 쓴다
    runtimes = page.evaluate("""() => [FontKkuSite.RUNTIME, /<script src="([^"]+)"/.exec(FontKkuThemesPage.snippet(FontKkuThemes.recipes.neon, '네온'))?.[1]]""")
    if not runtimes[0].endswith("/font-kku.min.js") or runtimes[1] != runtimes[0]:
        raise AssertionError(f"{label}: copied code should load the jsDelivr .min runtime {runtimes!r}")
    # 거르기: 움직임이 있는 테마만
    page.click("[data-theme-filter='motion']")
    shown = page.evaluate("() => [...document.querySelectorAll('[data-theme-card]:not([hidden])')].map((c) => c.dataset.themeCard)")
    expected = page.evaluate("() => Object.keys(FontKkuThemes.themes).filter((id) => FontKkuThemes.themes[id].motion)")
    page.click("[data-theme-filter='all']")
    if shown != expected or not shown:
        raise AssertionError(f"{label}: the motion filter should show only themes with a motion {shown!r} {expected!r}")
    # 카드 견본: 화면에 다가오면 조합법 그대로 그린다
    page.locator("[data-theme-card='chalk-hand']").scroll_into_view_if_needed()
    page.wait_for_function("""() => {
      const host = document.querySelector('[data-theme-stage="chalk-hand"] font-kku');
      return host && FontKku.fontInfo(host)?.loaded && host.dataset.fyJamoSeeds === 'true';
    }""")
    card = page.evaluate("""() => { const h = document.querySelector('[data-theme-stage="chalk-hand"] font-kku');
      const r = FontKkuThemes.recipes['chalk-hand'];
      return [h.getAttribute('font') === r.font, h.className === r.classes.join(' '), h.getAttribute('seed'), h.closest('[data-tone]')?.dataset.tone]; }""")
    if card != [True, True, "auto", "board"]:
        raise AssertionError(f"{label}: theme card sample should follow its recipe {card!r}")
    # 조합기: 카드에서 열면 견본이 그 테마가 되고 주소에 담긴다
    page.click("[data-theme-open='neon-sign']")
    page.wait_for_function("""() => { const h = document.querySelector('[data-compose-host]');
      return h.getAttribute('font') === 'sebul' && h.className === 'kku-look-neon' && h.dataset.fyAnimate === 'flicker' &&
        document.querySelector('[data-compose-stage]').dataset.tone === 'dark'; }""")
    page.wait_for_function("() => location.hash.startsWith('#compose=') && location.hash.includes('look=neon')")
    # 축을 바꾸면 견본과 코드가 함께 바뀐다 — 그림 자소에 꾸밈을 걸면 마스크 칠로 칠한다
    page.check("[data-compose] input[name='font'][value='pixel']")
    page.check("[data-compose] input[name='vary'][value='tilt']")
    page.check("[data-compose] input[name='motion'][value='wave']")
    page.wait_for_function("""() => { const h = document.querySelector('[data-compose-host]');
      return h.getAttribute('font') === 'pixel' && h.dataset.fyMaterial === 'sprite' && h.dataset.fySpritePaint === 'mask' &&
        h.classList.contains('kku-vary-tilt') && h.getAttribute('seed') === 'auto' && h.dataset.fyJamoSeeds === 'true' &&
        h.dataset.fyAnimate === 'wave'; }""")
    code = page.evaluate("() => document.querySelector('[data-compose-code]').textContent")
    for part in ('data-fonts="pixel"', 'data-addons="looks motion"', 'class="kku-look-neon kku-vary-tilt"', 'animate="wave"', "jamo-seeds"):
        if part not in code:
            raise AssertionError(f"{label}: composer code should follow the controls ({part}) {code!r}")
    # 주소 해시 왕복: 링크로 열면 같은 조합이 된다
    page.wait_for_function("() => location.hash.includes('font=pixel') && location.hash.includes('motion=wave')")
    state = page.evaluate("() => JSON.stringify(FontKkuThemesPage.state())")
    link = page.evaluate("() => location.hash")
    page.goto(fonts_url + link, wait_until="load")
    page.wait_for_function("() => window.FontKkuThemesPage && FontKkuThemesPage.state()")
    if page.evaluate("() => JSON.stringify(FontKkuThemesPage.state())") != state:
        raise AssertionError(f"{label}: #compose= link should restore the same combination {link!r}")
    # 제 색을 가진 글꼴을 꾸밈 없이 반대 밝기 바탕에 두면 바탕 글자색으로 칠한다(검은 자소판 + 어두운 바탕)
    page.evaluate("() => FontKkuThemesPage.setState({font: 'sprite-system', look: '', vary: [], seed: 'off', motion: '', fx: '', tone: 'dark', text: ''})")
    page.wait_for_function("() => document.querySelector('[data-compose-host]')?.dataset.fySpritePaint === 'mask'")
    inked = page.evaluate("""() => { const h = document.querySelector('[data-compose-host]');
      const jamo = h.querySelector('[data-sprite-jamo-kind]');
      return [getComputedStyle(jamo).color, document.querySelector('[data-compose-code]').textContent.includes('--fy-sprite-paint: mask')]; }""")
    if inked != ["rgb(244, 241, 234)", True]:
        raise AssertionError(f"{label}: a dark-ink font on a dark background must take the background's ink {inked!r}")
    page.evaluate("() => FontKkuThemesPage.setState({font: 'sprite-system', look: '', vary: [], seed: 'off', motion: '', fx: '', tone: 'light', text: ''})")
    # 획 단위 변주·움직임(ADR-018)을 고르면 벡터 자소 모듈이 있는 글꼴은 jamo-set을 달아 획으로 쪼갠다
    page.evaluate("() => FontKkuThemesPage.setState({font: 'sprite-system', look: '', vary: ['hoek'], seed: 'auto', motion: 'draw', fx: '', tone: 'paper', text: ''})")
    page.wait_for_function("""() => { const h = document.querySelector('[data-compose-host]');
      return h.getAttribute('jamo-set') === 'sprite-system' && h.dataset.fyStrokeDepth === 'stroke' &&
        h.querySelectorAll('[part="hoek"]').length > 5; }""", timeout=8000)
    if 'jamo-set="sprite-system"' not in page.evaluate("() => document.querySelector('[data-compose-code]').textContent"):
        raise AssertionError(f"{label}: composer code should carry jamo-set for a stroke-level combination")
    page.evaluate("() => FontKkuThemesPage.setState({font: 'gothic', look: '', vary: ['hoek'], seed: 'auto', motion: 'draw', fx: '', tone: 'paper', text: ''})")
    page.wait_for_function("""() => { const h = document.querySelector('[data-compose-host]');
      return h.getAttribute('font') === 'gothic' && !h.hasAttribute('jamo-set') && h.dataset.fyStrokeDepth === 'jamo'; }""", timeout=8000)
    page.evaluate("() => FontKkuThemesPage.setState({font: 'sprite-system', look: '', vary: [], seed: 'off', motion: '', fx: '', tone: 'light', text: ''})")
    page.wait_for_function("() => !document.querySelector('[data-compose-host]').dataset.fySpritePaint")
    # 꾸미기를 열었다 닫아도 조합기 링크(#compose=)는 남는다. 조합기는 해시를 200ms 늦춰 쓰고 대화상자 close 사건도 늦게
    # 오므로, 지금 조합의 해시가 선 뒤에 열고 닫은 뒤에는 되돌아오기를 기다린다
    page.wait_for_function("() => location.hash === '#compose=' + FontKkuThemesPage.encode()")
    composed = page.evaluate("() => location.hash")
    page.evaluate("() => FontKkuCustomizer.open('sebul')")
    page.wait_for_function("() => location.hash.startsWith('#kku=')")
    page.evaluate("() => FontKkuCustomizer.close()")
    restored = poll(page, "() => location.hash", lambda value: value == composed, timeout=5)
    if restored != composed:
        raise AssertionError(f"{label}: closing the customizer must restore the composer hash {composed!r}, got {restored!r}")
    # 조합 뽑기는 정본에 있는 것만 고른다
    for _ in range(8):
        drawn = page.evaluate("() => FontKkuThemesPage.random()")
        valid = page.evaluate("""(s) => s.font in FontKkuThemes.fonts && (!s.look || s.look in FontKkuThemes.looks) &&
          s.vary.every((v) => v in FontKkuThemes.variations) && (!s.motion || s.motion in FontKkuThemes.motions) &&
          (!s.fx || s.fx in FontKkuThemes.interactions) && s.tone in FontKkuThemes.tones""", drawn)
        if not valid:
            raise AssertionError(f"{label}: random combination outside the registry {drawn!r}")
    # 옛 글꼴 주소: 꾸러미 글꼴(#neon)은 그 테마 카드로, 글꼴 축(#pixel)은 견본 행으로
    page.goto(fonts_url + "#neon", wait_until="load")
    page.wait_for_function("""() => { const a = document.getElementById('neon'); const card = a && a.closest('[data-theme-card]');
      return card && card.dataset.themeCard === 'neon' && card.querySelector('[data-theme-stage][data-rendered]'); }""")
    if page.locator("#pixel[data-font-row]").count() != 1:
        raise AssertionError(f"{label}: font-axis fonts keep their row anchors")


LANDING_SETS = ("claude-marker-1", "claude-marker-2", "claude-brush-1", "claude-balloon-1", "claude-balloon-2", "claude-pen-1")


def assert_landing_problems(page, url: str, label: str) -> None:
    """소개 '8칸 만들기'와 그 증명(PRD-USE-001): AI 답 세트가 원형 8칸 그대로 등록되고 문장의 자모가 모두 그 8칸에서
    나온다, 칸 하나가 들어가는 글자 수(ㄱ 3,444자)를 조립 계획으로 센다, 칸을 직접 그으면 그 자모가 든 글자가 바뀌고
    '내 페이지에 쓰기' 코드가 따라온다, 자모 지도 41칸, 씨앗 변주(같은 AI 세트의 글자 노드에 6줄 JS 흔들기 · 이름 씨앗), NFD 대조, 좁은 화면 넘침 없음.
    서버에서는 11,172자를 모두 그려 자모 노드가 모두 8칸에서 왔는지도 센다."""
    page.goto(url, wait_until="load")
    page.wait_for_function("() => document.querySelectorAll('[data-maker-cells] [data-maker-cell]').length === 8")
    # AI 답(landing-ai-sets.js)은 답 HTML의 등록 코드를 그대로 돌려 원형 8칸 칸 계약 세트로 등록된다
    sets = page.evaluate(
        """() => FontKkuLandingSets.sets.map((set) => { const r = FontKkuLandingSets.read(set);
          return [set.id, Object.keys(r.cells).join(''), r.options.frame, FontKku.jamoSets().includes(set.id), set.edited]; })"""
    )
    if sets != [[sid, "ㄱㄴㅁㅅㅇㆍㅡㅣ", "box", True, False] for sid in LANDING_SETS]:
        raise AssertionError(f"{label}: the AI answers should register the 8 origin cells unedited {sets!r}")
    # 히어로 문장의 자모 노드는 모두 그 세트에서 왔다(원소 획·CSS 상자로 대체된 것 없음)
    page.wait_for_function("() => (FontKku.traceOf(document.querySelector('[data-maker-host]'))?.nodes || []).length > 20")
    hero = page.evaluate(
        """() => { const h = document.querySelector('[data-maker-host]'); const t = FontKku.traceOf(h);
          return [h.getAttribute('jamo-set'), t.nodes.length, t.nodes.every((n) => n.requests.every((q) => q.source === 'claude-marker-1' && q.result !== 'primitive' && q.result !== 'none'))]; }"""
    )
    if hero[0] != "claude-marker-1" or not hero[2]:
        raise AssertionError(f"{label}: every jamo of the hero sentence should come from the 8 drawn cells {hero!r}")
    # 칸 계약 그림 세트에 움직임(animate)만 붙여도 SVG 재료 그대로다 — 속성만 바뀐 다시 그리기가 data-fy-face를 element로 되돌리면
    # SVG 획 규칙이 풀려 경로가 검게 채워졌다(소개 첫 화면의 조립 움직임)
    page.wait_for_function("() => !document.querySelector('[data-maker-host]').hasAttribute('animate')", timeout=10000)
    faces = page.evaluate(
        """async () => { const h = document.querySelector('[data-maker-host]'); const read = () => { const path = h.querySelector('[part="vector"] > *');
            const style = path && getComputedStyle(path); return [h.dataset.fyFace, style && style.fill, style && style.stroke !== 'none']; };
          const before = read(); h.setAttribute('animate', 'drop'); await new Promise((done) => setTimeout(done, 120));
          const during = read(); h.removeAttribute('animate'); await new Promise((done) => setTimeout(done, 120)); return [before, during, read()]; }"""
    )
    if any(state != ["svg", "none", True] for state in faces):
        raise AssertionError(f"{label}: a drawn set must keep the svg face and stroked paths while animate changes {faces!r}")
    # 칸 하나가 들어가는 글자 수 — ㄱ은 ㄱ·ㄲ·ㅋ 초성과 ㄱ·ㄲ·ㄳ·ㄺ·ㅋ 받침: 3×21×28 + 16×21×5 = 3,444
    counts = page.evaluate("() => [...document.querySelectorAll('[data-cellcount] li')].map((li) => li.textContent.replace(/\\s+/g, ''))")
    if len(counts) != 8 or counts[0] != "ㄱ3,444자":
        raise AssertionError(f"{label}: the per-cell counts should come from the assembly plans (ㄱ 3,444) {counts!r}")
    # 자모 지도: 자음 19·모음 21과 점 ㆍ, 그린 칸 8개 · 24칸 단계에서 그릴 칸 24개
    jamomap = page.evaluate(
        """() => [document.querySelectorAll('[data-jamomap-grid] li').length,
          document.querySelectorAll('[data-jamomap-grid] li[data-drawn="true"]').length]"""
    )
    if jamomap != [41, 8]:
        raise AssertionError(f"{label}: the jamo map should show 40 jamo + the dot, 8 drawn {jamomap!r}")

    # 칸을 직접 그으면 'landing-draw' 세트가 등록되고, 바뀐 글자 수를 세고, 내 페이지 코드가 그 칸을 담는다
    page.locator("[data-maker]").scroll_into_view_if_needed()
    page.click("[data-maker-cell='ㄱ']")
    page.wait_for_selector("[data-maker-pad]:not([hidden])")
    box = page.locator("[data-maker-canvas]").bounding_box()
    unit = box["width"] / 100
    page.mouse.move(box["x"] + 12 * unit, box["y"] + 18 * unit)
    page.mouse.down()
    for x, y in ((40, 26), (80, 16), (78, 50), (66, 88)):
        page.mouse.move(box["x"] + x * unit, box["y"] + y * unit, steps=5)
    page.mouse.up()
    page.wait_for_function("() => document.querySelector('[data-maker-host]').getAttribute('jamo-set') === 'landing-draw'")
    drawn = page.evaluate(
        """() => [document.querySelector('[data-maker-count]').textContent.split(' · ')[0],
          document.querySelector('[data-web-host]').getAttribute('jamo-set'),
          /"ㄱ": \\{ box: \\[1\\d/.test(document.querySelector('[data-web-code]').textContent),
          document.querySelector('[data-maker-tabs] [aria-selected="true"]').dataset.makerSet]"""
    )
    if drawn != ["ㄱ을 고쳐 3,444자가 바뀌었습니다", "landing-draw", True, "draw"]:
        raise AssertionError(f"{label}: drawing a cell should re-register the set, count the changed syllables and update the page code {drawn!r}")
    # 한 번에 돌려 그은 닫힌 획(처음과 끝이 같은 점)도 점 하나로 줄지 않는다
    page.click("[data-maker-cell='ㅇ']")
    loop = ((50, 15), (80, 30), (85, 60), (60, 85), (30, 80), (15, 50), (30, 20), (50, 15))
    page.mouse.move(box["x"] + loop[0][0] * unit, box["y"] + loop[0][1] * unit)
    page.mouse.down()
    for x, y in loop[1:]:
        page.mouse.move(box["x"] + x * unit, box["y"] + y * unit, steps=5)
    page.mouse.up()
    page.wait_for_function("() => /^ㅇ을 고쳐/.test(document.querySelector('[data-maker-count]').textContent)")
    kept = page.evaluate(
        """() => { const shape = FontKkuLanding.state().cells['ㅇ'].shapes[0]; const draft = JSON.parse(localStorage.getItem('font-kku:landing-draft') || 'null');
          return [(shape.match(/L/g) || []).length >= 4, !document.querySelector('[data-maker-keep]').hidden, Boolean(draft && draft.cells['ㅇ'] && draft.edited.includes('ㅇ'))]; }"""
    )
    if kept != [True, True, True]:
        raise AssertionError(f"{label}: a closed stroke should survive, and drawing should offer keep actions and save a draft {kept!r}")
    page.click("[data-maker-set='claude-pen-1']")
    page.wait_for_function("() => document.querySelector('[data-web-host]').getAttribute('jamo-set') === 'claude-pen-1'")
    page.click("[data-maker-set='claude-marker-1']")

    # 씨앗 변주: 같은 AI 마커 세트로 그린 글자(음절) 노드 넷에 화면의 6줄을 그대로 돌린다 — 글꼴은 같고
    # 흔드는 단위만 자모와 다르다. 이름 씨앗은 두 번 그려도 씨앗값이 같다
    page.locator("#vary").scroll_into_view_if_needed()
    page.wait_for_function(
        """() => { const g = [...document.querySelectorAll('[data-vary-js] [part~="glyph"]')];
          return g.length === 4 && g.every((n) => /deg$/.test(n.style.rotate)); }"""
    )
    jitter = page.evaluate(
        """() => [document.querySelector('[data-vary-js]').getAttribute('jamo-set'), document.querySelector('[data-vary-js-code]').textContent.split('\\n').length]"""
    )
    if jitter != ["claude-marker-1", 6]:
        raise AssertionError(f"{label}: the per-syllable JS jitter should run the 6 lines it shows on the same AI set {jitter!r}")
    page.wait_for_function("() => document.querySelector('[data-name-check]').textContent.startsWith('✓')")
    page.click("[data-vary-fix]")
    fixed = page.evaluate("""() => { const h = document.querySelector('[data-vary-host]'); const seed = h.getAttribute('seed'); const code = document.querySelector('#vary-code').textContent;
      return [/^[a-z0-9]{4}$/.test(seed), document.querySelector('[data-vary-seed]').textContent === seed, code.includes('seed="' + seed + '"') && code.includes('jamo-seeds')]; }""")
    if fixed != [True, True, True]:
        raise AssertionError(f"{label}: '이 모양 고정' should pin the short seed it shows {fixed!r}")

    # 자모 단위: NFD로 푼 span(이 브라우저가 실제로 그린 것)과 폰꾸가 입력한 문장을 따라간다
    page.fill("[data-jamo-form] input", "닉네임 뷁")
    page.wait_for_function("() => document.querySelector('[data-jamo-host]').dataset.source === '닉네임 뷁'")
    nfd = page.evaluate("() => [document.querySelectorAll('[data-nfd] span').length, [...document.querySelectorAll('[data-fx-tile]')].every((h) => h.dataset.source === '닉네임 뷁' || h.hasAttribute('data-fx-type'))]")
    if nfd != [11, True]:
        raise AssertionError(f"{label}: the NFD comparison and the motion tiles should follow the typed sentence {nfd!r}")

    # 좁은 화면: 가로 넘침이 없고, 데모(8칸)가 첫 화면 안에 있다
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("window.scrollTo(0, 0)")
    narrow = poll(
        page,
        """() => [document.documentElement.scrollWidth - innerWidth,
          Math.round(document.querySelector('[data-maker-cells]').getBoundingClientRect().bottom) <= innerHeight,
          [...document.querySelectorAll('[data-demo-nav] a')].every((a) => { const r = a.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; })]""",
        lambda value: value == [0, True, True],
        timeout=5,
    )
    page.set_viewport_size({"width": 1280, "height": 720})
    if narrow != [0, True, True]:
        raise AssertionError(f"{label}: at 390px the landing should not overflow, show the 8 cells in the first screen and keep the menu on screen {narrow!r}")

    # 노트북 브라우저의 보이는 창(1366×768·1280×800 화면에서 작업 표시줄·메뉴 막대·브라우저 틀을 뺀 크기): 주 버튼이 스크롤 없이 다 보인다
    for width, height in ((1366, 657), (1280, 689)):
        page.set_viewport_size({"width": width, "height": height})
        page.evaluate("window.scrollTo(0, 0)")
        fold = poll(page, "() => [Math.round(document.querySelector('[data-maker-cta]').getBoundingClientRect().bottom), innerHeight]",
                    lambda value: value[0] <= value[1], timeout=5)
        if fold[0] > fold[1]:
            raise AssertionError(f"{label}: at {width}x{height} the main button should be fully visible without scrolling {fold!r}")
    page.set_viewport_size({"width": 1280, "height": 720})

    # 다른 페이지의 '8칸 그리러 가기'(index.html#maker-draw): 데모를 머리말 아래로 옮겨 '✎ 직접 그리기'를 연 채로 연다
    jump = page.context.browser.new_page(viewport={"width": 1280, "height": 800})
    try:
        jump.goto(url + "#maker-draw", wait_until="load")
        jump.wait_for_selector("[data-maker-pad]:not([hidden])")
        landed = poll(
            jump,
            """() => { const m = document.querySelector('#maker').getBoundingClientRect(); const c = document.querySelector('[data-maker-canvas]').getBoundingClientRect();
              return [document.querySelector('[data-maker-tabs] [aria-selected="true"]').dataset.makerSet, m.top >= 64 && m.top <= 100, c.top >= 0 && c.bottom <= innerHeight]; }""",
            lambda value: value == ["draw", True, True],
        )
        if landed != ["draw", True, True]:
            raise AssertionError(f"{label}: index.html#maker-draw should land on the maker with the drawing pad open {landed!r}")
    finally:
        jump.close()

    # 11,172자 모두 그려 보기 — 자모 노드가 모두 그린 8칸에서 나왔다(서버에서만: 몇 초 걸린다). 증명은 접혀 있어 먼저 편다
    if label == "server":
        page.set_viewport_size({"width": 1280, "height": 720})
        page.locator("[data-proof] > summary").scroll_into_view_if_needed()
        page.click("[data-proof] > summary")
        page.locator("[data-fullcheck]").scroll_into_view_if_needed()
        page.click("[data-fullcheck]")
        page.wait_for_function("() => /11,172자 중/.test(document.querySelector('[data-fullcheck-out]').textContent)", timeout=90000)
        out = page.locator("[data-fullcheck-out]").inner_text()
        if not re.search(r"11,172자 중 11,172자를 그렸습니다\. 자모 노드 ([\d,]+)개 가운데 \1개가 그린 8칸에서 나왔고, 다른 데서 온 것은 0개", out):
            raise AssertionError(f"{label}: all 11,172 syllables should be drawn from the 8 cells, got {out!r}")
        page.wait_for_function("() => document.querySelectorAll('[data-fullcheck-sample] > span font-kku[data-fy-upgraded]').length === 48")

    # 주 버튼의 주소(font-studio.html#draw): 작업실이 그림 세트 재료로 바꾸고 그리기 탭을 빈 그림 문서로 바로 연다
    page.goto(url.replace("index.html", "font-studio.html") + "#draw", wait_until="load")
    frame = studio_content(page)
    frame.wait_for_function(
        """() => window.FontStudio && FontStudio.draw && FontStudio.draw.doc() &&
          document.querySelector('.studio-draw') && !document.querySelector('.studio-draw').closest('[hidden]')""",
        timeout=20000,
    )
    studio = frame.evaluate("() => [FontStudio.design.json().mode, Object.keys(FontStudio.draw.doc().cells || {}).length]")
    if studio != ["svg", 0]:
        raise AssertionError(f"{label}: #draw should open the drawing tab on an empty set {studio!r}")

    # '작업실에서 이어 그리기': 소개에서 그린 칸을 작업실 그리기 탭이 편집 하나로 가져온다(따로 연 창 — 저장소를 다른 검사와 나누지 않는다)
    if label == "server":
        fresh = page.context.browser.new_page()
        try:
            fresh.goto(url, wait_until="load")
            fresh.wait_for_function("() => document.querySelectorAll('[data-maker-cells] [data-maker-cell]').length === 8")
            fresh.click("[data-maker-set='draw']")
            fresh.wait_for_selector("[data-maker-keep]:not([hidden])")
            fresh.click("[data-maker-studio]")
            fresh.wait_for_url("**/font-studio.html#draw")
            embedded = studio_content(fresh)
            embedded.wait_for_function(
                "() => window.FontStudio && FontStudio.draw && FontStudio.draw.doc() && Object.keys(FontStudio.draw.doc().cells || {}).length === 8",
                timeout=20000,
            )
            handed = embedded.evaluate("() => [location.hash, localStorage.getItem('font-kku:studio-handoff'), FontStudio.design.json().mode]")
            if handed != ["#draw", None, "svg"]:
                raise AssertionError(f"{label}: the studio should take the landing cells once {handed!r}")
        finally:
            fresh.close()


def assert_effects_page(page, url: str, label: str) -> None:
    """움직임 페이지(effects.html): 한 줄 설치의 data-addons="motion fx"로 확장이 붙고, 카드 13장이
    견본을 그린다. animate 이름이 자모 움직임으로 풀리고, 복사 코드는 data-addons가 든 CDN 주소의
    HTML 한 장이며, 다시 재생·움직임 멈추기(data-kku-paused)·커서 자석·씨앗 섞기·획 그리기·
    마스크 칠·스크롤 조립이 동작한다."""
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(url.replace("index.html", "effects.html"), wait_until="load")
    scroll_and_wait_fonts(page, ".fx-stage font-kku")
    page.wait_for_function(
        """() => {
          const hosts = [...document.querySelectorAll('.fx-stage font-kku')];
          return window.FontKkuFx && hosts.length >= 19;
        }""",
        timeout=15000,
    )
    state = page.evaluate(
        """() => {
          const host = (id) => document.querySelector('#fx-' + id + ' .fx-stage font-kku');
          const jamoAnimation = (id, part) => {
            const node = host(id)?.querySelector('[part~="' + part + '"]');
            return node ? getComputedStyle(node).animationName : '';
          };
          return {
            nav: [...document.querySelectorAll('[data-demo-nav] [data-demo-nav-link]')].map((a) => a.dataset.demoNavLink),
            current: document.querySelector('[data-demo-nav] [aria-current="page"]')?.dataset.demoNavLink,
            navLabel: document.querySelector('[data-demo-nav] [data-demo-nav-link="effects"]')?.textContent.trim(),
            title: document.title,
            motionCss: [...document.styleSheets].some((sheet) => (sheet.href || '').endsWith('/font-kku-motion.css')),
            cards: document.querySelectorAll('[data-fx]').length,
            groups: [...document.querySelectorAll('.fx-group')].map((g) => g.querySelectorAll('[data-fx]').length),
            codes: [...document.querySelectorAll('[data-fx]')].map((c) => {
              const t = document.getElementById('fx-code-' + c.dataset.fx)?.textContent || '';
              const addons = c.dataset.fxAddons;
              return t.includes('https://cdn.jsdelivr.net/npm/@tty.link/font-kku@') && t.includes('/font-kku.min.js"') && !t.includes('../') &&
                (!addons || t.includes('data-addons="' + addons + '"'));
            }),
            animate: ['assemble', 'drop', 'wave', 'flicker', 'cycle', 'shine', 'scroll', 'draw'].map((id) => host(id)?.dataset.fyAnimate),
            names: [jamoAnimation('wave', 'jungseong'), jamoAnimation('cycle', 'jongseong'), jamoAnimation('shine', 'choseong')],
            snippet: document.getElementById('fx-code-wave')?.textContent || '',
            draw: host('draw') && [host('draw').dataset.fyStrokeDepth, host('draw').querySelectorAll('[part="hoek"][pathLength="1"]').length],
            origin: [...document.querySelectorAll('#fx-origin font-kku')].map((h) => {
              const added = h.querySelector('[data-hoek-role="added"]'), person = h.querySelector('[data-hoek-role="person"]');
              return [h.dataset.fyStrokeDepth, added && getComputedStyle(added).stroke, person && getComputedStyle(person).stroke];
            }),
            mask: host('shine')?.dataset.fySpritePaint,
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        }"""
    )
    if state["nav"] != PUBLIC_NAV or state["current"] != "effects" or state["navLabel"] != "움직임" or "움직임" not in state["title"]:
        raise AssertionError(f"{label}: the effects page should be the '움직임' menu entry, got {state!r}")
    if not state["motionCss"] or state["cards"] != 14 or state["groups"] != [9, 4, 1] or not all(state["codes"]):
        raise AssertionError(f"{label}: addons / cards / CDN snippets with data-addons broken: {state!r}")
    if state["animate"] != ["assemble", "drop", "wave", "flicker", "cycle", "shine", "scroll-assemble", "draw"] or \
            state["names"] != ["kku-wave", "kku-cycle", "kku-shine"]:
        raise AssertionError(f"{label}: animate names should resolve to the motion addon's jamo keyframes: {state!r}")
    if "<style>" in state["snippet"] or 'animate="wave"' not in state["snippet"]:
        raise AssertionError(f"{label}: a motion card's snippet should be one line of markup: {state['snippet']!r}")
    # 획 깊이(ADR-018): 획순 그리기는 벡터 자소를 획으로 쪼개고, 제자원리 보기는 획 역할로 칠한다
    if state["draw"] is None or state["draw"][0] != "stroke" or state["draw"][1] < 10 or state["mask"] != "mask" or state["overflow"] > 0:
        raise AssertionError(f"{label}: stroke draw / mask paint / overflow broken: {state!r}")
    if state["origin"] != [["stroke", "rgb(230, 57, 70)", None], ["stroke", "rgb(230, 57, 70)", "rgb(58, 110, 165)"]]:
        raise AssertionError(f"{label}: the stroke-origin recipe should color strokes by data-hoek-role {state['origin']!r}")
    # animate를 지우면 획 깊이도 꺼진다 — 런타임이 찍은 data-fy-animate 도장이 다시 그릴 때 획 깊이를 붙들면 안 된다
    undrawn = page.evaluate("""() => {
      const h = document.querySelector('#fx-draw font-kku');
      h.removeAttribute('animate');
      const off = [h.dataset.fyStrokeDepth || null, h.querySelectorAll('[part="hoek"]').length];
      h.setAttribute('animate', 'draw');
      return off.concat([h.dataset.fyStrokeDepth, h.querySelectorAll('[part="hoek"]').length > 0]);
    }""")
    if undrawn != [None, 0, "stroke", True]:
        raise AssertionError(f"{label}: removing animate=draw should return to jamo depth and back {undrawn!r}")

    # 다시 재생: 받침 톡이 다시 그려져 처음부터 돈다
    page.evaluate("() => document.getElementById('fx-drop').scrollIntoView({ block: 'center', behavior: 'instant' })")
    # 화면에 들어올 때 한 번 더 도는 움직임(1.1초)이 끝나기를 기다린 뒤 누른다 — 끝나지 않았으면 다시 시작과 가리지 못한다
    page.wait_for_function(
        "() => { const card = document.getElementById('fx-drop'); return card.querySelector('font-kku[data-fy-upgraded]') &&"
        " card.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'); }",
        timeout=15000,
    )
    # 다시 시작했는지는 누른 뒤 흐른 시간과 비교한다 — 부하가 크면(병렬 스모크) 읽기가 늦어질 수 있다
    page.evaluate("() => { window.__fxAgainAt = performance.now(); }")
    page.click("#fx-drop [data-fx-again]")
    replay = poll(page, """() => ({
      times: document.getElementById('fx-drop').getAnimations({ subtree: true }).map((a) => a.currentTime ?? 0),
      elapsed: performance.now() - window.__fxAgainAt })""",
                  lambda value: bool(value["times"]) and max(value["times"]) <= value["elapsed"] + 150, timeout=5)
    times = replay["times"]
    if not times or max(times) > replay["elapsed"] + 150:
        raise AssertionError(f"{label}: replay should restart the jong drop, got {replay!r}")

    # 움직임 멈추기: data-kku-paused가 확장의 반복 움직임을 세운다
    page.click("[data-fx-pause]")
    paused = page.evaluate("""() => ({
      body: document.body.hasAttribute('data-kku-paused'),
      states: [...new Set(document.getElementById('fx-wave').getAnimations({ subtree: true }).map((a) => a.playState))],
    })""")
    page.click("[data-fx-pause]")
    if not paused["body"] or paused["states"] != ["paused"]:
        raise AssertionError(f"{label}: pause toggle should pause looping motions, got {paused!r}")

    # 커서 자석(data-kku-fx="magnet"): 커서 가까운 자모가 밀려난다
    page.evaluate("() => document.getElementById('fx-magnet').scrollIntoView({ block: 'center', behavior: 'instant' })")
    box = page.evaluate("""() => {
      const r = document.querySelector('#fx-magnet font-kku [part~="jamo"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }""")
    page.mouse.move(box["x"] - 200, box["y"] - 200)
    page.mouse.move(box["x"] + 4, box["y"] + 4, steps=6)
    # 자석은 프레임마다 조금씩 따라간다 — 부하가 크면 400ms에 한 프레임도 안 돌 수 있어 밀릴 때까지 기다린다
    pushed = poll(page, """() => [...document.querySelectorAll('#fx-magnet font-kku [part~="jamo"]')]
      .filter((n) => n.style.translate.split(' ').some((v) => Math.abs(parseFloat(v)) >= 0.5)).length""",
                  lambda value: value >= 1, timeout=5)
    page.mouse.move(5, 5)
    if pushed < 1:
        raise AssertionError(f"{label}: the cursor magnet should push nearby jamo, moved {pushed}")

    # 씨앗 섞기(FontKkuFx.shuffle): 두 줄이 같은 새 씨앗을 받고, 처음 씨앗으로 돌아간다
    page.click("#fx-shuffle [data-reseed]")
    seeds = page.evaluate("""() => ({
      hosts: [...document.querySelectorAll('#fx-shuffle font-kku')].map((h) => h.getAttribute('seed')),
      out: document.querySelector('#fx-shuffle [data-seed-out]').textContent,
    })""")
    page.click("#fx-shuffle [data-seed-reset]")
    reset = page.evaluate("() => document.querySelector('#fx-shuffle font-kku').getAttribute('seed')")
    if len(set(seeds["hosts"])) != 1 or seeds["hosts"][0] == "손맛-1" or seeds["out"] != seeds["hosts"][0] or reset != "손맛-1":
        raise AssertionError(f"{label}: shuffle should reseed both lines together and reset, got {seeds!r} → {reset!r}")

    # 스크롤 조립(지원 브라우저): 화면 아래 끝에서는 흩어져 있고 가운데에서는 모여 있다
    if page.evaluate("() => CSS.supports('animation-timeline: view()')"):
        probe = """(offset) => {
          const host = document.querySelector('#fx-scroll font-kku');
          scrollTo({ top: host.getBoundingClientRect().top + scrollY - offset, behavior: 'instant' });
          return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() =>
            done(Math.min(...[...host.querySelectorAll('[part~="jamo"]')].map((n) => +getComputedStyle(n).opacity))))));
        }"""
        low = page.evaluate(probe, 880)
        mid = page.evaluate(probe, 300)
        if not (low < 0.2 and mid > 0.95):
            raise AssertionError(f"{label}: scroll assembly should follow the scroll position, got {low} → {mid}")


def assert_shared_demo_chrome(page, label: str, slug: str, next_slug: str) -> None:
    """개발 도구 페이지: 공개 메뉴(5개)에는 없고, 개발 도구 머리말이 이전·다음으로 잇는다."""
    nav_links = page.locator(".demo-nav [data-demo-nav-link]")
    links = nav_links.evaluate_all("(nodes) => nodes.map((node) => node.dataset.demoNavLink)")
    if links != PUBLIC_NAV:
        raise AssertionError(f"{label}: shared demo nav should list the public pages {PUBLIC_NAV!r}, got {links!r}")

    active = page.locator(".demo-nav [aria-current='page']")
    if active.count() != 0:
        raise AssertionError(f"{label}: a developer page must not mark a public menu item as current")

    context = page.locator(f"[data-demo-context-page='{slug}']").first
    if context.count() != 1:
        raise AssertionError(f"{label}: shared demo context missing for {slug}")

    next_link = context.locator(f"[data-demo-context-next='{next_slug}']").first
    if next_link.count() != 1:
        raise AssertionError(f"{label}: shared demo next link should point to {next_slug}")


def assert_basic_page(page, url: str, label: str) -> None:
    basic_url = url.replace("index.html", "basic-text.html")
    page.goto(basic_url, wait_until="load")
    page.wait_for_function(
        "() => document.querySelector('[data-case=\"legacy-core\"][data-fy-upgraded=\"true\"]') !== null"
    )
    assert_shared_demo_chrome(page, label, "basic-text", "layout-modes")
    # sebul 기본 depth(syllable): split 음절은 base 노드 대신 head 노드가 나온다.
    if page.locator("[data-case='legacy-core'] [part~='head']").count() < 1:
        raise AssertionError(f"{label}: syllable head node missing on basic page")
    gothic_host = page.locator("font-kku[font='gothic']").first
    if gothic_host.get_attribute("data-fy-expression") != "general":
        raise AssertionError(f"{label}: gothic font expression mode mismatch")
    assert_legacy_core_cases(page, label)

    gothic_stress = page.locator("font-kku[font='gothic']:has([part='glyph'][data-source='밟'])").first
    split_cluster = gothic_stress.locator(
        "[part='glyph'][data-source='과'] [part~='jungseong-cluster']"
    ).first
    split_transform = split_cluster.evaluate("(node) => getComputedStyle(node).transform")
    if split_transform == "none":
        raise AssertionError(f"{label}: gothic split cluster transform not applied")

    jong_cluster = gothic_stress.locator(
        "[part='glyph'][data-source='밟'] [part~='jongseong-cluster']"
    ).first
    jong_transform = jong_cluster.evaluate("(node) => getComputedStyle(node).transform")
    if jong_transform == "none":
        raise AssertionError(f"{label}: gothic jong cluster transform not applied")


def assert_gothic_context_page(page, url: str, label: str) -> None:
    context_url = url.replace("index.html", "shape-comparison.html")
    page.goto(context_url, wait_until="load")
    assert_shared_demo_chrome(page, label, "shape-comparison", "api-studio")
    if page.locator("font-kku[font='gothic2']").count() != 0:
        raise AssertionError(f"{label}: gothic2 hosts should not appear in shape comparison page")
    display_host = page.locator("font-kku[font='gothic'][size='120']").first
    if display_host.get_attribute("data-size-tier") is not None:
        raise AssertionError(f"{label}: deprecated size tier attribute still present")
    sentence_host = page.locator("font-kku[font='gothic'][size='60']").first
    if sentence_host.get_attribute("data-size-tier") is not None:
        raise AssertionError(f"{label}: deprecated sentence size tier attribute still present")

    ga = page.locator("[part='glyph'][data-source='가']").first
    if ga.get_attribute("data-fy-layout-bucket") != "right-open":
        raise AssertionError(f"{label}: 가 layout bucket mismatch")
    if ga.get_attribute("data-fy-strategy") is not None:
        raise AssertionError(f"{label}: deprecated strategy dataset still present")
    if ga.locator("[part~='glyph-body']").count() != 1:
        raise AssertionError(f"{label}: 가 glyph body missing")

    wang = page.locator("[part='glyph'][data-source='왕']").first
    if wang.get_attribute("data-fy-layout-bucket") != "split-closed":
        raise AssertionError(f"{label}: 왕 layout bucket mismatch")
    if wang.get_attribute("data-fy-axis") != "split":
        raise AssertionError(f"{label}: 왕 semantic axis mismatch")
    if wang.get_attribute("data-fy-open") != "closed":
        raise AssertionError(f"{label}: 왕 semantic open mismatch")
    if wang.get_attribute("data-fy-jong-count") != "single":
        raise AssertionError(f"{label}: 왕 semantic jong-count mismatch")
    if wang.locator("[part~='glyph-body']").count() != 1:
        raise AssertionError(f"{label}: 왕 glyph body missing")
    # sebul 기본 depth(syllable): 왕 = head(오)+tail(ㅏ)+받침 — cluster wrapper 없음
    if wang.locator("[part~='head']").count() != 1:
        raise AssertionError(f"{label}: 왕 syllable head missing")
    wang_roles = wang.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-fy-role'))"
    )
    if wang_roles != ["head", "jung-tail", "jong-main"]:
        raise AssertionError(f"{label}: 왕 semantic roles mismatch {wang_roles!r}")
    if wang.locator("[part~='jamo']").first.get_attribute("data-fy-id") is not None:
        raise AssertionError(f"{label}: deprecated jamo id dataset still present")

    ilg = page.locator("[data-problem-case='읽'] [part='glyph'][data-source='읽']").first
    if ilg.get_attribute("data-fy-layout-bucket") != "right-closed":
        raise AssertionError(f"{label}: 읽 layout bucket mismatch")
    if ilg.get_attribute("data-fy-axis") != "right":
        raise AssertionError(f"{label}: 읽 semantic axis mismatch")
    if ilg.get_attribute("data-fy-jong-count") != "double":
        raise AssertionError(f"{label}: 읽 semantic jong-count mismatch")
    # 읽 problem-case는 gothic 호스트 — gothic 기본 depth는 atomic이라 cluster 유지
    ilg_jong = ilg.locator("[part~='jongseong']").evaluate_all(
        "(nodes) => nodes.map((node) => [node.getAttribute('data-fy-role'), node.getAttribute('data-fy-pos')])"
    )
    if ilg_jong != [["jong-left", "blr"], ["jong-right", "brd"]]:
        raise AssertionError(f"{label}: 읽 jong node metadata mismatch {ilg_jong!r}")
    if ilg.locator("[part~='jongseong-cluster']").count() != 1:
        raise AssertionError(f"{label}: 읽 jongseong cluster missing")

    heulk = page.locator("[data-problem-case='흙'] [part='glyph'][data-source='흙']").first
    if heulk.get_attribute("data-fy-layout-bucket") != "bottom-closed":
        raise AssertionError(f"{label}: 흙 layout bucket mismatch")
    if heulk.get_attribute("data-fy-strategy") is not None:
        raise AssertionError(f"{label}: deprecated strategy dataset still present on 흙")


def assert_api_studio(page, label: str) -> None:
    page.wait_for_function("() => Boolean(window.FontKku)")
    page.locator("[name='text']").fill("밤의 서점 2026")
    page.locator("[name='font']").select_option("sebul")
    page.locator("[name='size']").fill("38")
    page.locator("[name='animate']").select_option("rise")
    page.locator("[data-api-form] button").click()
    page.wait_for_function(
        "() => document.querySelector('[data-api-output][data-fy-upgraded=\"true\"]') !== null"
    )

    output = page.locator("[data-api-output][data-fy-upgraded='true']").first
    if output.get_attribute("data-source") != "밤의 서점 2026":
        raise AssertionError(f"{label}: API output text did not update")

    if output.get_attribute("data-fy-font") != "sebul":
        raise AssertionError(f"{label}: API output font not applied")

    if "font-kku" not in (output.get_attribute("class") or "").split():
        raise AssertionError(f"{label}: API output is missing the decorator host class")

    text_output = page.locator("[data-api-text-output]").first.inner_text()
    if "ㅂㅏ" not in text_output or any(digit not in text_output for digit in ("２", "０", "６")):
        raise AssertionError(f"{label}: API text output missing expected decomposition")

    if page.locator("[data-api-metrics] .demo-metric-card").count() != 6:
        raise AssertionError(f"{label}: API metrics were not rendered")

    if page.locator("[data-api-topologies] .demo-topology-chip").count() < 1:
        raise AssertionError(f"{label}: API topology summary missing")

    model_json = page.locator("[data-api-model]").first.inner_text()
    if '"type": "line"' not in model_json or '"source": "밤"' not in model_json:
        raise AssertionError(f"{label}: API model output missing expected JSON content")


def assert_studio_presets(page, url: str, label: str) -> None:
    studio_url = url.replace("index.html", "api-studio.html")
    page.goto(studio_url, wait_until="load")
    page.wait_for_function(
        "() => document.querySelector('[data-api-output][data-fy-upgraded=\"true\"]') !== null"
    )

    text_output = page.locator("[data-api-text-output]").first.inner_text()
    if "오ㅣ" not in text_output or "호ㅣ" not in text_output:
        raise AssertionError(f"{label}: studio did not render initial split output")

    if page.locator("[data-api-topologies] .demo-topology-chip").count() < 2:
        raise AssertionError(f"{label}: studio topology summary too small")

    page.locator("[data-text-preset]").last.click()
    page.wait_for_function(
        "() => document.querySelector('[data-api-output]').dataset.source === '서울의 밤\\n작은 광장'"
    )

    preset_output = page.locator("[data-api-text-output]").first.inner_text()
    if preset_output.count("\n") != 3 or any(
        chunk not in preset_output for chunk in ("ㅅㅓ", "ㅂㅏ", "ㅈㅏ", "고ㅏ")
    ):
        raise AssertionError(f"{label}: multiline preset text output mismatch")

    if page.locator("[data-api-model]").first.inner_text().count('"type": "line"') != 2:
        raise AssertionError(f"{label}: multiline preset did not produce two line nodes")


def studio_url(url: str, query: str) -> str:
    return url.replace("index.html", "font-studio.html") + query


def assert_sprite_demo(page, url: str, label: str) -> None:
    sprite_url = url.replace("index.html", "sprite-demo.html")
    page.goto(sprite_url, wait_until="load")
    page.wait_for_function(
        "() => document.querySelector('font-kku[font=\"sprite-example\"][data-fy-upgraded=\"true\"]') !== null"
        " && document.querySelector('font-kku[font=\"sprite-system\"][data-fy-upgraded=\"true\"]') !== null"
    )

    sheet = page.locator("img.sprite-sheet-preview").first.evaluate(
        "(img) => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight })"
    )
    if sheet != {"complete": True, "width": 1344, "height": 128}:
        raise AssertionError(f"{label}: sprite sheet image mismatch {sheet!r}")

    # 벡터 자소(ADR-013): jamo-set이 자모마다 SVG를 넣고, 칸은 폰트의 행 선택(--fy-sprite-row)을
    # 따르고(그의 ㄱ은 가로 모음 위 초성 행, 흙의 ㄺ은 겹받침 행), 글자 색을 따르며, 늦게 등록한
    # 세트는 그 바탕 요소를 다시 그린다. 런타임보다 먼저 실린 모듈은 대기열로 등록된다.
    page.wait_for_function(
        "() => document.querySelector('[data-vector-late]').dataset.fyMaterial === 'vector'", timeout=5000
    )
    vector = page.evaluate(
        """() => {
            const host = document.querySelector('[data-vector-sample]');
            const kinds = host.dataset.fySpriteKinds.split(' ');
            const nodes = [...host.querySelectorAll('[data-sprite-jamo-kind]')]
              .filter((node) => kinds.includes(node.dataset.spriteJamoKind));
            const cellOf = (glyphSource, jamo) => {
              const glyph = [...host.querySelectorAll('[part="glyph"]')].find((g) => g.dataset.source === glyphSource);
              const node = glyph && [...glyph.querySelectorAll('[data-sprite-jamo]')].find((n) => n.dataset.spriteJamo === jamo);
              const svg = node && node.querySelector(':scope > [part="vector"]');
              return svg ? svg.getAttribute('data-cell') : null;
            };
            const first = nodes[0];
            const tint = document.querySelector('.vector-tint [part~="choseong"] [part="vector"] > *') ||
              document.querySelector('.vector-tint [part~="choseong"][data-sprite-jamo-kind] [part="vector"] > *');
            const late = document.querySelector('[data-vector-late]');
            return {
              sets: FontKku.jamoSets(),
              material: host.dataset.fyMaterial,
              jamoSet: host.dataset.fyJamoSet,
              nodes: nodes.length,
              drawn: nodes.filter((node) => node.querySelectorAll(':scope > [part="vector"]').length === 1).length,
              cells: { 닭: cellOf('닭', 'ㄷ'), 닭ㅏ: cellOf('닭', 'ㅏ'), 그: cellOf('그', 'ㄱ'), 흙: cellOf('흙', 'ㄺ'), ㅋ: cellOf('ㅋ', 'ㅋ') },
              background: getComputedStyle(first).backgroundImage,
              fill: getComputedStyle(first).webkitTextFillColor,
              stroke: tint ? getComputedStyle(tint).stroke : null,
              lateMaterial: late.dataset.fyMaterial,
              lateDrawn: late.querySelectorAll('[part="vector"]').length,
            };
        }"""
    )
    expected_cells = {"닭": "r0-ㄷ", "닭ㅏ": "r1-ㅏ", "그": "r4-ㄱ", "흙": "r3-ㄺ", "ㅋ": "r0-ㅋ"}
    if "sprite-system" not in vector["sets"] or vector["material"] != "vector" or vector["jamoSet"] != "sprite-system":
        raise AssertionError(f"{label}: the queued sprite-system jamo module did not register or apply {vector!r}")
    if vector["nodes"] == 0 or vector["drawn"] != vector["nodes"]:
        raise AssertionError(f"{label}: every vector jamo node needs exactly one SVG {vector!r}")
    if vector["cells"] != expected_cells:
        raise AssertionError(f"{label}: vector cells must follow the font's row choice {vector['cells']!r}")
    if vector["background"] != "none" or vector["fill"] != "rgba(0, 0, 0, 0)":
        raise AssertionError(f"{label}: vector nodes must drop the sheet and keep transparent text {vector!r}")
    if vector["stroke"] != "rgb(230, 57, 70)":
        raise AssertionError(f"{label}: vector strokes must follow the page color per part {vector['stroke']!r}")
    if vector["lateMaterial"] != "vector" or vector["lateDrawn"] != 4:  # 낱자 ㄱ·ㅏ + 가의 ㄱ·ㅏ
        raise AssertionError(f"{label}: a set registered after render must re-render its hosts {vector!r}")

    # 마스크 칠(ADR-014): --fy-sprite-paint: mask가 자소판을 마스크로, 칠을 글자 색·--fy-sprite-fill로 바꾼다.
    mask = page.evaluate(
        """() => {
            const host = document.querySelector('[data-mask-sample]');
            const pick = (part) => host.querySelector(`[part~="${part}"][data-sprite-jamo-kind]`);
            const style = (node) => node ? getComputedStyle(node) : null;
            const cho = style(pick('choseong')), jung = style(pick('jungseong'));
            return {
              paint: host.dataset.fySpritePaint,
              cell: pick('choseong') ? pick('choseong').getAttribute('data-fy-sprite-cell') : null,
              maskImage: cho && (cho.maskImage || cho.webkitMaskImage),
              choColor: cho && cho.color,
              choBackground: cho && cho.backgroundImage,
              jungBackground: jung && jung.backgroundImage,
              fill: cho && cho.webkitTextFillColor,
            };
        }"""
    )
    # Firefox·Chromium(0.1.4-rc.4~) 칸 문서는 자소판 칸을 blob 그림으로 준다(data-fy-sprite-cell — "wait"는 아직 받는 중).
    mask_image = mask["maskImage"] or ""
    from_cell = mask["cell"] not in (None, "wait") and mask_image.startswith('url("blob:')
    if mask["paint"] != "mask" or not ("sprite-system.svg" in mask_image or from_cell):
        raise AssertionError(f"{label}: mask paint must mask with the sheet {mask!r}")
    if mask["choColor"] != "rgb(230, 57, 70)" or "linear-gradient" not in mask["choBackground"]:
        raise AssertionError(f"{label}: mask paint must fill with the text color by default {mask!r}")
    if "rgb(37, 99, 235)" not in mask["jungBackground"] or mask["fill"] != "rgba(0, 0, 0, 0)":
        raise AssertionError(f"{label}: --fy-sprite-fill must paint per part and the text stay hidden {mask!r}")

    # Firefox·Chromium(0.1.4-rc.4~): 런타임이 SVG 자소판을 칸 문서로 나누는 동안(data-fy-sprite-cell="wait") 노드 그림이 비어 있다
    page.wait_for_function("() => !document.querySelector('[data-fy-sprite-cell=\"wait\"]')", timeout=20000)
    gwang = page.locator(
        "font-kku[font='sprite-example'] [part='glyph'][data-source='광']"
    ).first
    sprite_jamo = gwang.locator("[part~='jamo']").evaluate_all(
        """(nodes) => nodes.map((node) => ({
            source: node.getAttribute('data-jamo'),
            sprite: node.getAttribute('data-sprite-jamo'),
            kind: node.getAttribute('data-sprite-jamo-kind'),
            index: node.getAttribute('data-sprite-jamo-index'),
            pos: node.getAttribute('data-fy-pos'),
            cell: node.getAttribute('data-fy-sprite-cell'),
            bg: getComputedStyle(node).backgroundImage,
            bgPos: getComputedStyle(node).backgroundPosition,
            bgSize: getComputedStyle(node).backgroundSize,
            inlineSize: getComputedStyle(node).inlineSize,
            blockSize: getComputedStyle(node).blockSize,
            filter: getComputedStyle(node).filter,
            color: getComputedStyle(node).color,
        }))"""
    )
    expected = [
        {"source": "ᄀ", "sprite": "ㄱ", "kind": "consonant", "index": "0", "pos": "ttl"},
        {"source": "ᅩ", "sprite": "ㅗ", "kind": "vowel", "index": "8", "pos": "mtl"},
        {"source": "ᅡ", "sprite": "ㅏ", "kind": "vowel", "index": "0", "pos": "ttr"},
        {"source": "ᆼ", "sprite": "ㅇ", "kind": "consonant", "index": "11", "pos": "bbrs"},
    ]
    compact = [
        {key: item[key] for key in ("source", "sprite", "kind", "index", "pos")}
        for item in sprite_jamo
    ]
    if compact != expected:
        raise AssertionError(f"{label}: 광 sprite jamo mapping mismatch {compact!r}")
    # 시트 경로는 폰트 파일 기준으로 풀려야 하고(코어가 --fy-sprite-url을 <url>로
    # 등록), 실제로 로드돼야 한다. 부분 문자열 검사는 a00d624의 404
    # (/sprite-example.png, font-kku.css 기준으로 풀림)를 통과시켰다.
    sheets = page.evaluate(
        """async () => {
            const hosts = ['sprite-example', 'sprite-system'].map((font) =>
              document.querySelector(`font-kku[font="${font}"][data-fy-upgraded="true"]`));
            return Promise.all(hosts.map(async (host) => {
              const node = host && host.querySelector('[data-sprite-jamo-kind="consonant"]');
              // 칸 문서로 칠한 노드(data-fy-sprite-cell)의 그림은 칸 Blob이다 — 자소판 주소는 --fy-sprite-url에서 읽는다
              const bg = !node ? '' : node.hasAttribute('data-fy-sprite-cell') ?
                getComputedStyle(node).getPropertyValue('--fy-sprite-url').trim() : getComputedStyle(node).backgroundImage;
              const match = bg.match(/^url\\("([^"]+)"\\)$/);
              const width = match ? await new Promise((resolve) => {
                const image = new Image();
                image.onload = () => resolve(image.naturalWidth);
                image.onerror = () => resolve(0);
                image.src = match[1];
              }) : 0;
              return { font: host && host.getAttribute('font'), url: match ? match[1] : bg, width };
            }));
        }"""
    )
    for sheet_info, name in zip(sheets, ("sprite-example", "sprite-system")):
        if not sheet_info["url"].endswith(f"/profiles/{name}.svg") or sheet_info["width"] <= 0:
            raise AssertionError(f"{label}: {name} sheet must resolve next to the font and load {sheet_info!r}")
    # 칸 문서 노드는 칸마다 다른 Blob 그림을 0 0에 둔다 — 자소판 한 장과 자리 규칙 검사는 자소판 전체로 칠할 때만 뜻이 있다.
    cells = all(item["cell"] is not None for item in sprite_jamo)
    if cells and any(not item["bg"].startswith('url("blob:') for item in sprite_jamo):
        raise AssertionError(f"{label}: sprite cell nodes must paint their cell image {sprite_jamo!r}")
    if not cells and any(item["bg"] != sprite_jamo[0]["bg"] for item in sprite_jamo):
        raise AssertionError(f"{label}: sprite jamo background image drifted between nodes {sprite_jamo!r}")
    # kind별 position 규칙이 base 규칙을 실제로 이기는지 — base 선택자의 특이도가
    # 오르면(:not() 미포장 사고) 전 노드가 0 0(ㄱ 칸)으로 붕괴하는데 DOM 속성
    # 검사는 그걸 못 본다. 광의 ㅗ(vowel row)는 y가 반드시 음수여야 한다.
    vowel_bg = [item["bgPos"] for item in sprite_jamo if item["kind"] == "vowel"]
    if not cells and any(not pos or "-" not in pos.split(" ")[-1] for pos in vowel_bg):
        raise AssertionError(
            f"{label}: vowel row background-position lost to base rule {vowel_bg!r}"
        )
    if any(item["color"] != "rgba(0, 0, 0, 0)" for item in sprite_jamo):
        raise AssertionError(f"{label}: sprite jamo text color not transparent {sprite_jamo!r}")
    if any(item["inlineSize"] == "auto" or item["blockSize"] == "auto" for item in sprite_jamo):
        raise AssertionError(f"{label}: sprite jamo should use fixed bitmap boxes {sprite_jamo!r}")
    if any(item["filter"] == "none" for item in sprite_jamo):
        raise AssertionError(f"{label}: sprite example should boost antialias edges {sprite_jamo!r}")
    sprite_profile = page.locator("font-kku[font='sprite-example']").first.evaluate(
        """(node) => ({
            zoom: getComputedStyle(node).getPropertyValue('--fy-sprite-zoom').trim(),
            cropX: getComputedStyle(node).getPropertyValue('--fy-sprite-crop-x').trim(),
            cropY: getComputedStyle(node).getPropertyValue('--fy-sprite-crop-y').trim(),
            dilate: getComputedStyle(node).getPropertyValue('--fy-sprite-dilate').trim(),
            pageFilter: getComputedStyle(node).getPropertyValue('--fy-sprite-filter').trim(),
        })"""
    )
    # edge 보강은 폰트 레벨 획 보정(--fy-sprite-dilate)이고, --fy-sprite-filter는
    # 페이지 전용이라 폰트가 비워 둔다.
    if sprite_profile != {
        "zoom": "1.35",
        "cropX": "-0.175em",
        "cropY": "-0.175em",
        "dilate": "drop-shadow(0 0 0 #17130d)",
        "pageFilter": "",
    }:
        raise AssertionError(f"{label}: sprite example crop profile mismatch {sprite_profile!r}")
    # 페이지 override는 폰트의 획 보정을 이긴다(페이지 전용 변수).
    override = page.locator("font-kku[font='sprite-example']").first.evaluate(
        """(host) => {
            const node = host.querySelector('[data-sprite-jamo-kind="consonant"]');
            host.style.setProperty('--fy-sprite-filter', 'none');
            const filter = getComputedStyle(node).filter;
            host.style.removeProperty('--fy-sprite-filter');
            return filter;
        }"""
    )
    if override != "none":
        raise AssertionError(f"{label}: page --fy-sprite-filter must beat the font's dilate, got {override!r}")
    if page.locator(".sprite-small-grid font-kku[font='sprite-example']").count() != 4:
        raise AssertionError(f"{label}: sprite small size matrix missing")


def assert_faces_page(page, url: str, label: str) -> None:
    """재료와 깊이(ADR-024) 개발 도구: 세 재료가 각자 찍히고, 깊이 사다리는 얕을수록 그림 종류가 줄며, 자모 해석이 원리대로
    조립한다(원형 8에서 ㅎ = ㆍ + ㅡ + ㅇ 그림, ㄹ = ㅡ·ㅣ 다섯 — 기본 조립식, 원소 3에서는 원소 그림만). 원소 재료는 기본 조립식을
    쓰지 않는다(ㄹ·ㅎ은 획 셋 그대로)."""
    page.goto(url.replace("index.html", "faces.html"), wait_until="load")
    assert_shared_demo_chrome(page, label, "faces", "basic-text")
    page.wait_for_function(
        """() => [...document.querySelectorAll('[data-faces-rows] font-kku[data-faces-set]')].length > 0 &&
            [...document.querySelectorAll('[data-faces-rows] font-kku[data-faces-set]')].every((host) => host.dataset.fyFace === 'svg')""",
        timeout=15000,
    )
    faces = page.evaluate(
        "() => [...document.querySelectorAll('[data-faces-rows=\"face\"] font-kku')].map((host) => host.dataset.fyFace)"
    )
    if faces != ["device", "element", "svg"]:
        raise AssertionError(f"{label}: faces page should show device, element and svg, got {faces!r}")
    kinds = page.evaluate(
        """() => [...document.querySelectorAll('[data-faces-rows="depth"] font-kku[data-faces-set]')].map((host) =>
            new Set([...host.querySelectorAll('[data-hoek-drawing], [data-element-drawing]')]
              .map((node) => node.dataset.hoekDrawing || node.dataset.elementDrawing)).size)"""
    )
    if len(kinds) != 4 or kinds != sorted(kinds, reverse=True) or kinds[-1] > 3 or kinds[0] <= kinds[-1]:
        raise AssertionError(f"{label}: drawing kinds should shrink with depth (extended → element), got {kinds!r}")
    page.fill("[data-faces-syllable-form] input[name='syllable']", "호ㄹ")
    page.wait_for_function(
        """() => { const hosts = document.querySelectorAll('[data-faces-rows="jamo"] font-kku');
            const host = hosts[2];
            return host && host.dataset.fyFace === 'svg' && host.querySelector('[part~="glyph"]')?.dataset.source === '호' &&
              host.querySelector('[data-fy-standalone="ㄹ"] [data-hoek-drawing]') !== null &&
              hosts[4] && hosts[4].dataset.fyFace === 'element' && hosts[4].querySelector('[data-fy-standalone="ㄹ"] [part="hoek"]') !== null; }""",
        timeout=15000,
    )
    # 자모 노드(낱자 포함)마다 획 묶음의 그림 키 — 문맥(@cho·@bar·@jong)은 떼고, 그림이 없으면 원소 그림·CSS 상자
    hoeks = """(index) => [...document.querySelectorAll('[data-faces-rows="jamo"] font-kku')[index]
            .querySelectorAll('[part~="jamo"], [data-fy-standalone]')].map((node) => [node.dataset.fyStandalone || node.dataset.jamo,
              [...node.querySelectorAll(':scope > [part="hoek"]')].map((hoek) => (hoek.dataset.hoekDrawing || [...hoek.querySelectorAll('[part="element"]')]
                .map((element) => element.dataset.elementDrawing || 'css').join('.')).replace(/@(cho|bar|jong)$/, ''))])"""
    origin = page.evaluate(hoeks, 2)
    if not origin or origin[0][1] != ["ㆍ", "ㅡ", "ㅇ"]:
        raise AssertionError(f"{label}: at origin depth ㅎ should be ㆍ + ㅡ + ㅇ drawings (hieut-added-lines), got {origin!r}")
    rieul = [hoek for jamo, hoek in origin if jamo == "ㄹ"]
    if rieul != [["ㅡ", "ㅣ", "ㅡ", "ㅣ", "ㅡ"]]:
        raise AssertionError(f"{label}: at origin depth ㄹ should be five ㅡ·ㅣ lines (rieul-lines), got {origin!r}")
    # 원소 재료(그릴 재료 없음)는 기본 place 조립식을 쓰지 않는다 — ㅎ·ㄹ은 획 셋, 그림 없음, data-hoek 1·2·3
    element = page.evaluate(
        """() => [...document.querySelectorAll('[data-faces-rows="jamo"] font-kku')[4]
            .querySelectorAll('[part~="jamo"], [data-fy-standalone]')].map((node) => [node.dataset.fyStandalone || node.dataset.jamo,
              [...node.querySelectorAll(':scope > [part="hoek"]')].map((hoek) => hoek.dataset.hoekDrawing || hoek.dataset.hoek || '')])"""
    )
    gated = {jamo: hoek for jamo, hoek in element if jamo in ("ᄒ", "ㄹ")}
    if gated != {"ᄒ": ["1", "2", "3"], "ㄹ": ["1", "2", "3"]}:
        raise AssertionError(f"{label}: the element face should keep ㅎ and ㄹ as three plain strokes (no default place recipe), got {element!r}")
    assert_origin8_strokes(page, label)


def origin8_cells(set_name: str) -> list:
    """출하 그림 세트에서 원형 8(ㄱㄴㅁㅅㅇㆍㅡㅣ, 문맥 변형 포함)만 남기고 원소 그림(@line·@dot·@ring)을 뺀 [칸, 옵션] —
    원형 8만 그린 사용자 세트의 대역."""
    text = (ROOT_DIR / "lib" / "profiles" / f"{set_name}.jamo.js").read_text(encoding="utf-8")
    entry = json.loads(text[text.index(".push(") + len(".push("):text.rindex(")")])
    cells = {key: value for key, value in entry[1].items() if key[0] in "ㄱㄴㅁㅅㅇㆍㅡㅣ"}
    return [cells, entry[2]]


def assert_origin8_strokes(page, label: str) -> None:
    """원소 그림이 없는 원형 8 세트(ADR-025 §7): 그림이 맡지 않은 획(ㅋ·ㅌ·ㅊ의 가획, ㅏ·ㅗ·ㅛ의 짧은 획)도 그 세트의 원형 그림
    — 선은 ㅡ, 점은 ㆍ(마디마다 돌려 놓는다). CSS 상자가 남지 않는다."""
    page.evaluate(
        """([cells, options]) => {
            FontKku.registerJamo('smoke-origin8', cells, options);
            const host = document.createElement('font-kku');
            host.id = 'faces-origin8-user';
            host.setAttribute('font', 'gothic');
            host.setAttribute('size', '48');
            host.setAttribute('jamo-set', 'smoke-origin8');
            host.textContent = '카타차와요홑ㅋㅊ';
            document.body.append(host);
        }""",
        origin8_cells("pilgi-box"),
    )
    page.wait_for_function(
        """() => { const host = document.getElementById('faces-origin8-user');
            return host && host.dataset.fyFace === 'svg' && host.querySelectorAll('[data-fy-standalone] [part="hoek"]').length > 0; }""",
        timeout=15000,
    )
    state = page.evaluate(
        """() => { const host = document.getElementById('faces-origin8-user');
            const strokes = [...host.querySelectorAll('[part="element"]:not([data-element="box"])')];
            return { css: strokes.filter((span) => !span.dataset.elementDrawing).length,
              keys: [...new Set(strokes.map((span) => span.dataset.elementDrawing || 'css'))].sort(),
              turned: strokes.filter((span) => span.dataset.elementDrawing === 'ㆍ' &&
                Math.abs(Math.abs(parseFloat(span.style.getPropertyValue('--fy-el-angle'))) - 90) < 1).length }; }"""
    )
    if state["css"] or state["keys"] != ["ㅡ", "ㆍ"] or not state["turned"]:
        raise AssertionError(
            f"{label}: an origin-8 set without @line/@dot/@ring should draw leftover strokes with its own ㅡ and ㆍ "
            f"(ㆍ turned upright for ㅗ·ㅛ), no CSS boxes — got {state!r}")


SYSTEM_HANGUL_AUDIT = """() => {
  const HANGUL = /[\\u1100-\\u11FF\\u3130-\\u318F\\uA960-\\uA97F\\uAC00-\\uD7AF\\uD7B0-\\uD7FF]/u;
  const offenders = [];
  let painted = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!HANGUL.test(node.data)) continue;
    const el = node.parentElement;
    if (!el || el.closest('script, style, textarea, input, [part="sr-source"]')) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const style = getComputedStyle(el);
    const sprite = el.matches('[data-sprite-jamo-kind]') &&
      style.color === 'rgba(0, 0, 0, 0)' &&
      style.webkitTextFillColor === 'rgba(0, 0, 0, 0)' &&
      style.textShadow === 'none' &&
      /url\\(/.test(style.backgroundImage);
    if (sprite) {
      painted += 1;
    } else {
      offenders.push({ text: node.data.slice(0, 24), tag: el.tagName, part: el.getAttribute('part'), cls: String(el.className) });
    }
  }
  return { painted, offenders: offenders.slice(0, 12), total: offenders.length };
}"""


def assert_no_system_hangul(page, label: str, where: str) -> None:
    """글꼴 없는 모드 화면: 한글은 모두 그림 자소로만 칠해진다. 그림 자소로 바뀌기를 최대 5초 기다린다(고정 sleep 대신)."""
    audit = poll(page, SYSTEM_HANGUL_AUDIT, lambda value: not value["total"] and value["painted"] >= 10, timeout=5)
    if audit["total"] or audit["painted"] < 10:
        raise AssertionError(f"{label}: {where} paints Hangul with a system font {audit!r}")


def assert_app_chrome(page, label: str, where: str) -> None:
    """웹 앱 공통: 메뉴 6개(사례가 현재), 폰꾸 요소 CSS 도착, 1280/390/360 가로 넘침 없음."""
    page.wait_for_function(
        """() => {
          const hosts = [...document.querySelectorAll('font-kku, .font-kku')];
          return hosts.length > 0 && hosts.every((host) => FontKku.fontInfo(host)?.loaded);
        }""",
        timeout=15000,
    )
    nav = page.evaluate(
        """() => ({
          nav: [...document.querySelectorAll('[data-demo-nav] [data-demo-nav-link]')].map((a) => a.dataset.demoNavLink),
          current: document.querySelector('[data-demo-nav] [aria-current="page"]')?.dataset.demoNavLink,
        })"""
    )
    if nav["nav"] != PUBLIC_NAV or nav["current"] != "showcase":
        raise AssertionError(f"{label}: {where} menu should stay at 6 with 사례 current, got {nav!r}")
    for width in (1280, 390, 360):
        page.set_viewport_size({"width": width, "height": 860})
        overflow = poll(page, "() => document.documentElement.scrollWidth - innerWidth", lambda value: value <= 0, timeout=5)
        if overflow > 0:
            raise AssertionError(f"{label}: {where} overflows horizontally by {overflow}px at {width}px")
    page.set_viewport_size({"width": 1280, "height": 860})


def collect_page_errors(page) -> tuple[list, callable]:
    errors: list[str] = []

    def on_console(message) -> None:
        if message.type == "error":
            errors.append(message.text)

    def on_error(error) -> None:
        errors.append(str(error))

    page.on("console", on_console)
    page.on("pageerror", on_error)

    def stop() -> None:
        page.remove_listener("console", on_console)
        page.remove_listener("pageerror", on_error)

    return errors, stop


def sprite_painted(page, selector: str) -> dict:
    """선택한 바탕 요소의 자소·낱자 노드가 자소판으로만 칠해지는지, 자소판이 실제로 뜨는지."""
    return page.evaluate(
        """async (selector) => {
          const hosts = [...document.querySelectorAll(selector)];
          const nodes = hosts.flatMap((host) => [...host.querySelectorAll('[data-sprite-jamo-kind]')]);
          const bad = nodes.filter((node) => {
            const style = getComputedStyle(node);
            return style.color !== 'rgba(0, 0, 0, 0)' || !/url\\(/.test(style.backgroundImage);
          }).map((node) => node.textContent);
          const jamo = hosts.flatMap((host) => [...host.querySelectorAll('[part~="jamo"]')]);
          const unpainted = jamo.filter((node) => !node.matches('[data-sprite-jamo-kind]')).map((node) => node.textContent);
          let sheet = null;
          if (nodes.length) {
            const url = /url\\("?([^")]+)"?\\)/.exec(getComputedStyle(nodes[0]).backgroundImage)[1];
            sheet = await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img.naturalWidth > 0);
              img.onerror = () => resolve(false);
              img.src = url;
            });
          }
          return { nodes: nodes.length, bad, unpainted, sheet };
        }""",
        selector,
    )


def assert_sign_app(page, url: str, label: str) -> None:
    """전광판: 영문 키로 두벌식·세벌식 조합, 그림 자소로 그린 전광판, 움직임·주소 상태·전체 화면,
    글꼴 없는 모드, 화면 폭."""
    errors, stop = collect_page_errors(page)
    sign_url = url.replace("index.html", "sign.html")
    page.goto(sign_url, wait_until="load")
    assert_app_chrome(page, label, "sign.html")

    # 두벌식: 영문 키 → 유니코드 한글 → 전광판
    page.evaluate("() => { FontKkuSign.editor.setValue(''); FontKkuSign.editor.focus(); }")
    page.keyboard.type("dkssudgktpdy")
    page.wait_for_function("() => document.querySelector('[data-sign-text]').dataset.source === '안녕하세요'")
    composing = page.evaluate("() => FontKkuSign.editor.ime.state().composing")
    if composing != {"start": 4, "end": 5, "text": "요"}:
        raise AssertionError(f"{label}: sign editor should still be composing 요, got {composing!r}")
    if page.locator("[data-sign-editor] .kk-compose").count() < 1:
        raise AssertionError(f"{label}: the composing syllable is not highlighted in the sign editor")
    page.keyboard.press("Backspace")
    if page.evaluate("() => FontKkuSign.editor.getValue()") != "안녕하세ㅇ":
        raise AssertionError(f"{label}: backspace should remove one jamo of the composing syllable")
    page.keyboard.type("y")

    # 세벌식 최종으로 바꿔 이어 치기 — 초성·중성·종성 키가 따로다
    page.click("[data-layouts] [data-layout='sebeol-final']")
    page.evaluate("() => FontKkuSign.editor.focus()")
    page.keyboard.type(" jfs")
    page.wait_for_function("() => document.querySelector('[data-sign-text]').dataset.source === '안녕하세요 안'")
    # Shift+Space: 한/영 — 영문은 그대로 들어간다
    page.keyboard.press("Shift+Space")
    page.keyboard.type(" OK")
    page.keyboard.press("Shift+Space")
    state = page.evaluate("() => ({ value: FontKkuSign.editor.getValue(), mode: FontKkuSign.editor.ime.getMode() })")
    if state != {"value": "안녕하세요 안 OK", "mode": "hangul"}:
        raise AssertionError(f"{label}: 한/영 toggle mismatch {state!r}")

    painted = sprite_painted(page, "[data-sign-text], [data-sign-editor] font-kku")
    if not painted["nodes"] or painted["bad"] or painted["unpainted"] or painted["sheet"] is not True:
        raise AssertionError(f"{label}: sign Hangul must be painted from the sprite sheet {painted!r}")

    # 움직임: 흐르기는 애니메이션, 깜빡이기·멈춤은 줄바꿈 가능한 가운데 정렬
    if page.evaluate("() => FontKkuSign.animation()?.playState") != "running":
        raise AssertionError(f"{label}: scroll mode should run an animation")
    page.click("[data-modes] [data-mode='blink']")
    page.wait_for_function("() => document.querySelector('[data-sign]').dataset.mode === 'blink' && !FontKkuSign.animation()")
    page.click("[data-modes] [data-mode='static']")
    page.click("[data-font-choices] [data-font='dojang']")
    page.wait_for_function("() => document.querySelector('[data-sign-text]').dataset.fyFont === 'dojang'")
    page.wait_for_function("() => location.hash.includes('f=dojang') && location.hash.includes('m=static')")
    shared = page.evaluate("() => decodeURIComponent(location.hash)")
    if "t=안녕하세요+안+OK" not in shared:
        raise AssertionError(f"{label}: the address should carry the sign text, got {shared!r}")

    # 주소로 연 전광판은 같은 상태
    page.goto(sign_url + "#t=%ED%95%9C%EA%B8%80%EB%82%A0&f=chalk&m=static&s=7&z=72&c=30d158&d=off&k=390", wait_until="load")
    page.wait_for_function("() => document.querySelector('[data-sign-text]')?.dataset.source === '한글날'")
    restored = page.evaluate(
        """() => ({
          font: document.querySelector('[data-sign-text]').getAttribute('font'),
          mode: document.querySelector('[data-sign]').dataset.mode,
          dots: document.querySelector('[data-sign]').dataset.dots,
          led: document.querySelector('[data-sign]').style.getPropertyValue('--led'),
          size: getComputedStyle(document.querySelector('[data-sign-text]')).fontSize,
          layout: FontKkuSign.editor.ime.getLayout(),
          editor: FontKkuSign.editor.getValue(),
        })"""
    )
    expected = {"font": "chalk", "mode": "static", "dots": "off", "led": "#30d158", "size": "72px",
                "layout": "sebeol-390", "editor": "한글날"}
    if restored != expected:
        raise AssertionError(f"{label}: sign state from the address mismatch {restored!r}")

    # 화면 자판: 누르면 같은 입력기로 들어간다
    page.click("[data-keyboard-toggle]")
    page.evaluate("() => FontKkuSign.editor.setValue('')")
    for key in ("k", "f", "s"):
        page.click(f"[data-keyboard] .kk-key[data-key='{key}']")
    typed = page.evaluate("() => [FontKkuSign.editor.getValue(), FontKkuSign.editor.ime.getLayout()]")
    if typed != ["간", "sebeol-390"]:
        raise AssertionError(f"{label}: on-screen keys did not compose 간 in 세벌식 390, got {typed!r}")

    # 전체 화면(실제 전체 화면이 거절되면 화면 채우기)
    page.click(".app-actions [data-sign-fullscreen]")
    page.wait_for_function(
        "() => document.fullscreenElement === document.querySelector('[data-sign]') ||"
        " document.querySelector('[data-sign]').classList.contains('is-pseudo-fullscreen')"
    )
    page.keyboard.press("Escape")
    page.evaluate("() => document.fullscreenElement && document.exitFullscreen()")

    # 글꼴 없는 모드
    page.goto(sign_url.split("#")[0] + "?hangul-font=none", wait_until="load")
    page.wait_for_function("() => document.documentElement.dataset.hangulFont === 'none'")
    assert_app_chrome(page, label, "sign.html?hangul-font=none")
    chrome = page.evaluate(
        "() => [document.title, document.querySelector('[data-demo-nav-link=\"showcase\"]').textContent,"
        " document.querySelector('#sign-title').dataset.fyFont]"
    )
    if chrome != ["LED sign — font-kku", "Cases", "pixel"]:
        raise AssertionError(f"{label}: no-font mode should switch the chrome to English and sprite fonts {chrome!r}")
    assert_no_system_hangul(page, label, "sign.html?hangul-font=none")
    stop()
    if errors:
        raise AssertionError(f"{label}: sign.html logged errors {errors!r}")


def assert_memo_app(page, url: str, label: str) -> None:
    """메모장: 숨은 입력 칸 + 폰꾸로 그린 편집면(캐럿·조합·선택), 줄 이동, 되돌리기, 화면 자판,
    저장·복원, 글꼴 없는 모드, 화면 폭."""
    errors, stop = collect_page_errors(page)
    memo_url = url.replace("index.html", "memo.html")
    page.goto(memo_url, wait_until="load")
    page.evaluate("() => localStorage.removeItem('font-kku-memo')")
    page.goto(memo_url, wait_until="load")
    assert_app_chrome(page, label, "memo.html")

    page.evaluate("() => { FontKkuMemo.editor.setValue(''); FontKkuMemo.editor.focus(); }")
    page.keyboard.type("dkssud")
    page.keyboard.press("Enter")
    page.keyboard.type("rkqtdl")
    view = page.evaluate(
        """() => ({
          value: FontKkuMemo.editor.getValue(),
          lines: FontKkuMemo.editor.lines().map((host) => host.dataset.source),
          composing: FontKkuMemo.editor.ime.state().composing,
          highlight: document.querySelectorAll('[data-memo-paper] .kk-compose').length,
          caret: getComputedStyle(document.querySelector('[data-memo-paper] .kk-caret')).opacity,
          focused: document.activeElement === FontKkuMemo.editor.field,
        })"""
    )
    if view != {"value": "안녕\n값이", "lines": ["안녕", "값이"], "composing": {"start": 4, "end": 5, "text": "이"},
                "highlight": 1, "caret": "1", "focused": True}:
        raise AssertionError(f"{label}: memo composing view mismatch {view!r}")
    page.keyboard.press("Backspace")
    if page.evaluate("() => FontKkuMemo.editor.getValue()") != "안녕\n값ㅇ":
        raise AssertionError(f"{label}: memo backspace should remove one jamo")
    page.keyboard.type("l")

    # 위 화살표는 폰꾸가 그린 줄을 따라 올라간다 — 캐럿이 첫 줄로
    page.keyboard.press("ArrowUp")
    caret = page.evaluate("() => [FontKkuMemo.editor.field.selectionStart, FontKkuMemo.editor.field.selectionEnd]")
    if caret[0] != caret[1] or caret[0] > 2:
        raise AssertionError(f"{label}: ArrowUp should move the caret onto the first line, got {caret!r}")
    page.keyboard.press("End")
    page.keyboard.press("Shift+Home")
    selection = page.evaluate(
        "() => [FontKkuMemo.editor.field.selectionStart, FontKkuMemo.editor.field.selectionEnd,"
        " document.querySelectorAll('[data-memo-paper] .kk-sel').length]"
    )
    if selection[:2] != [0, 2] or selection[2] < 1:
        raise AssertionError(f"{label}: Shift+Home should select the first line and paint it, got {selection!r}")

    # 화면 자판: 두벌식 키와 Shift
    page.evaluate("() => { const f = FontKkuMemo.editor.field; f.setSelectionRange(f.value.length, f.value.length); }")
    page.click("[data-keyboard] .kk-key[data-action='space']")
    page.click("[data-keyboard] .kk-key[data-key='r']")
    page.click("[data-keyboard] .kk-key[data-key='k']")
    page.click("[data-keyboard] .kk-key[data-action='shift']")
    page.click("[data-keyboard] .kk-key[data-key='R']")
    page.click("[data-keyboard] .kk-key[data-key='k']")
    value = page.evaluate("() => FontKkuMemo.editor.getValue()")
    if value != "안녕\n값이 가까":
        raise AssertionError(f"{label}: on-screen keys should type 가까, got {value!r}")
    keycap = page.evaluate(
        """() => {
          const key = document.querySelector('[data-keyboard] .kk-key[data-key="r"]');
          const glyph = key.querySelector('font-kku');
          return { role: key.dataset.role, text: glyph.dataset.source, sprite: glyph.querySelector('[part="content"]')?.dataset.spriteJamo };
        }"""
    )
    if keycap != {"role": "cho", "text": "ㄱ", "sprite": "ㄱ"}:
        raise AssertionError(f"{label}: the r key should show ㄱ drawn from the sprite sheet {keycap!r}")

    # 되돌리기
    page.evaluate("() => FontKkuMemo.editor.focus()")
    page.keyboard.press("Control+z")
    if page.evaluate("() => FontKkuMemo.editor.getValue()") == "안녕\n값이 가까":
        raise AssertionError(f"{label}: Ctrl+Z did not undo")
    page.keyboard.press("Control+Shift+z")
    if page.evaluate("() => FontKkuMemo.editor.getValue()") != "안녕\n값이 가까":
        raise AssertionError(f"{label}: Ctrl+Shift+Z did not redo")

    painted = sprite_painted(page, "[data-memo-paper] font-kku, [data-keyboard] font-kku")
    if not painted["nodes"] or painted["bad"] or painted["unpainted"] or painted["sheet"] is not True:
        raise AssertionError(f"{label}: memo Hangul must be painted from the sprite sheet {painted!r}")

    # 저장·복원
    page.wait_for_function("() => JSON.parse(localStorage.getItem('font-kku-memo') || '{}').text === '안녕\\n값이 가까'")
    page.click("[data-font-choices] [data-font='chalk']")
    page.wait_for_function("() => document.querySelector('[data-memo-paper]').dataset.tone === 'board'")
    # 저장은 400ms 늦춰 쓴다 — 시간 대신 저장된 글꼴을 기다린다
    page.wait_for_function("() => JSON.parse(localStorage.getItem('font-kku-memo') || '{}').font === 'chalk'")
    page.goto(memo_url, wait_until="load")
    page.wait_for_function("() => window.FontKkuMemo && FontKkuMemo.editor.getValue() === '안녕\\n값이 가까'")
    if page.evaluate("() => FontKkuMemo.editor.lines()[0].dataset.fyFont") != "chalk":
        raise AssertionError(f"{label}: the memo font was not restored")

    # 글꼴 없는 모드
    page.goto(memo_url + "?hangul-font=none", wait_until="load")
    page.wait_for_function("() => document.documentElement.dataset.hangulFont === 'none'")
    assert_app_chrome(page, label, "memo.html?hangul-font=none")
    assert_no_system_hangul(page, label, "memo.html?hangul-font=none")
    page.evaluate("() => localStorage.removeItem('font-kku-memo')")
    stop()
    if errors:
        raise AssertionError(f"{label}: memo.html logged errors {errors!r}")



def studio_content(page):
    page.wait_for_selector('[data-studio-host] iframe')
    frame = page.locator('[data-studio-host] iframe').element_handle().content_frame()
    frame.wait_for_function("() => window.FontStudio && FontStudio.ready()", timeout=20000)
    frame.evaluate("() => FontStudio.settled()")
    return frame


def assert_studio_page_shell(page, url: str, label: str) -> None:
    page.goto(studio_url(url, ""), wait_until="load")
    chrome = page.evaluate("""() => ({
      nav: [...document.querySelectorAll('.demo-nav [data-demo-nav-link]')].map((a) => a.dataset.demoNavLink),
      current: document.querySelector('.demo-nav [aria-current="page"]')?.dataset.demoNavLink,
      context: Boolean(document.querySelector('[data-demo-context]')),
      entry: document.querySelector('.demo-nav [data-demo-nav-link="font-studio"]').getAttribute('href'),
    })""")
    if chrome != {"nav": PUBLIC_NAV, "current": "font-studio", "context": False, "entry": "./font-studio.html"}:
        raise AssertionError(f"{label}: 작업실 should be the current public menu item without a dev header {chrome!r}")
    frame = studio_content(page)
    if not frame.url.split('?')[0].endswith('/lib/studio/index.html'):
        raise AssertionError(f"{label}: 작업실 should use the installed library component {frame.url!r}")
    page.wait_for_selector('[data-studio-load-status]', state="hidden")
    geometry = page.locator('[data-studio-host] iframe').evaluate(
        "(node) => ({ bottom: node.getBoundingClientRect().bottom, viewport: innerHeight })")
    if abs(geometry["bottom"] - geometry["viewport"]) > 2:
        raise AssertionError(f"{label}: the studio should fill the space below the site header {geometry!r}")
    boundary_glyph = "document.querySelector('[data-studio-preview-root]').shadowRoot.querySelector('[part=\"glyph\"]')"
    page.check('[data-demo-boundary-toggle]')
    frame.wait_for_function("() => getComputedStyle(" + boundary_glyph + ").outlineStyle === 'solid'")
    page.reload(wait_until="load")
    frame = studio_content(page)
    if not page.is_checked('[data-demo-boundary-toggle]'):
        raise AssertionError(f"{label}: the site should restore its saved boundary toggle")
    frame.wait_for_function("() => getComputedStyle(" + boundary_glyph + ").outlineStyle === 'solid'")
    page.uncheck('[data-demo-boundary-toggle]')
    frame.wait_for_function("() => getComputedStyle(" + boundary_glyph + ").outlineStyle === 'none'")
    page.goto(studio_url(url, "?font=sprite-example#studio-material"), wait_until="load")
    frame = studio_content(page)
    frame.wait_for_function("() => FontStudio.material.state.editable")
    state = frame.evaluate("""() => ({
      inView: (() => { const top = document.getElementById('studio-material').getBoundingClientRect().top;
        return top >= 0 && top < innerHeight / 2; })(),
      font: FontStudio.state.fontId,
    })""")
    if state != {"inView": True, "font": "sprite-example"}:
        raise AssertionError(f"{label}: #studio-material should reach the component through the wrapper {state!r}")
    # ?page= · ?mode= reach the component as mount options; an unknown value is dropped instead of failing the mount
    page.goto(studio_url(url, "?page=review&mode=precise"), wait_until="load")
    frame = studio_content(page)
    opened = frame.evaluate("""() => { const root = document.querySelector('[data-studio]');
      return { page: root.dataset.page, mode: root.dataset.studioMode }; }""")
    if opened != {"page": "review", "mode": "precise"}:
        raise AssertionError(f"{label}: ?page=review&mode=precise should open that studio page and view {opened!r}")
    page.goto(studio_url(url, "?page=nowhere&mode=loud"), wait_until="load")
    frame = studio_content(page)
    if frame.evaluate("() => document.querySelector('[data-studio]').dataset.page") != "design":
        raise AssertionError(f"{label}: an unknown ?page= should fall back to the design page")


def assert_animation_catalog(page, url: str, label: str) -> None:
    animation_url = url.replace("index.html", "animation-catalog.html")
    page.goto(animation_url, wait_until="load")
    page.wait_for_function(
        "() => document.querySelector('font-kku[animate=\"jamo-rise\"][data-fy-upgraded=\"true\"]') !== null"
    )

    jamo_cards = page.locator("[data-anim-scope='jamo']")
    if jamo_cards.count() != 7:
        raise AssertionError(f"{label}: expected 7 jamo animation cards, got {jamo_cards.count()}")

    # 자모 움직임 확장(font-kku-motion.css)은 같은 animate 속성으로 자모 노드를 움직인다
    addon = page.evaluate(
        """() => [...document.querySelectorAll("[data-anim-scope='addon'] font-kku")].map((host) => {
            const jamo = host.querySelector('[part~="jamo"]');
            return [host.getAttribute('animate'), jamo ? getComputedStyle(jamo).animationName : null];
        })"""
    )
    if [name for name, _ in addon] != ["assemble", "drop", "wave", "flicker", "cycle", "shine", "scroll-assemble"]:
        raise AssertionError(f"{label}: addon motion cards drifted {addon!r}")
    if any(not animation or animation == "none" for name, animation in addon if name not in ("drop", "flicker")):
        raise AssertionError(f"{label}: addon motions must animate jamo nodes {addon!r}")
    # data-kku-paused는 확장 움직임뿐 아니라 코어 글자 움직임(wiggle·bounce)도 세운다
    states = page.evaluate(
        """() => { document.body.setAttribute('data-kku-paused', '');
          const states = ['wiggle', 'bounce', 'wave'].map((name) => {
            const host = document.querySelector('font-kku[animate="' + name + '"]');
            const node = host.querySelector(name === 'wave' ? '[part~="jamo"]' : '[part="glyph"]');
            return getComputedStyle(node).animationPlayState; });
          document.body.removeAttribute('data-kku-paused');
          return states; }"""
    )
    if states != ["paused", "paused", "paused"]:
        raise AssertionError(f"{label}: data-kku-paused must pause core and addon motions {states!r}")

    jamo_rise = page.locator("font-kku[animate='jamo-rise']").first
    glyph_animation = jamo_rise.locator("[part='glyph']").first.evaluate(
        "(node) => getComputedStyle(node).animationName"
    )
    if glyph_animation != "none":
        raise AssertionError(f"{label}: jamo-rise should not animate glyph nodes directly")

    jamo_animation = jamo_rise.locator("[part~='jamo']").first.evaluate(
        "(node) => getComputedStyle(node).animationName"
    )
    if jamo_animation != "fy-jamo-rise":
        raise AssertionError(f"{label}: jamo-rise animation missing on jamo node: {jamo_animation!r}")

    role_host = page.locator("font-kku[animate='jamo-roles']").first
    role_animation_names = role_host.locator("[part~='jamo']").evaluate_all(
        "(nodes) => Array.from(new Set(nodes.map((node) => getComputedStyle(node).animationName)))"
    )
    expected_role_names = {"fy-jamo-choseong", "fy-jamo-jungseong", "fy-jamo-jongseong"}
    if not expected_role_names.issubset(set(role_animation_names)):
        raise AssertionError(
            f"{label}: jamo role animation names mismatch {role_animation_names!r}"
        )

    type_host = page.locator("font-kku[animate='jamo-type']").first
    type_animation = type_host.locator("[part~='jamo']").first.evaluate(
        "(node) => getComputedStyle(node).animationName"
    )
    if type_animation != "fy-jamo-type":
        raise AssertionError(f"{label}: jamo-type animation missing on jamo node: {type_animation!r}")

    type_orders = type_host.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-jamo-input-order'))"
    )
    expected_orders = [str(index) for index in range(len(type_orders))]
    if type_orders != expected_orders:
        raise AssertionError(f"{label}: jamo-type input order mismatch {type_orders!r}")

    page.locator("[data-anim='jamo-type'] .anim-replay").click()
    replay_orders = type_host.locator("[part~='jamo']").evaluate_all(
        "(nodes) => nodes.map((node) => node.getAttribute('data-jamo-input-order'))"
    )
    expected_replay_orders = [str(index) for index in range(len(replay_orders))]
    if replay_orders != expected_replay_orders:
        raise AssertionError(f"{label}: jamo-type replay order mismatch {replay_orders!r}")

    seed_jamo = page.locator("font-kku[animate='jamo-drift'] [part~='jamo']").first
    seed_animation = seed_jamo.evaluate("(node) => getComputedStyle(node).animationName")
    seed_value = seed_jamo.evaluate(
        "(node) => getComputedStyle(node).getPropertyValue('--fy-jamo-seed').trim()"
    )
    if seed_animation != "fy-seed-drift" or not seed_value:
        raise AssertionError(
            f"{label}: seeded jamo animation not initialized ({seed_animation!r}, {seed_value!r})"
        )
