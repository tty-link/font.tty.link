from __future__ import annotations

import ast
from collections.abc import Callable
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

import playwright_smoke
from playwright_smoke import (
    DEMO_FILE, assert_demo, assert_public_pages, assert_showcase_page, assert_fonts_themes,
    assert_landing_problems, assert_effects_page, assert_basic_page, assert_gothic_context_page,
    assert_api_studio, assert_studio_presets, assert_sprite_demo, assert_faces_page, assert_animation_catalog,
    assert_sign_app, assert_memo_app, assert_studio_page_shell, launch_browser, static_server,
)


@pytest.fixture(scope="session")
def playwright_driver():
    # 한 프로세스에서 Playwright는 한 번만 연다 — Chromium·Firefox 세션 브라우저가 함께 쓴다
    with sync_playwright() as playwright:
        yield playwright


@pytest.fixture(scope="session")
def browser(playwright_driver):
    instance = launch_browser(
        playwright_driver,
        headless=True,
        args=["--allow-file-access-from-files"],
    )
    playwright_smoke.throttle_browser(instance)
    yield instance
    instance.close()


def missing_engine(name: str) -> None:
    """엔진이 없으면 건너뛴다. FONT_KKU_REQUIRE_ENGINES=1(공개 층)이면 설치 안내와 함께 실패한다 — 건너뛴 엔진 검사가
    PASS 뒤에 숨지 않게."""
    hint = f"Playwright {name.capitalize()} is not installed (.venv/bin/python -m playwright install {name})"
    if playwright_smoke.require_engines():
        pytest.fail(hint + f"; {playwright_smoke.REQUIRE_ENGINES_ENV}=1 requires it", pytrace=False)
    pytest.skip(hint)


def test_missing_engine_policy(monkeypatch) -> None:
    """엔진이 없을 때: 기본은 건너뛰고, FONT_KKU_REQUIRE_ENGINES=1이면 설치 안내와 함께 실패한다. 브라우저 없이 돈다."""
    monkeypatch.delenv(playwright_smoke.REQUIRE_ENGINES_ENV, raising=False)
    with pytest.raises(pytest.skip.Exception, match="playwright install webkit"):
        missing_engine("webkit")
    monkeypatch.setenv(playwright_smoke.REQUIRE_ENGINES_ENV, "1")
    with pytest.raises(pytest.fail.Exception, match="playwright install firefox"):
        missing_engine("firefox")


@pytest.fixture(scope="session")
def firefox(playwright_driver):
    """Playwright Firefox가 설치돼 있을 때만(`.venv/bin/python -m playwright install firefox`). 없으면 건너뛴다 —
    기본 스모크는 Chromium이고 Firefox는 엔진 해석이 갈릴 수 있는 검사만 더 돈다."""
    if not Path(playwright_driver.firefox.executable_path).exists():
        missing_engine("firefox")
    instance = playwright_driver.firefox.launch(headless=True)
    yield instance
    instance.close()


@pytest.fixture(scope="session")
def webkit(playwright_driver):
    """Playwright WebKit이 설치돼 있을 때만(`.venv/bin/python -m playwright install webkit`). 없으면 건너뛴다."""
    if not Path(playwright_driver.webkit.executable_path).exists():
        missing_engine("webkit")
    instance = playwright_driver.webkit.launch(headless=True)
    yield instance
    instance.close()


@pytest.fixture(scope="session")
def server_url():
    with static_server() as url:
        yield url


# ── 모드(file·server) ────────────────────────────────────────────────────────
# 기본은 server 하나만 돈다. file:// 길이 따로 있는 검사(label·file: 분기가 든 assert_*)만 늘 두 모드를 돈다 —
# 나머지는 두 모드에서 같은 코드를 두 번 돌 뿐이었다. FONT_KKU_SMOKE_MODES=both(공개 층)면 모든 검사를 두 모드로.
# 시험 id는 그대로(server-…, 남긴 것은 file-…). FILE_DIFFERS는 test_smoke_registration_in_sync가 분기와 맞춰 본다.
BOTH_MODES = ("file", "server")
SMOKE_MODES = playwright_smoke.smoke_modes()
FILE_DIFFERS = frozenset({assert_demo, assert_public_pages, assert_showcase_page, assert_landing_problems})


def modes_for(*checks: Callable) -> tuple[str, ...]:
    return BOTH_MODES if any(check in FILE_DIFFERS for check in checks) else SMOKE_MODES


def over_modes(*checks: Callable):
    """smoke_target(주소, 모드)을 모드마다 매개변수로 — checks 가운데 file 길이 따로 있는 것이 있으면 늘 두 모드."""
    return pytest.mark.parametrize("smoke_target", modes_for(*checks), indirect=True)


def pytest_generate_tests(metafunc) -> None:
    """smoke_target을 쓰는데 모드를 직접 주지 않은 시험(새로 더한 것 포함)은 SMOKE_MODES로 돈다 — file 길이 따로 있으면
    over_modes(검사)를 단다."""
    if "smoke_target" not in metafunc.fixturenames:
        return
    for mark in metafunc.definition.iter_markers("parametrize"):
        names = mark.args[0]
        names = [name.strip() for name in names.split(",")] if isinstance(names, str) else list(names)
        if "smoke_target" in names:
            return
    metafunc.parametrize("smoke_target", SMOKE_MODES, indirect=True)


@pytest.fixture
def smoke_target(request):
    if request.param == "file":
        return DEMO_FILE.resolve().as_uri(), "file"
    return request.getfixturevalue("server_url"), "server"


@pytest.fixture
def page(browser):
    current = browser.new_page()
    yield current
    current.close()


def run_surface(page, smoke_target, check: Callable) -> None:
    url, label = smoke_target
    page.goto(url, wait_until="load")
    check(page, url, label)


def test_showcase_prompts_name_only_documented_api() -> None:
    """사례 목록(site/examples/index.json)의 요청 글은 AI가 설명서(skills/font-kku-use/)만 읽고 따라 하는 글이다 — 그 안의
    FontKku.* API와 --fy-* 변수 이름은 설명서에 있어야 한다(설명서에 없는 이름을 적으면 AI가 짐작해야 한다). 브라우저 없이 돈다."""
    import json
    import re

    root = playwright_smoke.ROOT_DIR
    skill = "\n".join(path.read_text(encoding="utf-8") for path in sorted((root / "lib" / "skill").glob("*.md")))
    data = json.loads((root / "examples" / "index.json").read_text(encoding="utf-8"))
    missing = []
    for item in data["examples"]:
        made = item.get("made") if isinstance(item.get("made"), dict) else {}
        for text in (item.get("prompt", ""), made.get("prompt", "")):
            for name in sorted(set(re.findall(r"FontKku\.\w+|--fy-[\w-]+", text, re.ASCII))):
                if name not in skill:
                    missing.append(f"{item['file']}: {name}")
    assert not missing, "prompts name APIs the AI guide does not document:\n" + "\n".join(missing)


REMIX_EDGE_JS = r"""
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const R = require(path.join(root, "showcase-remix.js"));
const set = { cells: { "ㄱ": { box: [0, 0, 100, 100], shapes: ["M0 0 L100 0"] } }, options: { frame: "box" }, width: "0.1em", label: "t" };
const RT = '<script src="../../font-kku.js" data-fonts="neon"></script>';
const failures = [];
function check(name, ok, info) { if (!ok) failures.push(name + ": " + JSON.stringify(info)); }
let src, r;
// 주석 속 런타임 태그는 건드리지 않고, 등록 코드는 진짜 런타임 태그 뒤에 선다
src = "<head><!-- " + RT + " -->\n" + RT + "\n</head><body><font-kku font=\"neon\">가</font-kku></body>";
r = R.remix(src, { set });
check("runtime in a comment", r.html.includes("<!-- " + RT + " -->") &&
  /-->\n<script src="[^"]+" data-fonts="sebul"><\/script>\n  <script>\n    \/\* t \*\/\n    FontKku\.registerJamo\("my-font"/.test(r.html), r.html);
// 속성 값 속 '>'는 태그 끝이 아니다
src = RT + '<h1 class="font-kku" data-font="neon" title="a > b">가</h1>';
r = R.remix(src, { set, seed: true });
check("'>' inside a value", r.html.includes('<h1 class="font-kku" data-font="sebul" data-jamo-set="my-font" title="a > b" data-seed="auto" data-jamo-seeds>'), r.html);
// 홑따옴표 class·data-font
src = RT + "<h1 class='font-kku' data-font='neon'>가</h1>";
r = R.remix(src, { set, fonts: ["neon"] });
check("single quotes", r.hosts === 1 && r.html.includes('<h1 class=\'font-kku\' data-font="sebul" data-jamo-set="my-font">'), r);
// 값 없는 seed는 있는 것으로 센다
src = RT + '<font-kku font="neon" seed>가</font-kku>';
r = R.remix(src, { set: null, seed: true });
check("bare seed", r.hosts === 1 && !r.html.includes('seed="auto"'), r);
// 글꼴 이름이 없는 바탕 요소는 "fixed" — jamo-set만 더해 세벌 고정 그대로, 칩으로 켜고 끈다
src = RT + '<font-kku size="40">가</font-kku><font-kku font="neon">나</font-kku>';
r = R.remix(src, { set, fonts: ["fixed"] });
check("fixed host gets jamo-set only", r.hosts === 1 && r.html.includes('<font-kku jamo-set="my-font" size="40">') &&
  r.html.includes('<font-kku font="neon">') && r.html.includes('data-fonts="sebul neon"'), r.html);
r = R.remix(src, { set, fonts: ["neon"] });
check("fixed chip off", r.hosts === 1 && r.html.includes('<font-kku size="40">'), r.html);
// 바꿀 곳이 없으면(씨앗을 켜도) 원문 그대로
r = R.remix(src, { set, seed: true, fonts: [] });
check("no host → source unchanged", r.hosts === 0 && r.html === src, r);
// 쓰지 않게 된 템플릿 자신의 세트 등록은 빠지고(그것만 든 <script>는 통째로), 아직 쓰거나 식 속이면 남는다
src = "<head>" + RT + '\n  <script>\n    /* mine */\n    if (window.FontKku) {\n      FontKku.registerJamo("pen", { "ㄱ": { box: [0,0,1,1], shapes: ["M0 0)"] } }, { frame: "box" });\n    }\n  </script>\n</head><h1 class="font-kku" data-jamo-set="pen">가</h1>';
r = R.remix(src, { set, fonts: ["fixed"] });
check("unused set dropped", !r.html.includes('"pen"') && !r.html.includes("/* mine */") && r.html.includes('<h1 class="font-kku" data-jamo-set="my-font">'), r.html);
r = R.remix(src + '<p class="font-kku" data-font="neon" data-jamo-set="pen">x</p>', { set, fonts: ["fixed"] });
check("set still used", r.html.includes('FontKku.registerJamo("pen"'), r.html);
src = "<head>" + RT + '<script>var ok = FontKku.registerJamo("pen", {});</script></head><h1 class="font-kku" data-jamo-set="pen">가</h1>';
check("call inside an expression", R.remix(src, { set }).html.includes('var ok = FontKku.registerJamo("pen", {});'), src);
// 사례 목록의 fonts = 템플릿 바탕 요소의 글꼴 열쇠, 칩을 모두 끄면 원문 그대로, 모두 켜면 바탕 요소가 모두 그림 세트
const data = JSON.parse(fs.readFileSync(path.join(root, "examples", "index.json"), "utf8"));
for (const item of data.examples) {
  const text = fs.readFileSync(path.join(root, "examples", item.file), "utf8");
  const fonts = R.hostFonts(text);
  check("fonts of " + item.file, fonts.slice().sort().join() === (item.fonts || []).slice().sort().join(), { fonts, listed: item.fonts });
  const none = R.remix(text, { set, fonts: [] });
  check("no chip on " + item.file, none.hosts === 0 && none.html === text, none.hosts);
  const all = R.remix(text, { set, fonts: item.fonts });
  const body = all.html.split(/(<!--[\s\S]*?-->)/).filter((part, index) => index % 2 === 0).join("");
  const stray = (body.match(/<(?:font-kku\b[^>]*|[^>]*class=["'][^"']*\bfont-kku\b[^>]*)>/g) || []).filter((tag) => !/jamo-set="my-font"/.test(tag));
  check("all hosts of " + item.file, all.hosts > 0 && stray.length === 0, stray);
}
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
"""


def test_showcase_remix_transform() -> None:
    """사례 '고쳐 쓰기' 변환(site/showcase-remix.js)의 가장자리: 주석 속 런타임 태그, 속성 값 속 '>', 홑따옴표 속성, 값 없는
    seed, 글꼴 이름이 없는 바탕 요소(세벌 고정 — jamo-set만, 칩 "fixed"), 바꿀 곳이 없으면 원문 그대로, 쓰지 않게 된 세트 등록
    빼기. 그리고 사례 목록(index.json)의 fonts가 템플릿 바탕 요소의 글꼴과 같다. 브라우저 없이 node로 돈다."""
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed")
    root = playwright_smoke.ROOT_DIR
    result = subprocess.run([node, "-e", REMIX_EDGE_JS, str(root)], capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, "showcase-remix.js edge cases failed:\n" + result.stdout + result.stderr


SITE_SURFACES = (
    (assert_public_pages, "public-pages"), (assert_showcase_page, "showcase"),
    (assert_fonts_themes, "fonts-themes"), (assert_landing_problems, "landing-problems"),
    (assert_effects_page, "effects"), (assert_basic_page, "basic-text"),
    (assert_gothic_context_page, "shape-comparison"), (assert_studio_presets, "studio-presets"),
    (assert_sprite_demo, "sprite-demo"), (assert_faces_page, "faces"),
    (assert_animation_catalog, "animation-catalog"),
    (assert_sign_app, "sign-app"), (assert_memo_app, "memo-app"),
    (assert_studio_page_shell, "studio-page-shell"),
)


def test_smoke_registration_in_sync() -> None:
    """Keep page coverage and file/server branches registered as the source evolves."""
    module = ast.parse(Path(playwright_smoke.__file__).read_text())
    surfaces = {fn.name for fn in module.body if isinstance(fn, ast.FunctionDef)
                and fn.name.startswith("assert_")
                and [arg.arg for arg in fn.args.args] == ["page", "url", "label"]}
    registered = {check.__name__ for check, _name in SITE_SURFACES}
    assert surfaces == registered, (surfaces - registered, registered - surfaces)
    file_branches = {fn.name for fn in module.body if isinstance(fn, ast.FunctionDef)
                     and fn.name.startswith("assert_") and any(
                         isinstance(node, ast.If) and "label" in ast.unparse(node.test)
                         and ("file" in ast.unparse(node.test) or "server" in ast.unparse(node.test))
                         for node in ast.walk(fn))}
    assert file_branches == {check.__name__ for check in FILE_DIFFERS}


@pytest.mark.parametrize(("smoke_target", "check"),
    [pytest.param(mode, check, id=f"{mode}-{name}")
     for mode in BOTH_MODES for check, name in SITE_SURFACES if mode in modes_for(check)],
    indirect=["smoke_target"])
def test_site_surface(page, smoke_target, check):
    run_surface(page, smoke_target, check)


@over_modes(assert_demo)
def test_landing(page, smoke_target):
    url, label = smoke_target
    page.goto(url, wait_until="load")
    assert_demo(page, label)


@over_modes(assert_api_studio)
def test_api_studio(page, smoke_target):
    url, label = smoke_target
    page.goto(url.replace("index.html", "api-studio.html"), wait_until="load")
    assert_api_studio(page, label)


def test_real_file_showcase_without_flag(playwright_driver):
    browser = launch_browser(playwright_driver, headless=True)
    try:
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto((playwright_smoke.ROOT_DIR / "showcase.html").as_uri(), wait_until="load")
        page.wait_for_function("() => window.FontKkuShowcase && document.querySelector('[data-showcase]').textContent.includes('index.json')", timeout=15000)
        notes = page.evaluate("() => [document.querySelector('[data-remix-off]').hidden, document.querySelector('[data-remix]').hidden]")
        assert notes == [False, True] and not errors, (notes, errors)
    finally:
        browser.close()
