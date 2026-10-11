# 글꼴 고르기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

`font`(클래스 방식은 `data-font`)에 이름을 준다. 모양을 직접 보려면 `https://font.tty.link/fonts.html`.

| `font` | 이름 | 분위기 | 바탕 | 어울리는 곳 |
|---|---|---|---|---|
| `sebul` | 세벌 | 둥근 탈네모꼴, 경쾌함 | 아무 바탕 | 기본값, 포스터 제목 |
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

## 재료 — 기기 글꼴과 그림 자소

- **기기 글꼴 재료**: `sebul`·`gothic`과 그 위에 칠을 얹은 `neon`·`sticker`·`retro`·`saekdong`·`malang`·`geumbak`·`glitch`·`riso`·`blueprint`. 방문자 기기의 한글 글꼴로 자모를 그려 가볍다. 한글 글꼴이 없는 기기에서는 네모(두부)로 보인다.
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
