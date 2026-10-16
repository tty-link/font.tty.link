#!/usr/bin/env python3
"""Build the independent site from src/ and an installed or local npm package.

No font-kku source checkout, npm command, or network request is used.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import posixpath
import re
import shutil
import tarfile
from pathlib import Path, PurePosixPath
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://font.tty.link/"
MANIFEST = "lib/build.json"
NOTICE = """# font.tty.link generated deployment

This checkout contains generated static files. Edit the font.tty.link source
branch (`src/`, `scripts/`, `tests/`) and rebuild with `scripts/build.py`.
The font-kku runtime, authoring library and studio UI come from the npm package.
Do not run a build over the source checkout or edit this generated deployment.
"""
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".md", ".json", ".txt"}
PUBLIC_DIRS = {"profiles", "spec", "authoring", "studio", "skills", "docs", "bin"}
PUBLIC_FILES = {"package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "TESTING.md"}
REQUIRED = {"font-kku.js", "font-kku.css", "authoring/themes-data.js", "studio/mount.js", "studio/index.html", "skills/font-kku-use/SKILL.md"}
KEEP_IN_OUT = {".cloudflare", ".claude"}
RUNTIME_SUFFIXES = {".js", ".mjs", ".cjs", ".css", ".svg", ".png", ".webp", ".jpg", ".woff", ".woff2", ".ttf", ".otf"}
JSDELIVR = re.compile(r"cdn\.jsdelivr\.net/npm/((?:@[^/\s\"'<`]+/)?font-kku)@([^/\s\"'<`)]+)/?([^\s\"'<`)\]]*)")
SAMPLE = re.compile(r"<(pre|code|textarea)\b.*?</\1>", re.S)
LOCAL_REF = re.compile(r"""(?:src|href)=["']([^"'#?]+)""", re.I)
ABSOLUTE = re.compile(r"""https?://[^\s"'`)<>\]\\]+""")
OG_IMAGE = re.compile(r'(<meta property="og:image" content=")(?![a-z]+:)([^"]+)(")')


def wanted(name: str) -> bool:
    path = PurePosixPath(name)
    if name.startswith("docs/NOTES/") or name in {"MEMORY.md", "AGENTS.md", "CLAUDE.md"}:
        return False
    return (path.parts[0] in PUBLIC_DIRS or name in PUBLIC_FILES or
            name.startswith("tests/baselines/") or
            (len(path.parts) == 1 and name.startswith("font-kku") and path.suffix in TEXT_SUFFIXES | {".ts", ".mts"}))


def package_files(directory: Path | None, archive: Path | None) -> dict[str, bytes]:
    files = {}
    if archive:
        with tarfile.open(archive, "r:*") as tar:
            for member in tar.getmembers():
                parts = PurePosixPath(member.name).parts
                if not parts or parts[0] != "package" or ".." in parts or member.name.startswith("/"):
                    raise ValueError(f"invalid package archive path: {member.name}")
                if member.issym() or member.islnk():
                    raise ValueError(f"package archive contains a link: {member.name}")
                if not member.isfile():
                    continue
                name = "/".join(parts[1:])
                if name in files:
                    raise ValueError(f"duplicate package archive path: {name}")
                if wanted(name):
                    files[name] = tar.extractfile(member).read()
    else:
        directory = directory or ROOT / "node_modules" / "@tty.link" / "font-kku"
        if not (directory / "package.json").is_file():
            raise ValueError("font-kku package is missing; install dependencies or pass --package-dir/--package-tarball")
        for path in sorted(directory.rglob("*")):
            name = path.relative_to(directory).as_posix()
            if wanted(name) and path.is_symlink():
                raise ValueError(f"package contains a link: {name}")
            if wanted(name) and path.is_file():
                files[name] = path.read_bytes()
    meta = json.loads(files.get("package.json", b"{}"))
    site_meta = json.loads((ROOT / "package.json").read_text())
    expected = site_meta["dependencies"]["@tty.link/font-kku"]
    if meta.get("name") != "@tty.link/font-kku" or meta.get("version") != expected:
        raise ValueError(f"expected @tty.link/font-kku@{expected}; got {meta.get('name')}@{meta.get('version')}")
    missing = sorted(REQUIRED - files.keys())
    if missing:
        raise ValueError("package is missing required distribution files: " + ", ".join(missing))
    return files


def lib_target(name: str) -> str:
    return "lib/" + name.replace("skills/font-kku-use/", "skill/", 1) if name.startswith("skills/font-kku-use/") else "lib/" + name


def normalize(name: str) -> str:
    return posixpath.normpath("/" + name).lstrip("/")


def check(files: dict[str, bytes], package: dict[str, bytes], site_url: str) -> list[str]:
    """Check real page links and versioned snippets without contacting remote hosts."""
    problems = []
    meta = json.loads(package["package.json"])
    for name, data in files.items():
        if Path(name).suffix not in TEXT_SUFFIXES:
            continue
        text = data.decode()
        for match in JSDELIVR.finditer(text):
            package_name, version, path = (value.rstrip(".,;:") for value in match.groups())
            if package_name != meta["name"] or version != meta["version"]:
                problems.append(f"{name}: unexpected jsDelivr package/version {package_name}@{version}")
            path = urlsplit(path).path
            plain = re.sub(r"\.min\.(js|css)$", r".\1", path)
            if path and "${" not in path and "{{" not in path and plain not in package and not any(p.startswith(path.rstrip('/') + '/') for p in package):
                problems.append(f"{name}: jsDelivr file missing in package: {path}")
        if name.endswith(".html"):
            for ref in LOCAL_REF.findall(SAMPLE.sub("", text)):
                if re.match(r"^(?:[a-z]+:|//|\$\{|\{\{)", ref) or "${" in ref or "' +" in ref:
                    continue
                target = normalize(ref if ref.startswith("/") else posixpath.join(posixpath.dirname(name), ref))
                if ref.endswith("/") or target in ("", "."):
                    target = (target.rstrip("./") + "/" if target not in ("", ".") else "") + "index.html"
                if target not in files:
                    problems.append(f"{name}: {ref} -> missing {target}")
        for url in ABSOLUTE.findall(text):
            if not url.startswith(site_url):
                continue
            target = normalize(urlsplit(url.rstrip(".,;:")).path[len(urlsplit(site_url).path):])
            if target in ("", "."):
                target = "index.html"
            if target not in files and not any(key.startswith(target.rstrip("/") + "/") for key in files):
                problems.append(f"{name}: {url} -> missing {target}")
    return sorted(set(problems))


def compare_published(package: dict[str, bytes], published: dict[str, bytes]) -> None:
    runtime = {name for name in package.keys() | published.keys() if Path(name).suffix in RUNTIME_SUFFIXES}
    changed = [name for name in sorted(runtime) if package.get(name) != published.get(name)]
    if changed:
        raise ValueError("runtime differs from the published package: " + ", ".join(changed))


def build_files(package: dict[str, bytes], site_url: str = SITE_URL, published_verified: bool = False) -> dict[str, bytes]:
    files = {lib_target(name): data for name, data in package.items()}
    for path in sorted((ROOT / "src").rglob("*")):
        if not path.is_file() or path.name == ".DS_Store":
            continue
        if path.is_symlink():
            raise ValueError(f"source contains a link: {path.relative_to(ROOT)}")
        name = path.relative_to(ROOT / "src").as_posix()
        if name == "lib" or name.startswith("lib/"):
            raise ValueError("src/lib is reserved for package distribution assets")
        data = path.read_bytes()
        if path.suffix in TEXT_SUFFIXES:
            text = data.decode()
            text = OG_IMAGE.sub(lambda m: m.group(1) + urljoin(site_url + name, m.group(2)) + m.group(3), text)
            data = text.encode()
        files[name] = data
    files["README.md"] = files["AGENTS.md"] = NOTICE.encode()
    files["CLAUDE.md"] = b"@AGENTS.md\n"
    files[".gitignore"] = b".DS_Store\n.cloudflare/\n.claude/\n"
    problems = check(files, package, site_url)
    if problems:
        raise ValueError("broken links:\n  " + "\n  ".join(problems))
    meta = json.loads(package["package.json"])
    manifest = {"builder": "font.tty.link/source-v1", "name": meta["name"], "version": meta["version"],
                "built": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
                "base": f"https://cdn.jsdelivr.net/npm/{meta['name']}@{meta['version']}/",
                "publishedVerified": published_verified,
                "skill": site_url + "lib/skill/SKILL.md",
                "sha256": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    files[MANIFEST] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    return files


def validate_output(out: Path) -> None:
    out = out.resolve()
    if out == ROOT or out in ROOT.parents or (out / ".git").exists():
        raise ValueError("--out must be a generated-output directory, outside repository roots")
    for protected in ("src", "scripts", "tests", "node_modules", ".git"):
        path = ROOT / protected
        if out == path or path in out.parents or out in path.parents:
            raise ValueError(f"--out overlaps protected source directory: {protected}")


def write_output(out: Path, files: dict[str, bytes], force: bool = False) -> None:
    validate_output(out)
    if out.exists() and any(out.iterdir()):
        manifest_path = out / MANIFEST
        try:
            manifest = json.loads(manifest_path.read_text())
            if manifest.get("builder") != "font.tty.link/source-v1":
                raise ValueError("wrong builder")
            old = manifest["sha256"]
        except (OSError, KeyError, ValueError, TypeError) as error:
            raise ValueError(f"--out is not a source-site build directory: {out}") from error
        current = {p.relative_to(out).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in out.rglob("*") if p.is_file() and p.relative_to(out).as_posix() != MANIFEST
                   and p.name != ".DS_Store" and p.relative_to(out).parts[0] not in KEEP_IN_OUT}
        if current != old and not force:
            raise ValueError("--out contains edits; preserve them in src/ before removing and rebuilding the output directory")
        for path in out.iterdir():
            if path.name not in KEEP_IN_OUT:
                shutil.rmtree(path) if path.is_dir() else path.unlink()
    out.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--package-dir", type=Path, help="installed/extracted npm package directory")
    source.add_argument("--package-tarball", type=Path, help="local npm pack archive; never downloaded")
    parser.add_argument("--out", type=Path, default=ROOT / "dist")
    parser.add_argument("--site-url", default=SITE_URL)
    parser.add_argument("--check", action="store_true", help="build and check in memory without writing")
    parser.add_argument("--force", action="store_true", help="overwrite edited generated output; source protections still apply")
    parser.add_argument("--published-tarball", type=Path, help="compare runtime bytes with an independently obtained registry release archive")
    parser.add_argument("--require-published", action="store_true", help="refuse deployment output unless --published-tarball matches")
    args = parser.parse_args()
    if not args.site_url.endswith("/"):
        parser.error("--site-url must end with /")
    try:
        if not args.check:
            validate_output(args.out)
        package = package_files(args.package_dir, args.package_tarball)
        if args.require_published and not args.published_tarball:
            raise ValueError("--require-published needs --published-tarball from the npm registry")
        if args.published_tarball:
            published = package_files(None, args.published_tarball)
            compare_published(package, published)
        files = build_files(package, args.site_url, bool(args.published_tarball))
        if not args.check:
            write_output(args.out.resolve(), files, args.force)
        print(json.dumps({"files": len(files), "package": json.loads(package["package.json"])["version"],
                          "checked": args.check, "publishedVerified": bool(args.published_tarball)}))
    except (ValueError, OSError, tarfile.TarError) as error:
        raise SystemExit(f"build: {error}") from error


if __name__ == "__main__":
    main()
