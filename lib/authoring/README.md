# authoring — 글꼴 제작 모델

글꼴 작업실과 사이트, 검사 도구가 함께 쓰는 제작·검사 모듈이다. 문서(DOM)를 만들지 않고 데이터를 읽고 고치며, 렌더러가 필요한 동작에만 런타임을 넘겨받는다. 화면은 [`studio/`](../studio/README.md)가 이 모듈 위에 올린다. 나눈 까닭은 [ADR-029](../docs/ADR/ADR-029-library-authoring-and-site.md)다.

```js
const Authoring = require("@tty.link/font-kku/authoring");
// import * as Authoring from "@tty.link/font-kku/authoring";
const findings = Authoring.Lint.lint(css); // 글꼴 CSS 검사 — 사람이 읽을 글은 Authoring.Lint.format(findings)
```

`index.js`(CommonJS)·`index.mjs`(ESM)가 모듈을 이름으로 모은다. 클래식 `<script>`로 낱 파일을 불러도 예전처럼 전역을 둔다.

| 이름 | 파일 | 맡은 일 |
|---|---|---|
| `Model` | `font-studio-model.js` | 글꼴 CSS의 자리·변수 모델 |
| `Lint` | `font-kku-lint.js` | 글꼴 CSS 검사(글꼴 계약 v2, [ADR-008](../docs/ADR/ADR-008-font-contract-v2.md)) |
| `Sheet` | `font-studio-sheet.js` | 자소판(그림 자소) 칸 |
| `Design`·`DesignRules` | `font-studio-design-model.js`·`font-studio-design-rules.js` | 디자인 JSON과 그 규칙 |
| `Glyphs`·`RecipeCatalog` | `font-studio-glyphs.js`·`font-studio-recipe-catalog.js` | 자모 목록과 조립식 후보 |
| `Draw` | `font-studio-draw-model.js` | 원형 8 → 24 → 40 그리기 |
| `Bundle` | `font-studio-bundle-model.js` | 디자인 묶음(디자인 JSON + 그림, `.fkk-bundle.json`) |
| `Package` | `font-studio-package.js` | 글꼴 묶음(`font-kku-font-package` v1 — 작업실이 저장하는 단위, `<id>.font-kku.json`) |
| `Palette` | `font-studio-palette-model.js` | 글꼴 팔레트 |
| `RuleResolution` | `font-kku-rule-resolution.js` | 걸린 규칙·편집 범위 풀이 |
| `Review`·`Provenance`·`Reproducibility` | `font-studio-review-model.js`·`font-studio-provenance-model.js`·`font-studio-reproducibility-model.js` | 검수 기록·출처·다시 만들기 |
| `Transactions`·`Refusals` | `font-studio-transactions.js`·`font-studio-refusals.js` | 하나의 편집 기록·거절 사유 |
| `Derive` | `font-derive.js` | 파생 글꼴 |
| `Themes` | `themes-data.js` | 테마 표 |

게시 미리 검사(`font-kku-publish-check.js`, 전역 `FontKkuPublishCheck`)는 `index.js`에 넣지 않고 낱 파일로 부른다. 글꼴 계약 린트 위에 남의 페이지에 실을 때의 규칙을 더하고, 저장은 막지 않는다.

- 손으로 고치지 않는 구간: `font-studio-model.js`의 자리 계약과 `font-kku-lint.js`의 변수 등록부는 `spec/css-variables.json`에서 만든다 — `node scripts/check_css_contract.js --write`([ADR-007](../docs/ADR/ADR-007-css-variable-registry-and-editor-codegen.md)).
- 시험: 저장소에서 `npm test`(Node 시험 — `tests/font_lint.test.js`, `tests/font_studio_*.test.js`, `tests/font_package.test.js` 등)와 `npm run verify:fast`. 검증 층은 [TESTING.md](../TESTING.md).
- 화면과 저장 계약은 [글꼴 작업실](../docs/ARCHITECTURE/font-studio.md), 용어는 [용어집](../docs/GLOSSARY.md).
