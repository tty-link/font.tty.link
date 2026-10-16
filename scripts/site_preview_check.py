#!/usr/bin/env python3
"""배포 미리보기 정적 사이트 점검 — 공개할 커밋으로 font.tty.link를 정적으로 빌드해 공개판과 견준다(ADR-022 §6의 3).

    .venv/bin/python scripts/site_preview_check.py                  # 빌드 → 점검 → 시트, 결과 tmp/site-preview/<버전>-<커밋>/
    .venv/bin/python scripts/site_preview_check.py --only font --match showcase
    .venv/bin/python scripts/site_preview_check.py --reuse <폴더>   # 이미 찍은 report.json으로 시트·판정만

- 지금(after): `scripts/build.py --package-tarball <candidate.tgz>`로 빌드한 사본을 127.0.0.1에서 내준다(끝나면 닫는다).
  font.tty.link 모든 쪽(`*.html`, `examples/*.html`)을 Chromium 데스크톱·휴대폰, WebKit 데스크톱·휴대폰, Firefox 데스크톱으로 연다.
  tty.link 홈과 lol.tty.link(홈·`pages/index.json`의 모든 쪽)는 공개 사이트를 그대로 열되 `https://font.tty.link/lib/**`만 이 사본으로 돌린다.
- 전(before): 공개 font.tty.link·tty.link·lol.tty.link를 Chromium 데스크톱·휴대폰으로 연다.
- 쪽마다 끝까지 훑어 내린 뒤 바탕 요소가 다 그려졌는지(`notReady`), 콘솔 오류·페이지 오류, 실패한 요청(4xx·5xx·끊김), 런타임 판을 적고
  찍는다. 전후 짝을 나란히 둔 시트와 표(index.html)를 만든다 — 승인 요청 ②에서 사용자가 본다.
- 판정(끝 코드 1): 지금 쪽에 오류·실패 요청·예외가 있거나, 덜 그려진 바탕 요소가 공개판의 같은 쪽보다 많다. 모양은 판정하지 않는다.

공개 사이트에 닿아야 한다(네트워크). 일꾼 수는 --jobs(기본 FONT_KKU_JOBS 또는 3).
"""
from __future__ import annotations

import argparse
import functools
import html
import http.server
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = "https://font.tty.link/"
TTY = "https://tty.link/"
LOL = "https://lol.tty.link/"
VIEWPORTS = {"desktop": dict(viewport={"width": 1366, "height": 657}, device_scale_factor=1),
             "mobile": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)}
AFTER_FONT = (("chromium", "desktop"), ("chromium", "mobile"), ("webkit", "desktop"), ("webkit", "mobile"), ("firefox", "desktop"))
AFTER_TTY = (("chromium", "desktop"), ("chromium", "mobile"), ("webkit", "mobile"))
BEFORE = (("chromium", "desktop"), ("chromium", "mobile"))

SCROLL_JS = """async () => {
  const step = Math.max(200, innerHeight * 0.8);
  const max = Math.min(document.documentElement.scrollHeight, 40000);
  for (let y = 0; y < max; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 110)); }
  scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
}"""
HOSTS_JS = """() => { const hs = [...document.querySelectorAll('font-kku, .font-kku')];
  const bad = hs.filter(h => !(h.dataset.fyUpgraded === 'true' && !h.hasAttribute('data-fy-font-pending')
      && h.querySelector('[part~="glyph"]')));
  return { hosts: hs.length, notReady: bad.length,
           sample: bad.slice(0, 3).map(h => (h.getAttribute('font') || h.dataset.fyFont || '') + ':' + (h.textContent || '').trim().slice(0, 12)),
           version: (window.FontKku && window.FontKku.version) || null }; }"""
SPRITES_JS = """async (timeout) => {
  const urls = new Set();
  document.querySelectorAll('font-kku [part~="jamo"], font-kku [part~="jamo"] *, .font-kku [part~="jamo"]').forEach((n) => {
    const cs = getComputedStyle(n);
    for (const value of [cs.backgroundImage, cs.maskImage || cs.webkitMaskImage]) {
      const m = /url\\("?([^")]+)"?\\)/.exec(value || ''); if (m) urls.add(m[1]);
    }
  });
  const all = Promise.all([...urls].map((u) => { const img = new Image(); img.src = u; return img.decode().catch(() => null); }));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return urls.size;
}"""


def git_short() -> str:
    return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True, capture_output=True).stdout.strip() or "nogit"


def build(out: Path, port: int, package_args: list[str]) -> dict:
    proc = subprocess.run([sys.executable, str(ROOT / "scripts" / "build.py"), "--out", str(out), *package_args], cwd=ROOT, text=True, capture_output=True)
    if proc.returncode:
        sys.exit(f"site build failed:\n{proc.stdout}\n{proc.stderr}")
    lines = [line for line in proc.stdout.splitlines() if line.startswith("{")]
    return json.loads(lines[-1]) if lines else {}


def serve(root: Path, port: int) -> http.server.ThreadingHTTPServer:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):  # noqa: D401
            pass
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Quiet, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def lib_route(lib: Path):
    def handle(route):
        path = route.request.url.split("/lib/", 1)[1].split("?", 1)[0].split("#", 1)[0]
        file = lib / path
        if file.is_file():
            ctype = "text/javascript" if file.suffix in (".js", ".mjs") else (mimetypes.guess_type(file.name)[0] or "application/octet-stream")
            route.fulfill(status=200, body=file.read_bytes(), headers={"content-type": ctype, "access-control-allow-origin": "*"})
        else:
            route.fulfill(status=404, body="not in local lib")
    return handle


def lol_pages() -> list[str]:
    """Read the public catalog with the same browser used for page checks."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            page = browser.new_page()
            response = page.goto(LOL + "pages/index.json", wait_until="load", timeout=45000)
            if response is None or not response.ok:
                raise RuntimeError(f"public LOL catalog failed: {response.status if response else 'no response'}")
            index = response.json()
        finally:
            browser.close()
    items = index["pages"] if isinstance(index, dict) and "pages" in index else index
    return [""] + ["pages/" + item.get("file", f"{item['id']}.html") for item in items]


def plan(only: str | None, match: str, font_pages: list[str], consumer_pages: list[str], local: str) -> list[dict]:
    jobs = []
    if only in (None, "font"):
        for page in font_pages:
            jobs += [dict(site="font", page=page, engine=e, vp=v, side="after", url=local + page) for e, v in AFTER_FONT]
            jobs += [dict(site="font", page=page, engine=e, vp=v, side="before", url=LIVE + page) for e, v in BEFORE]
    if only in (None, "tty"):
        for site, base, pages in (("tty", TTY, [""]), ("lol", LOL, consumer_pages)):
            for page in pages:
                jobs += [dict(site=site, page=page, engine=e, vp=v, side="after", url=base + page) for e, v in AFTER_TTY]
                jobs += [dict(site=site, page=page, engine=e, vp=v, side="before", url=base + page) for e, v in BEFORE]
    return [job for job in jobs if match in job["page"]]


def run_chunk(chunk: list[dict], shots: Path, lib: Path) -> list[dict]:
    from playwright.sync_api import sync_playwright
    rows = []
    with sync_playwright() as pw:
        browsers = {}
        for job in chunk:
            engine = job["engine"]
            if engine not in browsers:
                browsers[engine] = getattr(pw, engine).launch()
            opts = dict(VIEWPORTS[job["vp"]], locale="ko-KR")
            if engine == "firefox":
                opts.pop("is_mobile", None)
            ctx = browsers[engine].new_context(**opts)
            if job["site"] in ("tty", "lol") and job["side"] == "after":
                ctx.route("https://font.tty.link/lib/**", lib_route(lib))
            page = ctx.new_page()
            errors, failed = [], []
            page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))
            page.on("requestfailed", lambda r: failed.append(f"{r.url[:150]} ({r.failure})"))
            page.on("response", lambda r: failed.append(f"{r.url[:150]} [{r.status}]") if r.status >= 400 else None)
            started = time.time()
            row = dict(job)
            try:
                page.goto(job["url"], wait_until="load", timeout=45000)
                page.wait_for_timeout(800)
                page.evaluate(SCROLL_JS)
                deadline = time.time() + 10
                info = host_info(page)
                while info["notReady"] and time.time() < deadline:
                    page.wait_for_timeout(400)
                    info = host_info(page)
                for frame in page.frames:
                    frame.evaluate(SPRITES_JS, 6000)
                page.wait_for_timeout(700)
                info = host_info(page)
                name = f"{job['site']}-{job['page'].replace('/', '_') or 'index'}-{engine}-{job['vp']}-{job['side']}.png"
                shot = shots / name
                if engine == "chromium" and job["vp"] == "desktop":
                    height = min(page.evaluate("document.documentElement.scrollHeight"), 4200)
                    page.screenshot(path=str(shot), full_page=True, clip={"x": 0, "y": 0, "width": 1366, "height": height})
                else:
                    page.screenshot(path=str(shot))
                row.update(info, shot=str(shot.relative_to(shots.parent)))
            except Exception as exc:  # noqa: BLE001 — 한 쪽이 깨져도 나머지를 잰다
                row["exception"] = str(exc)[:300]
            row.update(errors=errors, failed=failed, seconds=round(time.time() - started, 1))
            rows.append(row)
            print(f"{job['side']:<6} {job['site']:<4} {engine:<8} {job['vp']:<7} {job['page'][:34]:<34} v{row.get('version')} "
                  f"hosts {row.get('hosts')} notReady {row.get('notReady')} err {len(errors)} fail {len(failed)} "
                  f"{row['seconds']}s{' EXC' if 'exception' in row else ''}", flush=True)
            ctx.close()
        for browser in browsers.values():
            browser.close()
    return rows


def host_info(page) -> dict:
    """Include packaged studio and example frames in the rendering readiness check."""
    frames = [frame.evaluate(HOSTS_JS) for frame in page.frames]
    return {"hosts": sum(info["hosts"] for info in frames),
            "notReady": sum(info["notReady"] for info in frames),
            "sample": [sample for info in frames for sample in info["sample"]][:3],
            "version": next((info["version"] for info in frames if info["version"]), None)}


def key(row: dict) -> tuple:
    return (row["site"], row["page"], row["engine"], row["vp"])


def shot_path(out: Path, shot: str) -> Path:
    """report.json의 찍은 그림 경로 — 결과 폴더 기준(이 도구), 아니면 그대로(절대 경로·저장소 기준)."""
    path = out / shot
    return path if path.exists() else Path(shot)


def sheets(out: Path, rows: list[dict]) -> int:
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 26)
    except OSError:
        font = ImageFont.load_default()
    before = {key(r): r for r in rows if r["side"] == "before"}
    after = {key(r): r for r in rows if r["side"] == "after"}
    (out / "sheets").mkdir(exist_ok=True)
    lines = ["<!doctype html><meta charset=utf-8><title>배포 미리보기 전후</title>",
             "<style>body{font:15px -apple-system,sans-serif;margin:24px}img{max-width:100%;border:1px solid #ddd}"
             "td,th{padding:3px 8px;border-bottom:1px solid #eee;text-align:left}.bad{color:#c00;font-weight:600}</style>",
             "<h1>배포 미리보기 — 공개 사이트 대비</h1><table><tr><th>사이트</th><th>쪽</th><th>엔진</th><th>화면</th>"
             "<th>판</th><th>바탕 요소</th><th>덜 그려짐 (전→후)</th><th>오류 (전→후)</th><th>실패 요청 (전→후)</th></tr>"]
    for k in sorted(after):
        now, was = after[k], before.get(k)

        def cell(name, now=now, was=was):
            value = len(now.get(name) or []) if name in ("errors", "failed") else now.get(name)
            prior = (len(was.get(name) or []) if name in ("errors", "failed") else was.get(name)) if was else "—"
            bad = isinstance(value, int) and value > 0 and (not isinstance(prior, int) or value > prior)
            return f"<td class={'bad' if bad else ''}>{prior} → {value}</td>"
        lines.append(f"<tr><td>{k[0]}</td><td>{html.escape(k[1] or 'index')}</td><td>{k[2]}</td><td>{k[3]}</td>"
                     f"<td>{now.get('version')}</td><td>{now.get('hosts')}</td>{cell('notReady')}{cell('errors')}{cell('failed')}</tr>")
    lines.append("</table>")
    made = 0
    for k in sorted(after):
        now, was = after[k], before.get(k)
        if not was or not now.get("shot") or not was.get("shot"):
            continue
        left, right = Image.open(shot_path(out, was["shot"])).convert("RGB"), Image.open(shot_path(out, now["shot"])).convert("RGB")
        gap, head = 24, 44
        sheet = Image.new("RGB", (left.width + gap + right.width, max(left.height, right.height) + head), "white")
        draw = ImageDraw.Draw(sheet)
        title = f"{k[0]} {k[1] or 'index'} · {k[2]} {k[3]}"
        draw.text((8, 8), f"공개 {was.get('version')} — {title}", fill="#555", font=font)
        draw.text((left.width + gap + 8, 8), f"지금 {now.get('version')}", fill="#c00", font=font)
        sheet.paste(left, (0, head))
        sheet.paste(right, (left.width + gap, head))
        if sheet.width > 2400:
            sheet = sheet.resize((2400, round(sheet.height * 2400 / sheet.width)))
        name = f"{k[0]}-{(k[1] or 'index').replace('/', '_')}-{k[2]}-{k[3]}.png"
        sheet.save(out / "sheets" / name, optimize=True)
        made += 1
        lines.append(f"<h3>{html.escape(name)}</h3><img loading=lazy src='sheets/{html.escape(name)}'>")
    (out / "index.html").write_text("\n".join(lines), encoding="utf-8")
    return made


def verdict(rows: list[dict]) -> list[str]:
    """지금 쪽의 오류·실패 요청·예외, 공개판의 같은 쪽보다 많은 덜 그려짐."""
    before = {}
    for row in rows:
        if row["side"] == "before":
            page = (row["site"], row["page"])
            before[page] = max(before.get(page, 0), row.get("notReady") or 0)
    problems = []
    for row in rows:
        if row["side"] != "after":
            continue
        where = f"{row['site']} {row['page'] or 'index'} {row['engine']} {row['vp']}"
        if "exception" in row:
            problems.append(f"{where}: 예외 {row['exception'][:120]}")
        if row.get("errors"):
            problems.append(f"{where}: 오류 {len(row['errors'])} — {row['errors'][0][:120]}")
        if row.get("failed"):
            problems.append(f"{where}: 실패 요청 {len(row['failed'])} — {row['failed'][0][:120]}")
        if (row.get("notReady") or 0) > before.get((row["site"], row["page"]), 0):
            problems.append(f"{where}: 덜 그려짐 {row['notReady']} (공개 {before.get((row['site'], row['page']), 0)}) — {row.get('sample')}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", help="결과 폴더(기본 tmp/site-preview/<버전>-<커밋>)")
    parser.add_argument("--port", type=int, default=8494, help="사본을 내줄 127.0.0.1 포트(기본 8494)")
    parser.add_argument("--jobs", type=int, default=int(os.environ.get("FONT_KKU_JOBS") or 3))
    parser.add_argument("--only", choices=["font", "tty"], help="tty: tty.link home and the LOL consumer pages")
    parser.add_argument("--match", default="", help="쪽 경로에 이 글이 든 것만")
    parser.add_argument("--reuse", help="이미 찍은 폴더(report.json)로 시트·판정만 다시")
    package = parser.add_mutually_exclusive_group()
    package.add_argument("--package-dir", type=Path)
    package.add_argument("--package-tarball", type=Path)
    args = parser.parse_args()

    if args.reuse:
        out = Path(args.reuse)
        rows = json.loads((out / "report.json").read_text(encoding="utf-8"))
    else:
        version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["dependencies"]["@tty.link/font-kku"]
        out = Path(args.out) if args.out else ROOT / "tmp" / "site-preview" / f"{version}-{git_short()}"
        site = out / "site"
        (out / "shots").mkdir(parents=True, exist_ok=True)
        package_args = (["--package-dir", str(args.package_dir)] if args.package_dir else
                        ["--package-tarball", str(args.package_tarball)] if args.package_tarball else [])
        built = build(site, args.port, package_args)
        print(f"build package {built.get('package')} files {built.get('files')} → {site}", flush=True)
        font_pages = sorted(p.name for p in site.glob("*.html")) + sorted("examples/" + p.name for p in (site / "examples").glob("*.html"))
        consumer_pages = lol_pages() if args.only in (None, "tty") else []
        jobs = plan(args.only, args.match, font_pages, consumer_pages, f"http://127.0.0.1:{args.port}/")
        by_engine: dict[str, list[dict]] = {}
        for job in jobs:
            by_engine.setdefault(job["engine"], []).append(job)
        chunks = []
        for engine_jobs in by_engine.values():
            n = max(1, min(args.jobs, len(engine_jobs) // 20 + 1))
            chunks += [engine_jobs[i::n] for i in range(n)]
        print(f"pages font {len(font_pages)} tty {int(args.only in (None, 'tty'))} lol {len(consumer_pages)} · opens {len(jobs)} · chunks {len(chunks)} · jobs {args.jobs}", flush=True)
        httpd = serve(site, args.port)
        try:
            with ThreadPoolExecutor(max(1, args.jobs)) as pool:
                rows = [row for chunk_rows in pool.map(lambda c: run_chunk(c, out / "shots", site / "lib"), chunks) for row in chunk_rows]
        finally:
            httpd.shutdown()
            httpd.server_close()
        (out / "report.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    made = sheets(out, rows)
    problems = verdict(rows)
    after = [r for r in rows if r["side"] == "after"]
    print(f"site preview: {len(rows)} opens (after {len(after)}), sheets {made} → {out / 'index.html'}")
    print(f"runtime versions: after {sorted({str(r.get('version')) for r in after})}, "
          f"before {sorted({str(r.get('version')) for r in rows if r['side'] == 'before'})}")
    if problems:
        print(f"site preview: FAIL — {len(problems)}")
        for problem in problems[:30]:
            print("  " + problem)
        return 1
    print("site preview: PASS — 오류·실패 요청·예외 0, 덜 그려짐은 공개판 이하")
    return 0


if __name__ == "__main__":
    sys.exit(main())
