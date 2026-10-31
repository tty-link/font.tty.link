"""Site copy contracts: retired terms stay retired, and site chrome draws in the default 세벌식.

GLOSSARY.md (in the package) is the canonical list of terms. When it retires a name, the site keeps it only in a line that
says it is the old name (예전 이름 · 그때 이름). src/examples/ is verbatim AI and template content and is not checked.
"""
from __future__ import annotations

from pathlib import Path
import re
import unittest

SRC = Path(__file__).resolve().parents[1] / "src"

# 용어집이 바꾼 이름 → 지금 이름
RETIRED = {
    "문맥 배치": "네모꼴",
    "세벌 문맥": "네모꼴",
    "네모 문맥": "네모꼴",
    "세벌 고정": "직결식",
    "렌더링 깊이": "그릴 범위",
    "제작 단계": "그릴 범위",
    "자모 깊이": "음절 나누기",
    "섞임모음": "합자 모음",
    "섞임 모음": "합자 모음",
    "배치 프로파일": "글꼴 모양",
    "역할 도장": "모양 값",
    "페이지용 코드 복사": "내보내기 ▾ → 내 페이지에 쓰기",
}
OLD_NAME_NOTE = re.compile(r"예전|그때 이름")


def site_files():
    for path in sorted(SRC.rglob("*")):
        if path.is_file() and path.suffix in {".html", ".js", ".css", ".txt"} and "examples" not in path.parts:
            yield path


class RetiredTerms(unittest.TestCase):
    def test_retired_terms_only_appear_as_old_names(self):
        found = []
        for path in site_files():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                for old, new in RETIRED.items():
                    if old in line and not OLD_NAME_NOTE.search(line):
                        found.append(f"{path.relative_to(SRC)}:{number}: '{old}' → '{new}'")
        self.assertEqual(found, [], "retired terms (GLOSSARY.md):\n" + "\n".join(found))


class DefaultFontChrome(unittest.TestCase):
    """머리 도장과 페이지·구획 제목은 글꼴을 비워 기본 세벌식으로 그린다 — 작업실이 처음 여는 모양과 같다."""

    STAMP = re.compile(r'class="k-stamp"[^>]*>\s*<font-kku\b([^>]*)>')
    TITLE = re.compile(r'<[^>]*class="[^"]*\bfont-kku\b[^"]*\bk-h[12]\b[^"]*"[^>]*>|<[^>]*class="[^"]*\bk-h[12]\b[^"]*\bfont-kku\b[^"]*"[^>]*>')

    def test_stamp_and_titles_leave_the_font_empty(self):
        found = []
        for path in site_files():
            if path.suffix != ".html":
                continue
            text = path.read_text(encoding="utf-8")
            for match in self.STAMP.finditer(text):
                if re.search(r'(?<![-\w])font="', match.group(1)):
                    found.append(f"{path.name}: stamp {match.group(0)}")
            for match in self.TITLE.finditer(text):
                if re.search(r'(?<![-\w])data-font="', match.group(0)):
                    found.append(f"{path.name}: title {match.group(0)}")
        self.assertEqual(found, [], "\n".join(found))


if __name__ == "__main__":
    unittest.main()
