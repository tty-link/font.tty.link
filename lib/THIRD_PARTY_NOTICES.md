# Third-party notices

`font-kku`의 JavaScript, CSS, 도구, companion renderer 소스와 **`profiles/*.svg` 자소판**에는
루트의 [MIT License](LICENSE)가 적용됩니다. 아래에 적은 외부 자산에는 이 MIT License가
적용되지 않습니다.

## 자소판(`profiles/*.svg`)의 출처

기본 제공 그림 자소 글꼴 5종(`sprite-system`, `sprite-example`, `pixel`, `dojang`, `chalk`)의
자소판은 이 저장소가 직접 그린 SVG입니다. `scripts/build_jamo_svg.js`의 획 정의(자모별 중심선)를
`spec/sprite-layout.json`의 자리 상자에 놓아 그리며, 외부 글꼴의 글자 모양을 담지 않습니다
([ADR-011](docs/ADR/ADR-011-svg-jamo-sheets.md)). 자리 상자는 이전 자소판(Apple 기기 글꼴에서
잘라 낸 그림, 2026-10-09 삭제)의 칸 잉크 상자를 잰 수치입니다 — 아래 `sebul`·`gothic` 좌표와
같은 성격의 측정값입니다.

글꼴 파일의 완성 음절에서 자모를 잘라 내는 개발 도구(`scripts/extract_sprite_from_syllables.py`)는
재배포가 허용된 글꼴에만 씁니다. 기본 기준 글꼴은 Noto Sans KR(SIL Open Font License 1.1)이며,
잘라 낸 자소판은 원본 글꼴의 라이선스를 따릅니다. 이 도구의 결과물은 배포물에 들어 있지 않습니다.

`sebul`·`gothic`의 좌표는 J해바라기·Apple SD Gothic Neo 렌더를 실측해 얻은 수치일 뿐
글꼴 데이터를 담지 않으며, 그리기는 방문자 기기에 설치된 글꼴로 합니다. 각 글꼴 이름과
상표는 해당 권리자의 것이며, 이 프로젝트와의 제휴나 보증을 뜻하지 않습니다.

## Runtime asset boundary

배포되는 `font-kku.css`와 `profiles/*.css`는 원격 폰트 URL을 포함하지 않습니다.
CSS 기반 profile은 플랫폼 한글 폰트를 사용하고, sprite profile은 패키지에 포함된
상대 경로 SVG 자소판을 사용합니다. 기본 런타임 때문에 방문자 브라우저가 폰트 CDN에
요청을 보내지는 않습니다.

## Historical J해바라기 reference

sebul의 초기 탈네모꼴 좌표는 J해바라기 완성 음절 렌더와 비교해 교정했습니다.
후속 cmap·브라우저 실측에서 해당 WOFF2 subset에는 conjoining jamo(U+1100)가 없어,
당시에도 조합 자모 자체는 시스템 폰트로 fallback했음이 확인됐습니다. 일부 개발용
`scripts/glyph_*.py`는 과거 완성 음절 비교를 재현하도록 `JSunflower`를 명시적으로
선택했을 때만 아래 jsDelivr WOFF2를 불러올 수 있습니다. 이 스크립트와 폰트 파일은
npm 배포물 및 브라우저 런타임에 포함되지 않습니다.

- `https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2110@1.0/`

같은 측정 하네스는 `python scripts/glyph_fit_lib.py webfonts --fetch`를 명시적으로 실행할 때만
Noto Sans KR(SIL Open Font License 1.1, © Adobe) OTF를 아래 주소에서 `tmp/webfonts`(git 미추적)로
받습니다. 자소판 추출·비교 기준으로만 쓰며 배포물에는 들어 있지 않습니다.

- `https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/Sans/SubsetOTF/KR/`

J해바라기를 명시적으로 사용하는 실험 결과나 파생 자산을 배포하려면 폰트 파일의
라이선스와 재배포 조건을 해당 권리자·배포 원문에서 별도로 확인해야 합니다. 이
저장소의 MIT License가 해당 외부 폰트에 적용되는 것은 아닙니다.
