# studio — 글꼴 작업실

브라우저에서 글꼴을 고르고, 그리고, 고치고, 검수하는 선택형 화면이다. 제작·검사 계산은 [`authoring/`](../authoring/README.md)에 있고, 이 폴더는 그 위의 화면이다. 런타임만 쓰는 페이지는 이 폴더가 필요 없다([ADR-029](../docs/ADR/ADR-029-library-authoring-and-site.md)).

## 여는 법
- 바로 열기: `studio/index.html`. 빌드 없이 classic script로 돈다. 처음 열 페이지는 주소의 `?page=`로 고른다 — 디자인(`design`, 맨 주소), 고치기(`edit`), 자소판(`sheet`), 검수(`review`). 페이지 나누기 결정은 [ADR-036](../docs/ADR/ADR-036-studio-page-split.md)이다.
- 내 페이지에 넣기: `mount.js`(전역 `FontKkuStudio`) 또는 ESM `import { mount } from "@tty.link/font-kku/studio"`. 작업실은 iframe 안에서 돌아 호스트 페이지의 CSS·전역과 섞이지 않는다.

```html
<div id="editor"></div>
<script src="./node_modules/@tty.link/font-kku/studio/mount.js"></script>
<script>
  const editor = FontKkuStudio.mount(document.querySelector("#editor"), { font: "gothic", page: "edit" });
  editor.ready.then(() => editor.setText("내 글꼴 만들기"));
</script>
```

설정(`font`·`text`·`project`·`page`·`draftKey`·`studioUrl`·저장 창구 등)과 돌려받는 핸들은 `mount.d.ts`에 있다.

## 파일
- `index.html` — 작업실 문서. 페이지 넷이 한 문서 안에 있고 `?page=`만 바꾼다.
- `mount.js`·`mount.mjs`·`mount.d.ts`·`mount.d.mts` — 삽입 API와 타입.
- `font-studio*.js`·`font-studio*.css` — 화면 갈래(디자인·그리기·조립식·묶음·검수 등), `bridge.js`·`base.css` — 공통.
- 작업실 자동화 창구(`FontStudio.api`)는 사람 화면과 같은 편집 경로를 에이전트·개발·검수 사이트에 연다 — 계약은 [글꼴 작업실](../docs/ARCHITECTURE/font-studio.md) '자동화 계약 v1'.

## 시험
- Node: `npm test`에 든 `tests/studio_mount.test.js`·`tests/studio_api.test.js` 등.
- 브라우저: `tests/test_studio_*.py`(Playwright). 저장소의 `.venv`로 대상만 좁혀 돈다 — 예: `.venv/bin/python -m pytest tests/test_studio_mount.py -n 1`. 검증 층은 [TESTING.md](../TESTING.md).

화면 구성·데이터 흐름·저장 계약은 [글꼴 작업실](../docs/ARCHITECTURE/font-studio.md), 용어는 [용어집](../docs/GLOSSARY.md).
