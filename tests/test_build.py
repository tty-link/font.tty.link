"""Offline build and output protection contracts; no installed package is needed."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("site_build", ROOT / "scripts/build.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
version_spec = importlib.util.spec_from_file_location("site_version", ROOT / "scripts/update_package.py")
V = importlib.util.module_from_spec(version_spec)
version_spec.loader.exec_module(V)
preview_spec = importlib.util.spec_from_file_location("site_preview", ROOT / "scripts/site_preview_check.py")
P = importlib.util.module_from_spec(preview_spec)
preview_spec.loader.exec_module(P)


def built(files):
    manifest = {"builder": "font.tty.link/source-v1", "sha256": {
        name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
    return {**files, B.MANIFEST: json.dumps(manifest).encode()}


FILES = built({"index.html": b"<p>hi</p>", "lib/font-kku.js": b"// runtime", "CNAME": b"font.tty.link"})


class OutputProtection(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name) / "output"

    def test_empty_missing_and_repeated_build(self):
        B.write_output(self.out, FILES)
        B.write_output(self.out, FILES)
        self.assertEqual((self.out / "index.html").read_bytes(), b"<p>hi</p>")

    def test_changed_added_removed_files_stop_without_modifying_output(self):
        edits = (
            lambda: (self.out / "index.html").write_text("hand edit"),
            lambda: (self.out / "extra.html").write_text("new page"),
            lambda: (self.out / "lib/font-kku.js").unlink(),
        )
        for edit in edits:
            with self.subTest(edit=edit):
                B.write_output(self.out, FILES, force=True)
                edit()
                before = {p.relative_to(self.out): p.read_bytes() for p in self.out.rglob("*") if p.is_file()}
                with self.assertRaisesRegex(ValueError, "contains edits"):
                    B.write_output(self.out, FILES)
                self.assertEqual(before, {p.relative_to(self.out): p.read_bytes() for p in self.out.rglob("*") if p.is_file()})

    def test_force_only_overwrites_recognized_generated_output(self):
        B.write_output(self.out, FILES)
        (self.out / "index.html").write_text("hand edit")
        B.write_output(self.out, FILES, force=True)
        self.assertEqual((self.out / "index.html").read_bytes(), b"<p>hi</p>")
        other = self.out.parent / "notes"
        other.mkdir()
        (other / "notes.txt").write_text("source")
        with self.assertRaisesRegex(ValueError, "not a source-site build"):
            B.write_output(other, FILES, force=True)
        self.assertEqual((other / "notes.txt").read_text(), "source")

    def test_output_without_file_list_is_never_force_overwritten(self):
        (self.out / "lib").mkdir(parents=True)
        (self.out / "lib/build.json").write_text(json.dumps({"builder": "font.tty.link/source-v1"}))
        with self.assertRaisesRegex(ValueError, "not a source-site build"):
            B.write_output(self.out, FILES, force=True)

    def test_local_configuration_is_preserved_and_finder_files_are_ignored(self):
        B.write_output(self.out, FILES)
        for name in (".cloudflare/account.json", ".claude/settings.local.json", ".DS_Store", "lib/.DS_Store"):
            path = self.out / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("x")
        B.write_output(self.out, FILES)
        self.assertEqual((self.out / ".claude/settings.local.json").read_text(), "x")
        self.assertEqual((self.out / ".cloudflare/account.json").read_text(), "x")

    def test_repository_and_source_directories_are_protected_even_with_force(self):
        for path in (ROOT, ROOT.parent, ROOT / "src", ROOT / "src/nested", ROOT / "scripts", ROOT / "tests", ROOT / "node_modules", ROOT / ".git"):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "repository roots|protected source"):
                B.write_output(path, FILES, force=True)
        (self.out / ".git").mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, "repository roots"):
            B.write_output(self.out, FILES, force=True)


class PackageBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / "package"
        self.package.mkdir()
        self.meta = {"name": "@tty.link/font-kku", "version": V.current_version(ROOT)}
        for name in B.REQUIRED:
            path = self.package / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("")
        (self.package / "package.json").write_text(json.dumps(self.meta))

    def test_package_directory_and_tarball_work_without_source_checkout(self):
        (self.package / "tests").mkdir()
        (self.package / "tests/private.txt").write_text("not public")
        archive = self.package.parent / "candidate.tgz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(self.package, arcname="package")
        directory = B.package_files(self.package, None)
        self.assertEqual(directory, B.package_files(None, archive))
        self.assertNotIn("tests/private.txt", directory)
        self.assertEqual(B.lib_target("skills/font-kku-use/SKILL.md"), "lib/skill/SKILL.md")

    def test_wrong_version_and_missing_public_ui_are_rejected(self):
        (self.package / "package.json").write_text('{"name":"@tty.link/font-kku","version":"0.1.3"}')
        with self.assertRaisesRegex(ValueError, re.escape(f"expected @tty.link/font-kku@{self.meta['version']}")):
            B.package_files(self.package, None)
        (self.package / "package.json").write_text(json.dumps(self.meta))
        (self.package / "studio/mount.js").unlink()
        with self.assertRaisesRegex(ValueError, "missing required distribution files"):
            B.package_files(self.package, None)

    def test_unsafe_archive_paths_and_links_are_rejected(self):
        for name, kind in (("package/../../secret", tarfile.REGTYPE), ("package/link", tarfile.SYMTYPE), ("/absolute", tarfile.REGTYPE)):
            archive = self.package.parent / "bad.tgz"
            with tarfile.open(archive, "w:gz") as tar:
                item = tarfile.TarInfo(name)
                item.type = kind
                tar.addfile(item, io.BytesIO(b""))
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "invalid package archive path|contains a link"):
                B.package_files(None, archive)

    def test_page_links_and_versioned_copy_snippets_are_checked(self):
        package = B.package_files(self.package, None)
        files = {"index.html": b'<script src="lib/font-kku.js"></script><a href="./missing.html">broken</a>',
                 **{B.lib_target(name): data for name, data in package.items()}}
        self.assertEqual(B.check(files, package, B.SITE_URL), ["index.html: ./missing.html -> missing missing.html"])
        files["index.html"] = (f'<pre>&lt;script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@{self.meta["version"]}/font-kku.min.js"&gt;</pre>').encode()
        self.assertEqual(B.check(files, package, B.SITE_URL), [])
        files["index.html"] = files["index.html"].replace(self.meta["version"].encode(), b"0.1.3")
        self.assertTrue(any("unexpected jsDelivr" in p for p in B.check(files, package, B.SITE_URL)))

    def test_site_root_links_resolve_to_index(self):
        package = B.package_files(self.package, None)
        files = {"index.html": b'<a href="/">home</a><a href="https://font.tty.link/">home</a>'}
        self.assertEqual(B.check(files, package, B.SITE_URL), [])

    def test_published_comparison_rejects_runtime_changes_additions_and_removals(self):
        published = {"font-kku.js": b"released", "studio/index.html": b"<main>released UI</main>", "README.md": b"old docs"}
        B.compare_published({**published, "README.md": b"new docs"}, published)
        for package in ({**published, "font-kku.js": b"candidate"},
                        {**published, "studio/mount.js": b"new UI"},
                        {**published, "studio/index.html": b"<main>unpublished UI</main>"},
                        {"README.md": b"docs only"}):
            with self.subTest(package=package), self.assertRaisesRegex(ValueError, "runtime differs"):
                B.compare_published(package, published)


class PreviewConsumers(unittest.TestCase):
    def jobs(self, only=None, match=""):
        return P.plan(only, match, ["index.html", "font-studio.html"], ["", "pages/joke.html"], "http://127.0.0.1:8494/")

    def test_moved_catalog_keeps_all_pages_and_adds_the_brand_home(self):
        from collections import Counter
        jobs = self.jobs()
        self.assertEqual(Counter(job["site"] for job in jobs), {"font": 14, "tty": 5, "lol": 10})
        self.assertEqual({job["url"] for job in jobs}, {
            "http://127.0.0.1:8494/index.html", "http://127.0.0.1:8494/font-studio.html",
            "https://font.tty.link/index.html", "https://font.tty.link/font-studio.html",
            "https://tty.link/", "https://lol.tty.link/", "https://lol.tty.link/pages/joke.html"})

    def test_only_tty_covers_both_external_consumers(self):
        self.assertEqual({job["site"] for job in self.jobs("tty")}, {"tty", "lol"})
        self.assertEqual({job["site"] for job in self.jobs("font")}, {"font"})

    def test_match_retains_before_and_after_for_the_moved_page(self):
        jobs = self.jobs(match="pages/joke.html")
        self.assertEqual(len(jobs), 5)
        self.assertEqual({job["side"] for job in jobs}, {"before", "after"})
        self.assertTrue(all(job["url"] == "https://lol.tty.link/pages/joke.html" for job in jobs))


class PackageUpgrade(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "src").mkdir()
        (self.root / "package.json").write_text(json.dumps({"name": "site", "dependencies": {V.PACKAGE: "0.1.4-rc.1"}}))
        (self.root / "src/docs.html").write_text(
            'https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.js\n'
            'tty.link-font-kku-0.1.4-rc.1.tgz\n<span data-fk-version>0.1.4-rc.1</span>\n'
            '0.1.3에서 0.1.4로 바뀐 것 — 2026-10-16')
        (self.root / "README.md").write_text("historical @tty.link/font-kku@0.1.3")

    def test_upgrade_updates_dependency_and_pinned_examples_without_rewriting_history(self):
        changed = V.update(self.root, "0.1.5-rc.2")
        self.assertEqual(changed, ["package.json", "src/docs.html"])
        self.assertEqual(V.current_version(self.root), "0.1.5-rc.2")
        self.assertEqual(V.check_version(self.root), [])
        source = (self.root / "src/docs.html").read_text()
        self.assertEqual(source.count("0.1.5-rc.2"), 3)
        self.assertIn("0.1.3에서 0.1.4로 바뀐 것 — 2026-10-16", source)
        self.assertEqual((self.root / "README.md").read_text(), "historical @tty.link/font-kku@0.1.3")

    def test_drift_rejects_upgrade_before_changing_any_files(self):
        path = self.root / "src/docs.html"
        path.write_text(path.read_text().replace("font-kku@0.1.4-rc.1", "font-kku@0.1.3"))
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertTrue(V.check_version(self.root))
        with self.assertRaisesRegex(ValueError, "fix version drift"):
            V.update(self.root, "0.1.5")
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()})

    def test_dependency_ranges_and_invalid_target_versions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "exact"):
            V.update(self.root, "^0.1.5")
        (self.root / "package.json").write_text(json.dumps({"dependencies": {V.PACKAGE: "^0.1.4"}}))
        with self.assertRaisesRegex(ValueError, "pin an exact"):
            V.check_version(self.root)


if __name__ == "__main__":
    unittest.main()
