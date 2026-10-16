# 일반 글꼴 그룹 목록

> Status: Current
> Scope: 현재 일반 글꼴의 짜임 분류를 판단할 때 쓰는 그룹과 범주

이 문서는 엔진이 노출하는 모든 원시 메타데이터를 다 설명하는 문서가 아니다.
목표는 현재 일반 글꼴에서 쓰는 구조 분류 기준을 한 곳에 모아,
어떤 글자가 어떤 짜임에 속하고 어디를 고쳐야 하는지 바로 찾게 하는 것이다.

`profiles/gothic.css`는 의도적으로 이 문서보다 훨씬 단순하다.
그 파일은 `sebul.css`와 같이 바탕 요소 한 블록 + 자리 변수만 사용하고, 여기 적힌 bucket·짜임 키 그룹은 CSS 선택자 표라기보다 현재 구조를 읽는 조회 기준에 가깝다. `profiles/gothic2.css`는 이제 `gothic.css`를 그대로 불러오는 별칭이다.

핵심 원칙은 단순하다.

1. 먼저 `data-fy-layout-bucket`으로 큰 구조를 찾는다.
2. 그다음 `data-layout-key`로 받침 구조를 고른다.
3. 그래도 부족할 때만 묶음 요소와 더 잘게 나뉜 자리 변수를 본다.

## 현재 쓰는 선택자 축

현재 기본 제공 일반 글꼴을 읽을 때 기본으로 보는 축은 아래뿐이다.

- 바탕 요소
  - `data-font="gothic"`
- 글자
  - `data-fy-layout-bucket`
  - `data-layout-key`
  - `data-jung-layout`
  - `data-jong-layout`

즉 현재 일반 글꼴 구조는 `bucket -> layout key -> slot 변수` 순서로 읽으면 된다.
엔진은 묶음 디스패치에 필요한 `data-fy-axis`, `data-fy-open`, `data-fy-jong-count`, `data-fy-role`도 함께 노출한다.

## 1단계. 큰 짜임(layout bucket)

이 단계가 가장 큰 그룹이다.
현재 일반 글꼴은 글자를 아래 6개 bucket으로만 본다.

| bucket | 뜻 | 대표 예시 | bucket이 직접 소유하는 자리 |
| --- | --- | --- | --- |
| `right-open` | 세로모음 · 민글자 | `가`, `저`, `비` | `tl`, `tr` |
| `right-closed` | 세로모음 · 받침 있음 | `한`, `길`, `장`, `밟`, `읽`, `닭` | `tl`, `tr` |
| `bottom-open` | 가로모음 · 민글자 | `오`, `우`, `그` | `t`, `m` |
| `bottom-closed` | 가로모음 · 받침 있음 | `울`, `늘`, `글`, `은`, `웅`, `뜻`, `흙` | `tt`, `mt` |
| `split-open` | 섞임모음 · 민글자 | `과`, `왜`, `외`, `의` | `tl`, `ml`, `tr`, `jung-cluster` |
| `split-closed` | 섞임모음 · 받침 있음 | `왕`, `권`, `획`, `원`, `월`, `횔`, `괅`, `괆` | `ttl`, `mtl`, `ttr`, `jung-cluster` |

중요한 점:

- `울`, `늘`, `글`은 다른 짜임이 아니라 모두 `bottom-closed` 계열이다.
- `장`은 `right-closed` 계열이다.
- `닭`, `밟`, `읽`, `없`도 초중성 기준으로는 같은 `right-closed` 계열이다.

## 2단계. 짜임 키(layout key)

이 단계는 받침 구조로 범위를 더 좁힌다.
같은 bucket 안에서도 민글자·홑받침·겹받침이면 다른 키를 쓴다.

| 짜임 키 | 뜻 | 대표 예시 | 추가로 봐야 하는 자리 | 메모 |
| --- | --- | --- | --- | --- |
| `right:none` | 세로모음 · 민글자 | `가`, `저`, `비` | 없음 | `right-open`만 보면 된다 |
| `right:single` | 세로모음 · 홑받침 | `한`, `길`, `장` | `br` | 종성 자리 하나 |
| `right:double` | 세로모음 · 겹받침 | `닭`, `밟`, `읽`, `없` | `bl`, `br`, `jong-cluster` | 받침 두 부분 |
| `bottom:none` | 가로모음 · 민글자 | `오`, `우`, `그` | 없음 | `bottom-open`만 보면 된다 |
| `bottom:single` | 가로모음 · 홑받침 | `울`, `늘`, `글`, `은`, `웅`, `뜻`, `곡`, `독` | `b` | `울/늘/글`은 같은 짜임 |
| `bottom:double` | 가로모음 · 겹받침 | `흙`, `긁`, `훑` | `bl`, `br`, `jong-cluster` | 하단 겹받침 |
| `split-right:none` | 섞임모음 · 민글자 | `과`, `왜`, `외`, `의` | 없음 | `split-open`만 보면 된다 |
| `split-right:single` | 섞임모음 · 홑받침 | `왕`, `권`, `획`, `원`, `월`, `횔` | `bbr` | 하단 오른쪽 받침 |
| `split-right:double` | 섞임모음 · 겹받침 | `괅`, `괆` | `bbl`, `bbr`, `jong-cluster` | 가장 복잡한 짜임 |

실무적으로는 아래처럼 보면 된다.

- `가`를 고치려면 `right-open`
- `장`을 고치려면 `right-closed` + 필요하면 `right:single`
- `닭`을 고치려면 `right-closed` + `right:double`
- `울`을 고치려면 `bottom-closed` + `bottom:single`
- `흙`을 고치려면 `bottom-closed` + `bottom:double`
- `왕`을 고치려면 `split-closed` + `split-right:single`

## 선택적 묶음 요소

위 두 단계만으로 부족할 때는 복합 모음과 겹받침 묶음 요소를 같이 본다.

| 대상 | 기준 | 역할 |
| --- | --- | --- |
| `jungseong-cluster` | `split-open`, `split-closed` | 복합 모음을 한 덩어리로 이동/축소 |
| `jongseong-cluster` | `right:double`, `bottom:double`, `split-right:double` | 겹받침을 한 덩어리로 이동/축소 |

## 빠른 조회

아래 표는 `site/shape-comparison.html`의 짜임 견본을 실제로 그려진 DOM의 data 속성 기준으로 나눈 것이다.
즉 사람 손으로 붙인 섹션 제목이 아니라 실제 `data-fy-layout-bucket`과 `data-layout-key`를 기준으로 본다.

| 글자 | bucket | 짜임 키 | 먼저 볼 곳 | 그다음 볼 곳 | 메모 |
| --- | --- | --- | --- | --- | --- |
| `가 / 저 / 비` | `right-open` | `right:none` | `right-open` | 없음 | 초성 `tlo`, 중성 `tro`를 본다 |
| `한 / 길 / 장` | `right-closed` | `right:single` | `right-closed` | `right:single` | 초중성은 `tlc/trc`, 홑받침은 `brs` |
| `밟 / 읽 / 없 / 닭` | `right-closed` | `right:double` | `right-closed` | `right:double` | 겹받침은 `blr`, `brd`, `jong-cluster`를 같이 본다 |
| `오 / 우 / 그` | `bottom-open` | `bottom:none` | `bottom-open` | 없음 | 초성 `t`, 중성 `m`만 본다 |
| `늘 / 은 / 웅 / 뜻 / 글 / 울` | `bottom-closed` | `bottom:single` | `bottom-closed` | `bottom:single` | 같은 구조면 같은 그룹으로 본다 |
| `긁 / 흙 / 훑` | `bottom-closed` | `bottom:double` | `bottom-closed` | `bottom:double` | 하단 겹받침 묶음을 함께 본다 |
| `과 / 왜 / 의 / 워 / 위 / 외` | `split-open` | `split-right:none` | `split-open` | 필요하면 복합 모음 묶음 | 초성 `tls`, tail `trs`, base `ml`을 본다 |
| `왕 / 획 / 원 / 월 / 권 / 횔` | `split-closed` | `split-right:single` | `split-closed` | `split-right:single` | 복합 모음 묶음 + 홑받침 `bbrs` |
| `괅 / 괆` | `split-closed` | `split-right:double` | `split-closed` | `split-right:double` | 복합 모음 묶음 + 겹받침 `bbl/bbrd` |

## 일부러 더 나누지 않은 것

현재 일반 글꼴은 아래 방향을 의도적으로 버렸다.

- `family`별 세분화
- `strategy`별 세분화
- 글자별 정확한 변형(exact-variant) 표

즉 지금 기준으로는:

- `울/늘/글`은 같은 그룹
- `장/한/길`은 같은 큰 그룹
- `닭/밟/읽/없`은 같은 큰 그룹
- `과/왜/외/의`는 같은 큰 그룹
- `왕/권/획/원/월/횔`은 같은 큰 그룹

정말 모양 차이가 커서 공통값으로 해결이 안 될 때만,
그 다음 단계로 특정 글자만 고르는 선택자를 추가하는 것이 현재 방향이다.
