# 용어집

화면 문구와 문서 본문은 아래 한글 용어를 쓴다(2026-10-09 결정). 코드 식별자 — CSS 변수(`--fy-sprite-*`), `data-*` 속성, API 이름(`render`, `seed` 속성 등), 글꼴 id(`sprite-system`), 파일·폴더 이름(`profiles/`) — 는 계약이라 영어로 둔다. 식별자를 가리킬 때는 한글 뒤에 식별자를 코드로 붙인다: "그림 자소(`sprite`) 재료", "씨앗값(`seed`)".

## 재료와 글꼴

| 한글 | 대신하는 말 | 식별자 |
|---|---|---|
| 글꼴 | font, 폰트, profile, 프로필 | `font` 속성, `profiles/*.css`, `--fy-font-id` |
| 기본 제공 글꼴 | shipped font | `spec/fonts.json` |
| 파생 글꼴 | derived font | `spec/fonts.json` `derivedFrom` |
| 꾸러미 글꼴 | shortcut font (칠만 다른 파생 글꼴 — 같은 모양을 CSS 한 장으로) | 테마의 `shortcut` (`neon` = `sebul` + 꾸밈 `neon`) |
| 재료 | material | `--fy-material` |
| 기기 글꼴 (재료) | system font | `--fy-material: system` |
| 그림 자소 | sprite, 스프라이트, 이미지 자소 | `--fy-material: sprite`, `data-sprite-jamo*` |
| 그림 자소 글꼴 | sprite font | `sprite-example`, `sprite-system` |
| 자소판 | sprite sheet, 시트 | `--fy-sprite-url`, `profiles/*.svg` |
| 자리 상자 | layout box | `spec/sprite-layout.json` — 자소판 칸마다 자모가 놓일 잉크 상자 |
| 벡터 자소 | vector jamo | `--fy-material` 표면 `vector`, `jamo-set` — 자모 노드마다 인라인 SVG로 그림 |
| 획 깊이 | stroke depth | `stroke-depth` / `--fy-stroke-depth` — `jamo`(기본) 또는 `stroke`. 벡터 자소를 자모보다 한 단계 더 쪼갠다(ADR-018) |
| 획 | hoek | `part="hoek"` — 획 깊이에서 벡터 자소의 획 하나. 이름은 `--fy-stroke`(외곽선 폭)와 겹치지 않게 '획'의 로마자 |
| 제자원리 역할 | hoek role | `data-hoek-role` — 자음 기본자 `base`·가획 `added`·이체 `variant`, 모음 천 `heaven`·지 `earth`·인 `person` |
| 마스크 칠 | mask paint | `--fy-sprite-paint: mask`, `--fy-sprite-fill` — 자소판 알파를 마스크로, 칠은 CSS |
| 글꼴 파일 내보내기 | font export | `font-kku-export.js`, `FontKkuExport.exportFont` — 조립 결과를 TTF·WOFF로 |
| 자모 세트 | jamo set | `FontKku.registerJamo`, `profiles/*.jamo.js` — 칸 키 `r<행>-<자모>`별 SVG 도형 |
| 칸 | cell, 셀 | `--fy-sprite-cell` |
| 행 | row | `--fy-sprite-row` |

## 조합 체계

글자 모양을 여섯 축으로 나누고, 고른 조합에 테마라는 이름을 붙인다(ADR-017, 정본 `spec/themes.json`).

| 한글 | 대신하는 말 | 식별자 |
|---|---|---|
| 조합 체계 | composition system | `spec/themes.json`, `scripts/build_looks.js` |
| 축 | axis | `axes` — 글꼴 · 꾸밈 · 변주 · 움직임 · 상호작용 · 바탕 |
| 글꼴 (축) | skeleton, 뼈대 — 짜임(자모 배치) × 획(재료·획 표현) | `font`, 정본 `fonts` |
| 획 표현 | texture, 획 질감 | `textures` (`plain`·`dot`·`stamp`·`chalk`·`crayon`·`stitch`), `scripts/build_jamo_svg.js` `TEXTURES` |
| 꾸밈 | look, 칠 (색·외곽선·그림자, 자모 역할별) | `class="kku-look-<id>"`, `font-kku-looks.css` — 바탕 요소를 만드는 '클래스 방식'(decorator `class="font-kku"`)과 다르다. 문서에서는 "꾸밈 `kku-look-*`" 또는 "`kku-look-*` 클래스"라고 쓴다 |
| 변주 | variation (씨앗만큼 자모마다 조금씩) | `seed` + `jamo-seeds` + `class="kku-vary-<id>"` |
| 움직임 | animation, 애니메이션, 모션 (글자 단위·자모 단위) | `animate`, `font-kku.css`(글자) · `font-kku-motion.css`(자모) |
| 상호작용 | interaction (타자·흩기·자석·섞기) | `data-kku-fx`, `font-kku-fx.js`, `FontKkuFx` |
| 바탕 | tone (꾸밈이 사는 배경) | `tones` |
| 테마 | theme, preset, 프리셋 (축을 고른 조합의 이름) | `themes`, 조합법 `recipes` (`site/themes-data.js`) |
| 조합기 | composer (글꼴 페이지에서 축을 하나씩 고르는 창) | — |

## 한글 구조

| 한글 | 대신하는 말 | 식별자 |
|---|---|---|
| 글자 | glyph, 글리프 (한 음절 상자) | `part="glyph"` |
| 짜임 | topology, 위상, 유형 | `data-layout-key` |
| 세로모음 · 가로모음 · 섞임모음 짜임 | right · bottom · split-right | `right`, `bottom`, `split-right` |
| 민글자 · 홑받침 · 겹받침 | coda none · single · double | `none`, `single`, `double` |
| 자리 | slot | `data-fy-pos`, `--fy-<slot>-*` |
| 역할 | role | `data-fy-role`, `--fy-role-*` |
| 묶음 | cluster | `part="…-cluster"` |
| 자모 깊이 | jamo depth | `--fy-jamo-depth` |
| 낱자 | standalone jamo (음절이 아닌 단독 호환 자모 `ㅋ`·`ㅘ`) | `part="content"` |

## 한글 원리 렌더링과 조립 디자인

ADR-024(재료 축·원소·뼈대)와 ADR-025(제안 — 디자인·조립식·정책)의 말이다. ADR-025 쪽 식별자는 구현 전 이름이다.

| 한글 | 대신하는 말 | 식별자 |
|---|---|---|
| 재료 (축) | face | `data-fy-face`, 글꼴 `--fy-font-face`, 페이지 `--fy-face` |
| 원소 재료 | element face, Primitive 3 | `element` — 획을 CSS 상자로 |
| 그림 재료 | svg face, SVG Artwork | `svg` — 칸 계약 그림 세트(`registerJamo(…, { frame: "box" })`) |
| 글꼴 글자 재료 | device face, Font Glyph (폰꾸 "글꼴"과 다르다 — 이쪽은 기기·웹 글꼴의 글자를 재료로 쓴다) | `device` |
| 원소 | primitive, element (가로선·세로선·원, 점·사선은 파생) | `part="element"` |
| 표준 잉크 상자 | standard ink box | `spec/jamo-ink-boxes.json` |
| 뼈대 | skeleton | `spec/jamo-skeletons.json` |
| 디자인 | design (팔레트·규칙·조립식 선택을 담은 구조 설정) | `FontKku.registerDesign`, `--fy-design`, `--fy-font-design` |
| 디자인 검사 · 교체 | design validation (오류를 모두 코드·자리로) · replace | `FontKku.validateDesign`, `DESIGN_*` 오류 코드, `registerDesign(…, { replace: true })`, `unregisterDesign` |
| 받지 않는 글꼴 | font that takes no design (그림 자소 재료, 표준 잉크 상자 없음) | `data-fy-design-status="DESIGN_UNSUPPORTED_FONT"` |
| 원본 | source (직접 그린 그림, 글꼴의 글자, 원소) | 디자인 `sources` |
| 조립식 | jamo recipe (테마의 조합법 `recipes`와 다르다) | `spec/jamo-recipes.json` |
| 조각 | part, piece (조립식 안의 재료 하나 — ㅃ의 왼쪽 ㅂ) | 조립식 `parts[].id` |
| 자동 · 직접 · 조합 | auto · direct · compose | 디자인 규칙 `method` |
| 조립 계획 | assembly plan (`spec/render-plan.json`의 표시 계획과 다르다) | — |
| 출처 기록 | trace, provenance | — |
| 원형 8 · 기본 24 · 확장 40 | origin8 · basic24 · full40 — 그림 제작 안내(렌더링 모드가 아니다) | 디자인 `editor.authoringTarget` |
| 글꼴 팔레트 | font palette (여러 글꼴을 역할·자모·조각별로) | 디자인 `sources`(글꼴 인스턴스) |
| 배치 프로파일 | layout profile (ADR-026) | `spec/layout-profiles.json`, 디자인 `layout`, `data-fy-layout` |
| 세벌식 | sebeol cases, case-fixed — 초성·중성·종성을 짜임(모음 모양 세로·가로·합자 × 받침 없음·홑·겹)마다 정해진 자리와 크기로 찍는 배치(ADR-028). 받침 없는 글자는 아래를 비우고 받침 있는 글자는 칸 높이를 다 쓴다. 글꼴을 밝히지 않은 바탕 요소의 기본 | `sebul-cases-v1` |
| 짜임 | case — 세벌식 도장을 고르는 열쇠: 모음 모양 `v`·`h`·`c` + 받침 `0`·`1`·`2`(`"v1"`), 받침과 관계없으면 모양 열쇠 하나(`"v"`) | 글자 칸 `data-jung-layout`·`data-jong-layout` |
| 직결식 · 세벌 고정 | jikgyeol, fixed-three — 초성·중성·종성을 역할·자모마다 어느 음절에서나 같은 자리와 크기로 찍는 배치(타자기형 세벌, ADR-026). 0.1.1–0.1.3의 기본, 지금은 글꼴 `jikgyeol` | `sebul-fixed-v1`, `--fy-font-layout` |
| 네모 문맥 | adaptive-square — 모음 짜임·받침 유무에 따라 자리를 바꾸는 배치(글꼴 CSS의 slot) | `square-context-v1` |
| 역할 도장 | role stamp — 고정 배치에서 역할·자모 하나(세벌식은 짜임마다)의 자리·크기·굵기 | `data-fy-stamp`, `--fy-stamp-*` |
| 밀도 굵기 계수 | density factor — 평행 획이 촘촘한 자모(ㄹ·ㅌ·ㅋ)와 꼭지 틈을 다 못 연 ㅎ·ㅊ의 원소·그림 획을 0.75–1배로 가늘게 하는 노드 값(ADR-024 §3) | `--fy-el-density`, `--fy-stamp-density` |
| 꼭지 틈 | cap gap — ㅎ·ㅊ 꼭지(점 획)와 가로획 사이. 굵기 보정이 가로획 너머 획을 0.8배까지 눌러 굵기의 0.6배로 연다(ADR-024 §3) | `dotShifts`, 스모크 `element-cap-gap` |

## 쓰는 법

| 한글 | 대신하는 말 | 식별자 |
|---|---|---|
| 전용 태그 | custom element | `<font-kku>` |
| 클래스 방식 | decorator | `class="font-kku"` + `data-*` 속성 — 기존 의미 태그(`<h2>` 등)를 바탕 요소로 쓰는 방식. 예전 이름은 '꾸밈 클래스'였으나 꾸밈 축(`kku-look-*`)과 헷갈려 바꿨다 |
| 바탕 요소 | host | `font-kku`, `.font-kku` 요소 — 폰꾸가 글을 그리는 요소. 여섯 축의 '바탕'(꾸밈이 사는 배경색, `tones`)과는 다른 말이다 |
| 그리기 | render, 렌더링 | `render()`, `font-kku:render` |
| 씨앗값 | seed | `seed`, `data-seed` |
| 자모 씨앗값 | jamo seed | `jamo-seeds`, `--fy-jamo-seed` — 자모 노드마다 0–1 |
| 씨앗 반응 글꼴 | seed-aware font | ADR-016 — 글꼴 CSS가 `--fy-jamo-seed`로 변주하는 글꼴(`jamo-seeds`를 켠 바탕 요소에서만) |
| 평문 모드 | text mode | `renderText()` |
| 터미널 명령 | CLI | `font-kku-text` |
| 한 줄 설치 | script-tag loader | `data-fonts`, `data-addons` |
| 확장 | addon | `data-addons="looks motion fx"` — `font-kku-looks.css`·`font-kku-motion.css`·`font-kku-fx.js` |

## 입력과 글꼴 없는 기기

| 한글 | 대신하는 말 | 식별자 |
|---|---|---|
| 입력기 | IME, input method, 한글 입력 모듈 | `font-kku-ime.js`, `FontKkuIme` |
| 자판 배열 | keyboard layout | `layout` |
| 두벌식 · 세벌식 390 · 세벌식 최종 | 2-set · 3-set 390 · 3-set final(3-91) | `dubeol`, `sebeol-390`, `sebeol-final` |
| 조합 중인 음절 | composing syllable, preedit | `state.composing` |
| 받침 넘김 | (두벌식) 받침이 다음 음절 초성으로 옮겨 감 | — |
| 한/영 전환 | Korean/English toggle | Shift+Space, `toggleMode()` |
| 화면 자판 | on-screen keyboard, 가상 키보드 | `keyMap()` |
| 낱자 | standalone jamo, 호환 자모 한 글자 | `[part="content"][data-sprite-jamo]` |
| 글꼴 없는 기기 | 한글 글꼴이 없는 기기 | `hasHangulFont()` |

## 도구와 화면

| 한글 | 대신하는 말 |
|---|---|
| 글꼴 작업실 | Font Studio |
| 놀이터 | Playground, API Studio |
| 자소판 그리기 | Sprite 그리기 |
| 그림 자소 보기 | Sprite Demo |
| 소개 | Overview |
| 기본 글 | Basic Text |
| 줄바꿈 | Layout |
| 짜임 비교 | Shape |
| 움직임 | Animation |
| 글자 견본 | Live Specimen |
| 바로 시작 | Quick start |
| 미리보기 · 내보내기 · 초안 · 되돌리기 | preview · export · draft · undo |
| 검사 | lint |
| 살펴보기 | inspector |
| 웹 앱 | web app (사례의 전광판·메모장) |
| 전광판 | LED sign, signboard |
| 메모장 | notepad, memo |
| 움직임 (메뉴) | effects, 효과 (공개 메뉴, `site/effects.html` — 움직임·상호작용 견본) |
| 꾸미기 | customizer (글꼴 페이지에서 글꼴을 바탕으로 나만의 꾸밈 글꼴 CSS를 만드는 창) |
| 글꼴 뽑기 | random font, font draw (뽑기 번호 하나로 재현되는 무작위 꾸밈 글꼴) |
| 조합 뽑기 | random composition (조합기에서 축마다 무작위로 고르기) |
| 이럴 때 폰꾸 | use cases, problems (소개의 문제 카드·증명 데모 구간) |
| 증명 | proof demo (주장 대신 그 자리에서 확인되는 데모·실측) |
