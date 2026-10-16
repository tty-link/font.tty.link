"""사이트 스모크가 사용하는 Chromium 선택과 실행."""
from __future__ import annotations

import os


def browser_flavor() -> str:
    """실행에 쓰일 브라우저 종류를 알려준다: 커스텀 Chrome이면 'chrome', 아니면 'chromium'."""
    if os.environ.get("FONT_KKU_CHROME_PATH") or os.environ.get("FONT_KKU_CHROME_CHANNEL"):
        return "chrome"
    return "chromium"


def launch_browser(playwright, **launch_kwargs):
    """플랫폼 이식 가능한 Chromium 실행.

    기본은 Playwright 번들 chromium이고, 환경변수로 재정의할 수 있다:
      FONT_KKU_CHROME_PATH    — Chrome/Chromium 실행 파일 절대경로 (executable_path)
      FONT_KKU_CHROME_CHANNEL — Playwright 브라우저 채널 (예: chrome, chrome-beta, msedge)
    """
    chrome_path = os.environ.get("FONT_KKU_CHROME_PATH")
    chrome_channel = os.environ.get("FONT_KKU_CHROME_CHANNEL")
    if chrome_path:
        launch_kwargs["executable_path"] = chrome_path
    elif chrome_channel:
        launch_kwargs["channel"] = chrome_channel
    return playwright.chromium.launch(**launch_kwargs)
