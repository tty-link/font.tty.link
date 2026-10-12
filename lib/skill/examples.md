# 본보기 — 완성 HTML과 사례 템플릿

목차: [SKILL.md](https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/skills/font-kku-use/SKILL.md)

## 완성 HTML 한 장

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>가을 신메뉴</title>
  <script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/font-kku.min.js" data-fonts="neon sticker"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #fff7ed; color: #1f2937; }
    header { background: #12121c; padding: 48px 24px; text-align: center; }
    .deal { display: inline-block; background: #ffd6e5; padding: 12px 20px; border-radius: 16px; }
    main { max-width: 640px; margin: 0 auto; padding: 32px 24px; }
  </style>
</head>
<body>
  <header><h1 class="font-kku" data-font="neon" data-size="64">가을 신메뉴</h1></header>
  <main>
    <p class="deal"><font-kku font="sticker" size="36">오늘만 1+1</font-kku></p>
    <p>밤 라떼, 고구마 크림 브륄레, 단호박 수프를 새로 선보입니다.</p>
  </main>
</body>
</html>
```

- 네온 제목은 어두운 `header` 위에, 스티커 강조는 색 상자 위에 두었다 — 페이지 전체가 밝아도 글꼴의 바탕 조건을 지킨다.
- 본문 문단은 기기 글꼴 그대로다. 폰꾸는 제목과 강조 한 줄에만 쓴다.

## 사례 템플릿

폰꾸로 만든 완성 페이지다. 주소를 열어 HTML 소스를 본보기로 읽는다. 모두 `https://font.tty.link/examples/` 아래에 있고, 같은 결과를 내는 프롬프트는 `https://font.tty.link/examples/index.json`의 `prompt`에 있다. 목록 화면은 `https://font.tty.link/showcase.html`.

| 파일 | 무엇 | 쓴 글꼴 | 볼거리 |
|---|---|---|---|
| `wedding-invitation.html` | 모바일 청첩장 | `geumbak` `malang` | 이름이 금박 자모로 날아와 조립, 달력·약도·계좌 복사 |
| `neon-sign.html` | 네온 간판 | `neon` | 받침 ㅂ 관 하나만 고장 나 깜빡임, 간판 스위치 |
| `rpg-dialogue.html` | RPG 대화창 | `pixel` | 대사를 두벌식 타자처럼 자모 단위로, 한글 글꼴 없는 기기에서도 같은 도트 |
| `variety-caption.html` | 예능 자막 | `sticker` `saekdong` `retro` | 튀는 스티커 자막, 받침만 늦게 떨어지기, 떨리는 효과음 |
| `picture-diary.html` | 그림일기 | `crayon` `dojang` | 원고지 칸마다 크레용 글자, 초성·중성·받침 색 따로 |
| `dev-meetup-poster.html` | 해커톤 포스터 | `glitch` `blueprint` | 자모마다 갈라지는 글리치 제목, 자모 조립을 짚는 도면 |
| `craft-class.html` | 공방 클래스 | `jasu` `riso` | 실땀 자수 제목, 수틀 속 이름과 실 색 바꾸기 |
| `event-poster.html` | 행사 포스터 | `neon` `sticker` | A4 공연 포스터, 네온 제목과 스티커 딱지 |
| `blog-post.html` | 블로그 글 | `sebul` `gothic` `sticker` | 읽기 폭 680px 글에서 제목·소제목·꿀팁 한 줄만 꾸미기 |
| `slides-cover.html` | 발표 표지 | `saekdong` `gothic` | 16:9 표지와 목차, 초성·중성·받침 짜임 그림 |
| `cafe-menu.html` | 카페 메뉴판 | `chalk` `dojang` `malang` | 칠판 메뉴판, 도장 '추천', 말랑 한 줄 |
| `hangul-class.html` | 한글 학습지 | `saekdong` | 색동 낱말 카드로 자모 짜임, 입력한 낱말 다시 그리기 |
| `game-notice.html` | 게임 공지 | `pixel` `retro` | 도트 창 테두리 공지, 레트로 강조 띠 |
| `certificate.html` | 칭찬 상장 | `gothic` `dojang` | A4 상장, '참 잘했어요' 도장 |

템플릿 소스는 저장소 안에서 런타임을 상대 경로로 부를 수 있다. 가져다 쓸 때는 런타임 `<script>`를 `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/font-kku.min.js`로 바꾼다.
