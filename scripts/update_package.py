#!/usr/bin/env python3
"""Update the exact font-kku dependency and its versioned site examples offline."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "@tty.link/font-kku"
SEMVER = re.compile(r"\d+\.\d+\.\d+(?:-rc\.\d+)?")
VERSION = r"(\d+\.\d+\.\d+(?:-rc\.\d+)?)"
PATTERNS = (
    ("CDN address", re.compile(re.escape(PACKAGE) + "@" + VERSION)),
    ("tarball name", re.compile(r"tty\.link-font-kku-" + VERSION + r"\.tgz")),
    ("page version", re.compile(r"data-fk-version>" + VERSION + "<")),
)
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".txt", ".md"}


def current_version(root: Path) -> str:
    version = json.loads((root / "package.json").read_text())["dependencies"][PACKAGE]
    if not isinstance(version, str) or not SEMVER.fullmatch(version):
        raise ValueError("package.json must pin an exact X.Y.Z or X.Y.Z-rc.N font-kku version")
    return version


def source_files(root: Path) -> list[Path]:
    paths = []
    for path in sorted((root / "src").rglob("*")):
        if path.is_symlink():
            raise ValueError(f"source contains a link: {path.relative_to(root)}")
        if path.is_file() and path.suffix in TEXT_SUFFIXES:
            paths.append(path)
    return paths


def check_version(root: Path, expected: str | None = None) -> list[str]:
    current = current_version(root)
    expected = expected or current
    problems = []
    if current != expected:
        problems.append(f"package.json: {current} (expected {expected})")
    for path in source_files(root):
        text = path.read_text()
        for label, pattern in PATTERNS:
            for version in sorted({match.group(1) for match in pattern.finditer(text)} - {expected}):
                problems.append(f"{path.relative_to(root)}: {label} {version} (expected {expected})")
    return problems


def update(root: Path, new: str) -> list[str]:
    if not SEMVER.fullmatch(new):
        raise ValueError("give an exact X.Y.Z or X.Y.Z-rc.N version")
    old = current_version(root)
    problems = check_version(root, old)
    if problems:
        raise ValueError("fix version drift before updating:\n  " + "\n  ".join(problems))
    changes = {}
    for path in source_files(root):
        text = path.read_text()
        updated = text
        for _label, pattern in PATTERNS:
            def replace(match):
                begin = match.start(1) - match.start()
                end = match.end(1) - match.start()
                return match.group(0)[:begin] + new + match.group(0)[end:]
            updated = pattern.sub(replace, updated)
        if updated != text:
            changes[path] = updated
    meta_path = root / "package.json"
    meta = json.loads(meta_path.read_text())
    meta["dependencies"][PACKAGE] = new
    if old != new:
        changes[meta_path] = json.dumps(meta, ensure_ascii=False, indent=2) + "\n"
    for path, text in changes.items():
        path.write_text(text)
    return sorted(path.relative_to(root).as_posix() for path in changes)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", nargs="?")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    if args.version and not SEMVER.fullmatch(args.version):
        parser.error("give an exact X.Y.Z or X.Y.Z-rc.N version")
    try:
        if args.check:
            problems = check_version(ROOT, args.version)
            if problems:
                raise ValueError("version drift:\n  " + "\n  ".join(problems))
            print(f"version {current_version(ROOT)}: dependency and src/ examples agree")
        else:
            if not args.version:
                parser.error("give a new version, or --check")
            changed = update(ROOT, args.version)
            print(f"updated to {args.version}: {len(changed)} file(s)")
            for name in changed:
                print("  " + name)
    except (ValueError, OSError, KeyError) as error:
        print(f"update_package: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
