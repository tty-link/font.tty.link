# font.tty.link

폰꾸 소개·사례·글꼴·움직임·문서·작업실·비교 페이지의 원본 저장소다. 한글 런타임과 글꼴 제작·검사 모델, 선택형 작업실 UI는 `@tty.link/font-kku` 패키지가 제공한다. 사이트는 font-kku 개발 저장소의 checkout 없이 빌드하고 시험한다.

| 위치 | 역할 |
|---|---|
| `src/` | 사이트 페이지·탐색·사례·페이지 전용 코드 |
| `scripts/` | 오프라인 빌드·링크 검사·배포 미리보기 |
| `tests/` | 사이트 콘텐츠와 브라우저 통합 시험 |
| `dist/` | 배포할 생성물. git에서 제외 |
| `dist/lib/` | 선택한 패키지의 공개 배포 파일 |

## 빌드

Python 3.10 이상, Node.js 18 이상이 필요하다. 의존 버전은 `package.json`에 정확히 고정한다. 공개 패키지를 사용할 때는 `npm install --ignore-scripts`로 설치한 뒤 `npm run build`를 실행한다. 빌드 자체는 네트워크와 npm 명령을 사용하지 않는다.

아직 공개하지 않은 후보는 로컬 tarball 또는 추출한 패키지를 그대로 넣는다. 새 기능이 포함되지 않은 과거 공개본이면 필요한 배포 파일이 없다는 오류로 멈춘다.

```sh
python3 scripts/build.py --package-tarball /path/to/font-kku-candidate.tgz
python3 scripts/build.py --package-dir /path/to/extracted/package --check
python3 -m http.server 8494 --bind 127.0.0.1 --directory dist
```

`--check`는 결과를 메모리에 만들어 모든 페이지의 실제 상대 링크, 사이트 절대 링크와 복사 코드의 jsDelivr 이름·버전·파일을 확인한다. 샘플 코드 속 HTML은 실제 페이지가 불러오는 링크로 취급하지 않는다. 기본 출력은 `dist/`이며 `--out`으로 별도 생성물 폴더를 고를 수 있다. 저장소 루트·상위 폴더·`.git`이 든 폴더·원본 경로는 덮어쓰지 않는다. 재빌드 때 기존 생성물의 추가·수정·삭제를 SHA-256 목록으로 감지하며, `--force`도 확인된 생성물 폴더에만 적용된다.

기존 공개 페이지 주소와 `/lib/` 주소를 유지한다. AI 설명서는 패키지의 `skills/font-kku-use/`를 `/lib/skill/`로 제공한다. 글꼴 작업실 페이지는 사이트 메뉴를 만들고 `FontKkuStudio.mount()`로 패키지의 독립 작업실을 연다. `font`, `src`, `text`와 기존 진입 hash를 전달한다. 기존 프로젝트·초안의 처리는 패키지가 맡는다.

## 검증

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m playwright install chromium
npm test
npm run check
FONT_KKU_JOBS=1 .venv/bin/python -m pytest tests/test_site_smoke.py -q -n 1
```

먼저 패키지로 `dist/`를 빌드한다. Node 콘텐츠 시험도 기본적으로 `dist/lib/`의 런타임을 쓰며 `FONT_KKU_PACKAGE_DIR`로 설치·추출 패키지 위치를 지정할 수 있다. 빌드 보호 시험은 Python 표준 라이브러리만으로 `python3 -m unittest discover -s tests -p 'test_build.py'`를 실행할 수 있다. 특정 화면은 pytest `-k`로 좁혀 실행한다. `FONT_KKU_SITE_DIST`로 빌드 위치를 바꿀 수 있다.

전후 화면 검수는 `scripts/site_preview_check.py`가 맡는다. 공개 사이트에 접속하는 선택형 점검이므로 오프라인 시험과 별도로 실행한다. Chromium·WebKit·Firefox와 Pillow가 필요하다.

```sh
FONT_KKU_JOBS=2 .venv/bin/python scripts/site_preview_check.py \
  --package-tarball /path/to/font-kku-candidate.tgz --only font --match font-studio
```

공개 전에 이 미리보기를 한 번 보고 승인받는다. npm 공개와 사이트 배포 사이에는 같은 미리보기를 다시 돌리지 않는다.

## 패키지 갱신과 배포

패키지 판을 바꿀 때는 `python3 scripts/update_package.py 0.1.5-rc.1`을 실행한다. 이 도구는 `package.json`의 정확한 의존 버전과 `src/`에 있는 CDN 주소·tarball 이름·`data-fk-version`을 함께 고친다. 과거 변경을 설명하는 일반 본문과 저장소 기록은 바꾸지 않는다. `python3 scripts/update_package.py --check`는 불일치를 찾으며, 기존 주소가 이미 섞여 있으면 갱신 전에 멈춘다. 바꾼 버전의 패키지를 설치하거나 로컬 tarball로 전달한 뒤 사이트를 다시 빌드하고 시험한다. npm 레지스트리에 접속하거나 라이브러리 checkout을 읽지 않는다.

후보 tarball 빌드는 로컬 미리보기다. 후보를 시험했다고 npm 공개본과 같아지는 것은 아니다. 외부로 복사하는 예제 주소는 `@tty.link/font-kku@0.1.4-rc.1`의 jsDelivr 주소를 유지하므로, 실제 배포는 그 버전이 npm에 공개된 다음 진행한다.

배포할 때는 npm 레지스트리에서 별도로 받은 동일 버전 tarball을 보관하고 다음처럼 바이트를 대조한다. `--require-published`는 별도 공개본이 없으면 멈추며, 런타임·CSS·글꼴·작업실의 파일 추가·삭제·수정이 하나라도 다르면 실패한다. 문서만 바뀐 패키지 디렉터리를 넣는 것은 허용해 npm 공개 없이 설명서를 갱신하는 기존 흐름을 유지한다.

```sh
python3 scripts/build.py --package-tarball /path/to/font-kku-candidate.tgz \
  --published-tarball /path/to/registry/font-kku-0.1.4-rc.1.tgz --require-published
```

사이트 소스와 배포 결과는 별도 git 브랜치·checkout으로 관리한다. 소스 브랜치는 이 트리를 유지하고, GitHub Pages는 생성물 전용 `gh-pages` 브랜치의 루트를 제공하도록 이전한다. 기존 Pages 브랜치 변경은 사용자 승인 뒤 한 번 수행한다. `src/`를 포함한 소스 checkout을 빌드 출력 대상으로 사용하지 않는다. 원격 CI는 사용하지 않는다.

승인받은 배포 때만 `dist/` 내용을 생성물 전용 checkout에 동기화하고, 변경 내용을 검토해 커밋·push한다. 예를 들어 별도로 만든 배포 checkout에 `rsync -a --delete --exclude .git --exclude .cloudflare --exclude .claude dist/ /path/to/deploy-checkout/`를 쓴다. **배포 checkout이 생성물 전용인지 먼저 확인한다.** 이 단계는 소스와 다른 위치에서 수행하며 빌드 스크립트는 git 작업이나 배포를 자동 실행하지 않는다.

2026-10-16 사용자 승인으로 분리 구현을 로컬 `main`에 병합했다. 작업실 모듈과 패키지 소비 경계는 확정했고, 새 버전 npm 공개·원격 push·배포·Pages 브랜치 변경은 별도 승인 후 진행한다. 현재 원격 사이트와 npm 공개판은 기존 상태다.
