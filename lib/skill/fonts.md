# 글꼴 고르기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

`font`(클래스 방식은 `data-font`)에 이름을 준다. 비우면 세벌식(아래 「배치」)이다. 모양을 직접 보려면 `https://font.tty.link/fonts.html`.

| `font` | 이름 | 분위기 | 바탕 | 어울리는 곳 |
|---|---|---|---|---|
| (비움) | 세벌식 | 받침 없는 글자는 아래가 비고 받침 있는 글자는 칸을 다 쓰는 탈네모, 짜임마다 다듬은 자리 | 아무 바탕 | 기본값, 한글 원리가 보이는 제목·본문 |
| `jikgyeol` | 직결식 | 세벌 타자기처럼 자모마다 어느 글자에서나 한 자리, 아래 끝이 들쭉날쭉한 탈네모 | 아무 바탕 | 타자기 느낌 제목, 0.1.1–0.1.3의 기본 모양 |
| `sebul` | 세벌 | 둥근 탈네모꼴, 경쾌함(문맥 배치) | 아무 바탕 | 포스터 제목 |
| `gothic` | 고딕 | 단정한 네모꼴 | 아무 바탕 | 공지·배너 |
| `neon` | 네온 | 빛나는 관, 밤거리 | **어두운 바탕 필수** | 바·공연·이벤트 |
| `sticker` | 스티커 | 흰 테두리 컬러 조각, 다꾸 | **색 바탕**(흰 바탕이면 테두리가 안 보임) | 굿즈·이벤트·SNS |
| `retro` | 레트로 | 노랑+입체 그림자, 70~80년대 | 밝은 바탕 | 레트로 포스터·게임 |
| `saekdong` | 색동 | 초성·중성·받침마다 다른 색 | 밝은 바탕 | 어린이·한글 교육·명절 |
| `malang` | 말랑 | 자모가 살짝 기울어진 손맛 | 아무 바탕 | 카페·디저트·귀여운 공지 |
| `pixel` | 도트 | 픽셀 아트 | 밝은 바탕 | 게임·레트로 IT |
| `dojang` | 도장 | 붉은 인주, 종이결 | 종이색 밝은 바탕 | 인증·칭찬·전통 |
| `chalk` | 분필 | 흰 분필 가루 | **어두운 녹색·검정 바탕 필수** | 학교·메뉴판·공지 |
| `geumbak` | 금박 | 자모마다 다른 금빛, 눌러 찍은 금박 | 어두운 바탕 권장(밝은 바탕도 읽힘) | 명절·청첩장·시상 |
| `glitch` | 글리치 | 자모마다 다른 방향의 청록·자홍 어긋남 | **어두운 바탕 필수** | 게임·IT 행사·음악 |
| `riso` | 리소 | 분홍·파랑 두 잉크 인쇄, 판 어긋남 | 종이색 밝은 바탕 | 독립출판·포스터·전시 |
| `blueprint` | 도면 | 속 빈 선 글자, 자모 역할마다 선 색 | **파란 도면 바탕 필수** | 개발·건축·교육 |
| `crayon` | 크레용 | 밀랍 질감, 자모마다 다른 크레용 색 | 밝은 바탕 | 그림일기·어린이·초대장 |
| `jasu` | 자수 | 둥근 실땀으로 수놓은 획 | 천(리넨)·밝은 바탕 | 공방·수공예·선물 |
| `pilgi` | 필기 | 획마다 살짝 흔들리고 오른쪽으로 기운 손글씨 | 밝은 바탕 | 메모·일기·친근한 공지 |
| `dunggeun` | 둥근 | 굵고 둥근 끝, 둥글린 모서리 | 밝은·분홍 바탕 | 어린이·카페·UI 배지 |
| `butgeul` | 붓 | 누르며 들어가 빼며 나가는 붓 획 | 종이색 밝은 바탕 | 붓글씨 제목·전통·초대장 |

그 밖에 `sprite-system`(검정 획 그림 자소)은 직접 그리는 그림 자소 글꼴의 바탕이다 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md).

## 배치 — 세벌식(기본)·직결식과 문맥 배치

`font`를 주지 않으면 **세벌식**이다. 초성·중성·종성을 짜임마다 정해진 자리와 크기로 찍는다.
- 짜임은 모음 모양(세로 ㅏ·ㅓ·ㅣ…, 가로 ㅗ·ㅜ·ㅡ…, 합자 ㅘ·ㅢ…) × 받침(없음·홑·겹)이다. 같은 짜임의 같은 자모는 어느 글자에서나 같다.
- 받침 없는 글자는 아래를 비워 두고, 받침 있는 글자는 칸 높이를 다 쓴다(세벌식 탈네모).
- 가로 모음 글자는 초성을 막대 가운데에, 받침을 초성과 한 축에 둔다. 세로 모음 글자는 받침을 오른쪽 아래에 둔다.
- 원소·기기 글꼴·그림 세트 어느 재료로도 같은 배치다.

`font="jikgyeol"`은 **직결식**이다. 세벌 타자기처럼 같은 역할의 같은 자모를 어느 글자에서나 같은 자리와 크기로 찍는다(가·고·과·각·곽의 ㄱ이 모두 같다). 받침 자리는 늘 비워 두고, ㅘ는 ㅗ와 ㅏ를 겹쳐 찍는다. 0.1.1–0.1.3에서 글꼴을 비운 글의 모양이 이것이다.

`font="sebul"`처럼 글꼴을 밝히면 그 글꼴의 문맥 배치다. 모음과 받침에 따라 자리·크기가 바뀌고, 글자 덩어리가 더 꽉 찬다.

| 쓰는 법 | 배치 |
|---|---|
| `<font-kku>한글</font-kku>` | 세벌식(기본) |
| `<font-kku font="jikgyeol">한글</font-kku>` | 직결식 |
| `<font-kku font="sebul">한글</font-kku>` | 세벌 문맥 |
| `<font-kku font="gothic">한글</font-kku>` | 고딕 네모꼴 |

꾸러미 칠을 세벌식에 얹으려면 글꼴 대신 꾸밈 클래스를 쓴다: `<font-kku class="kku-look-neon">`(확장 `data-addons="looks"`).

- **0.1.0으로 만든 페이지:** 0.1.1에서 둘이 바뀌었다 — 글꼴을 밝히지 않은 `<font-kku>`가 세벌 고정(지금 직결식 `jikgyeol`)이 되었고, `sebul`·`gothic`·`malang`(과 글꼴을 비운 글)이 자모를 기기 한글 글꼴 대신 CSS 획(아래 「재료」의 원소)으로 긋는다. 예전 배치는 `font="sebul"`, 예전 모양까지는 `font="sebul"`에 페이지 CSS `--fy-face: device`를 더한다(그러면 `text-shadow`·`--fy-weight`도 다시 듣는다). 꾸러미 글꼴(`neon`·`sticker` …)은 전처럼 기기 글꼴로 그린다.
- **0.1.3까지 글꼴을 비운 페이지:** 0.1.4에서 기본 배치가 세벌식으로 바뀌었다. 예전 모양(직결식)은 `font="jikgyeol"`을 적는다.
- 지금 배치는 `FontKku.fontInfo(host).layout`(세벌식이면 `{ profile: "sebul-cases-v1", model: "case-fixed", … }`, 직결식이면 `"sebul-fixed-v1"`, 문맥 배치면 `null`)으로 본다.
- 페이지 CSS가 이웃 자모를 보고 자모를 옮기면 고정 배치가 깨진다. `FontKku.layoutStability(host)`가 `stable: false`와 어긋난 자모(`drifted`)를 알려 준다.
- 디자인 JSON에서도 배치를 고른다(`layout`, 실험 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)「디자인」).

## 짓는 방식 — 글자를 몇 덩이로, 무엇으로 짓나

**고르지 않아도 된다.** 아무것도 적지 않으면 그 글꼴 모양대로 짓는다(지금 출력 그대로). 다르게 짓고 싶을 때만 CSS 한 줄로 고른다.

```html
<font-kku style="--fy-composition: syllable" size="64">화요일</font-kku>
```

| 값 | 화 | 뜻 |
|---|---|---|
| `auto`(기본) | 모양대로(세벌식: ㅎ + ㅗ + ㅏ) | 그 글꼴 모양의 기본 |
| `syllable` | 호 + ㅏ | 섞임 모음 글자(ㅘ·ㅚ·ㅢ …)를 받침 없는 머리 음절과 뒤 모음으로 |
| `whole` | ㅎ + ㅘ | 겹모음·겹받침을 통째로 한 덩이 |
| `jamo` | ㅎ + ㅗ + ㅏ | 자모를 하나씩(겹받침도 ㄹ + ㄱ) |
| `pieces` | (ㅗ+ㅇ) + ㅗ + ㅏ | 자모도 다른 자모 조각으로(ㅎ = ㅗ + ㅇ, ㄲ = ㄱ + ㄱ, ㅋ = ㄱ + 획) |
| `origins` | (ㆍ+ㅡ+ㅇ) + (ㆍ+ㅡ) + (ㅣ+ㆍ) | 원형 8과 천지인까지 내려가 짓기 |

- 페이지 CSS(`--fy-composition`)가 글꼴 CSS(`--fy-font-composition`)를 이긴다. 디자인 JSON에도 `composition`으로 적는다([draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)「디자인」).
- **세세하게(선택):** 축을 따로 고르려면 깊이 변수를 쓴다 — `--fy-vowel-depth: split | whole | syllable`, `--fy-coda-depth: split | whole`. 한 계층 안에서는 이 낱 깊이가 프리셋을 이기고, 프리셋이 줄임 `--fy-jamo-depth`를 이긴다. 자모 하나만 다른 조립식으로 지으려면 디자인 규칙(`apply.recipe`)을 쓴다 — 늘 프리셋을 이긴다.
- 고른 결과는 바탕 요소의 `data-fy-composition`(축을 섞었으면 `custom`)과 `FontKku.fontInfo(host).composition`으로 본다.
- 못 짓는 경우는 몰래 바꾸지 않고 `data-fy-composition-status`로 알린다: 기기 글꼴 글자(꾸러미 글꼴, `--fy-face: device` — 글꼴 팔레트 디자인을 걸면 짓는다)와 그림 자소판 글꼴은 `pieces`·`origins`를 못 지어 `COMPOSITION_UNSUPPORTED`(나누기만 따른다), 옛한글 글자에는 아직 걸지 않아 `COMPOSITION_OLD_HANGUL`, 모르는 값은 `COMPOSITION_INVALID`.
- 네모꼴 글꼴(`sebul`·`gothic` 등을 밝힌 글)에서 그 글꼴 기본이 아닌 나누기를 고르면, 런타임이 조각을 기본 나누기의 자리에 맞춘다. 글꼴 CSS가 그 자리 값을 밝혔으면 그것이 이기고, `--fy-split-fit: none`이면 맞추지 않는다.
- 정적 렌더러(`render_html`)도 `composition`을 받는다 — 나누기는 같고, `pieces`·`origins`는 기본 획 그대로 `COMPOSITION_UNSUPPORTED`([terminal.md](https://font.tty.link/lib/skill/terminal.md)).

## 재료 — 세벌·고딕 계열과 그림 자소

- **세벌·고딕 계열**: `sebul`·`gothic`·`malang`과 칠을 얹은 꾸러미 `neon`·`sticker`·`retro`·`saekdong`·`geumbak`·`glitch`·`riso`·`blueprint`. 배치는 CSS가 정하고 자모를 무엇으로 그릴지 고른다(재료).
  - **원소(기본)**: `sebul`·`gothic`·`malang`과 글꼴을 밝히지 않은 글은 자모를 CSS 획으로 긋는다 — 받는 파일 없이 어느 기기에서나, 한글 글꼴이 없어도 같은 모양(낱자 `ㅋㅋ`·`ㅘ`도 획으로). 획이 촘촘한 자모(ㄹ·ㅌ·겹받침)는 작은 글씨에서 틈이 열리게 획을 조금 가늘게 긋는다. 굵기 `--fy-element-width`(바탕 요소 글자 크기 기준, 예 `0.12em`), 끝 `--fy-element-cap: round`. 칠은 글자 칠과 다르다 — 그림자·테두리·속 빈 획은 [custom-font.md](https://font.tty.link/lib/skill/custom-font.md)의 재료 표.
  - **기기 글꼴**: 페이지 CSS `--fy-face: device` — 방문자 기기의 한글 글꼴을 같은 자리에 맞춰 그린다(다듬은 획, 기기마다 조금 다름). 꾸러미 글꼴은 글자 칠(외곽선·그림자)이 정체라 이것이 기본이고, 한글 글꼴이 없는 기기에서는 네모(두부)로 보인다. 같은 칠을 원소로 쓰려면 `sebul` + `class="kku-look-neon"`.
  - **그림 세트**: `jamo-set="pilgi-box"`(필기)·`"dunggeun-box"`(둥근)·`"butgeul-box"`(붓) 또는 직접 그린 세트 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)「세벌·고딕에 그림 세트 걸기」.
  - **글꼴 팔레트(실험)**: 페이지가 실어 둔 여러 한글 글꼴을 역할·자모·조각마다 섞는다 — 디자인 `mode: "font"`, 예와 규칙은 [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)「디자인」. 폰꾸는 글꼴 파일을 받지 않는다. 그 글꼴에 한글이 없으면 기본 한글 글꼴로 그려지고 `FontKku.traceOf(host)`가 `identity: "fallback-suspected"`로 알린다.
- **그림 자소 재료**: `pixel`·`dojang`·`chalk`·`crayon`·`jasu`·`pilgi`·`dunggeun`·`butgeul`·`sprite-system`. 직접 그린 자모 그림으로 조립해 어느 기기에서나 같은 모양이다 — [no-hangul-device.md](https://font.tty.link/lib/skill/no-hangul-device.md).

## 꾸러미 글꼴과 색

- `neon`·`sticker`·`geumbak`·`glitch`·`retro`·`saekdong`·`riso`·`blueprint`는 칠만 다른 **꾸러미 글꼴**이다 — 같은 칠을 꾸밈(`class="kku-look-neon"` 등)으로 다른 글꼴에도 걸 수 있다([compose.md](https://font.tty.link/lib/skill/compose.md)).
- `pilgi`·`dunggeun`·`butgeul`은 `color`가 그대로 먹색이 된다.
- `crayon`은 역할 색(초성 빨강·중성 파랑·받침 초록)이 정해져 있어 `color`는 초성만 바꾼다 — 중성·받침은 `[part~="jungseong"]`·`[part~="jongseong"]`의 `color`로 바꾼다([styling.md](https://font.tty.link/lib/skill/styling.md)).
- 씨앗에 반응하는 글꼴(`malang`·`crayon`·`chalk`·`jasu`·`sticker`·`glitch`)은 `seed`와 `jamo-seeds`를 주면 자모마다 조금씩 달라진다(styling.md).

## 고르는 요령

- 한 페이지에는 2~3종까지만 쓴다. 제목 하나, 강조 하나가 보통이다.
- 바탕 조건을 먼저 본다. 어두운 바탕이 필요한 글꼴을 밝은 페이지에 쓰려면 그 제목만 어두운 띠(`header` 배경 등) 위에 둔다.
- 영문·숫자·문장부호는 폰꾸가 조립하지 않고 기기 글꼴로 나온다. 한글이 주인공인 문구를 고른다.
