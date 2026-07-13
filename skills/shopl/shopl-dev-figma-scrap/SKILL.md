---
name: shopl-dev-figma-scrap
description: Use when the user provides a Figma URL and asks to scrape, extract, or capture a Figma document into local docs — especially when one page mixes PRD, requirements, and many sibling screen states, guides, modals, or panels that are easy to miss. Focus on exhaustive raw capture artifacts, not derived requirements markdown generation.
---

# Figma 통합 기획서 스크랩 스킬

> Figma는 단순한 디자인 도구가 아니라 **정책(PRD) + 요구사항(FR) + 와이어프레임(UI)** 이 함께 있는 **통합 기획서**입니다.
> 이 스킬은 그 내용을 빠짐없이 **스크린샷 중심으로 스크랩**하는 데 집중합니다.
> **기본 사용자 산출물은 `01_policy/`, `02_wireframes/`, `index.md`** 이며, 스크랩 결과를 바탕으로 별도의 요구사항 md 문서를 대량 생성하는 것은 기본 목적이 아닙니다.
> frame inventory, capture manifest, completeness checklist 같은 검증 산출물은 **내부 검증용**입니다. 파일로 남겨야 한다면 `scrap/_meta/` 아래에 두고, 사용자에게 기본 노출되는 산출물로 취급하지 마세요.

---

## HARD GATE — 대표 캡처 금지

**대표 화면 몇 장만 저장하고 완료 선언하면 실패입니다.**

스크랩 완료의 정의는 아래 둘 중 하나뿐입니다.

1. **캡처 대상(eligible) frame 을 100% 저장했다.**
2. **저장하지 않은 frame 은 모두 제외 사유가 기록되어 있다.**

다음은 모두 실패입니다.

- “대표 화면만 뽑았다”
- “비슷해 보여서 하나만 저장했다”
- “식별은 했지만 캡처는 안 했다”
- “overview 만 저장하고 child state 는 생략했다”
- “모달/가이드/패널 예시는 메인 화면에 포함되니 생략했다”

**완료 전에 반드시 `completeness-checklist.md` (보통 `_meta/` 아래) 를 따라 전수 대조를 수행하세요.**

---

## 코어 원칙

### 원칙 1: Figma는 세 레이어로 구성된 기획서지만, 스크랩 산출물은 두 버킷에 집중한다

```text
Layer 1: Policy (정책)        — PRD, 배경, 목표, 문제 정의, 변경 이력
Layer 2: Requirements (요구사항) — FR Description, 요구사항 테이블, 기능 명세
Layer 3: Wireframes (화면 설계)  — Mobile 화면, Dashboard 화면, Modal, Flow
```

레이어 간 관계: **Policy → Requirements → Wireframes**

하지만 스크랩 출력은 아래 두 버킷으로 정리합니다.

```text
Bucket A: 01_policy      — 정책/요구사항/가이드 등 문서형 frame 스크린샷
Bucket B: 02_wireframes  — 화면/상태/모달/패널/예시 frame 스크린샷
```

즉, **요구사항 frame 도 별도 md 재구성보다 우선적으로 스크린샷으로 보존**합니다.

### 원칙 2: 하나의 스크린샷 = 하나의 독립된 정보 단위

- `section` 단위 캡처 금지 (예외 fallback 제외)
- **frame 단위로 캡처**
- **개별 frame 의 원본 크기 보존**
- Description 패널이나 요구사항 frame 도 **최종 산출물은 스크린샷 저장이 기본**
- `get_design_context()` 는 이해 보조용으로는 쓸 수 있지만, **별도 requirements md 생성이 기본 산출물은 아님**

### 원칙 3: overview / guide / state / modal 도 각각 독립 정보다

다음은 **모두 별도 캡처 대상**입니다.

- 메인 화면 overview
- 같은 기능의 다른 상태 화면
- guide/spec frame
- 모달 / 팝업 / 도움말 / confirm / compact variant
- 패널 예시 / 클러스터 예시 / dropdown 예시
- 구성원 현황 / 상세 테이블 / 컬럼 설명 화면

즉, **child frame 이 있다고 해서 parent overview 를 생략하면 안 되고, parent overview 를 저장했다고 해서 child state 를 생략해도 안 됩니다.**

### 원칙 4: 중복 제거는 nodeId 기준으로만 한다

- **같은 nodeId** 이고 같은 frame 이 여러 곳에 instance 로 보이면 첫 번째만 저장 가능
- 이름이 비슷하다는 이유로 합치면 안 됨
- 상태가 비슷하다는 이유로 합치면 안 됨
- 모달 제목이 같아도 nodeId 가 다르면 **별도 캡처** 대상

### 원칙 5: 식별과 완료는 다르다

- “metadata 에서 봤다” = 식별
- “파일로 저장했다” = 캡처
- “왜 안 저장했는지 기록했다” = 제외

**식별만 하고 캡처/제외 정리를 안 했으면 완료가 아닙니다.**

### 원칙 6: 플랫폼 버킷은 이름이 아니라 UI 근거로 분류한다

플랫폼 분류는 `01_mobile / 02_dashboard / 03_modal` 중 하나로 정리하되, **frame 이름의 느낌이나 임의 추정으로 넣지 말고 실제 UI 증거로 판정**합니다.

| 분류 | 넣는 기준 | 대표 근거 |
|------|-----------|----------|
| `01_mobile` | 실제 모바일 화면일 때만 | phone/device frame, iOS/Android 라벨, status bar, bottom tab, 좁은 1열 모바일 레이아웃 |
| `02_dashboard` | 실제 웹 대시보드/웹 콘솔 화면일 때 | side navigation, top bar, 넓은 다단 레이아웃, table/grid, filter bar, map panel |
| `03_modal` | 독립 모달/팝업/confirm/help frame | modal title/body/footer 조합, overlay, 팝업 변형 |

**강제 규칙:**
- `01_mobile/` 을 **비모달 wireframe의 기본 버킷으로 쓰면 실패**입니다.
- 모바일 근거가 없고 웹 대시보드 근거가 명확하면 **반드시 `02_dashboard/`** 로 분류합니다.
- `일간 메인`, `상세`, `조회 항목 설정` 같은 이름만으로는 모바일 판정을 하면 안 됩니다.
- 전부 웹 화면인 기획서라면 `01_mobile/` 디렉토리를 만들지 않습니다.
- 플랫폼이 애매하면 성급히 `01_mobile/` 로 넣지 말고 ledger 에 `platform-needs-review` 메모를 남긴 뒤 재판단하세요.

### 원칙 7: 사용자 산출물과 내부 검증 산출물을 분리한다

- 사용자가 바로 보는 기본 산출물은 **`01_policy/`, `02_wireframes/`, `index.md`** 입니다.
- frame inventory, capture manifest, completeness checklist, exclusion ledger 는 **전수검사와 재검증을 위한 내부 산출물** 입니다.
- 내부 검증 파일을 남겨야 하면 `scrap/_meta/` 아래에 모읍니다.
- `scrap/` 루트는 사용자용 스크린샷 버킷과 `index.md` 중심으로 유지합니다.
- 내부 검증 파일은 공유/인계 시 생략 가능하다는 전제를 분명히 하세요.
- `.claude_figma_candidates.json`, `.claude_figma_inventory.tsv`, `.claude_figma_manifest.json` 같은 **repo 루트 helper 파일은 산출물이 아니라 임시 작업 파일** 입니다.
- 이런 helper 파일을 만들었다면 완료 전에 **반드시 삭제**하세요. `scrap/_meta/` 로 승격하지도 말고, 사용자 산출물로 설명하지도 마세요.

---

## 디렉토리 구조

```text
docs/{기획서_타이틀}/
└── scrap/
    ├── index.md              ← 사용자용 인덱스 문서
    ├── 01_policy/            ← 사용자용 정책/요구사항/가이드 스크린샷
    ├── 02_wireframes/
    │   ├── 01_mobile/        ← 실제 모바일 화면이 있을 때만 생성
    │   ├── 02_dashboard/     ← 실제 웹 대시보드 화면이 있을 때만 생성
    │   └── 03_modal/
    └── _meta/                ← 선택적 내부 검증 산출물 (ledger / manifest / checklist)
```

> **중요:** 기본 사용자 산출물은 `index.md`, `01_policy/`, `02_wireframes/` 입니다.
> 
> **중요:** `_meta/` 는 선택적입니다. frame inventory, capture manifest, completeness checklist 같은 내부 검증 파일이 필요할 때만 생성하세요.
>
> **중요:** 검증 파일을 남긴다면 가급적 `_meta/` 아래에 두고, 사용자가 직접 소비하는 기본 산출물로 설명하지 마세요.
>
> **중요:** 기본 산출물에는 `02_requirements/` 디렉토리를 만들지 않습니다. 요구사항 frame 이 있어도 스크랩은 **01_policy 스크린샷**으로 남깁니다.
>
> **중요:** `01_mobile/` 은 기본값이 아닙니다. 모바일 근거가 없는 웹 대시보드 기획서라면 `02_wireframes/02_dashboard/` 만 사용하고 `01_mobile/` 은 만들지 마세요.
>
> **중요:** empty bucket 금지. 실제 eligible frame 이 있는 플랫폼 디렉토리만 생성하세요.

---

## Figma Frame 네이밍 패턴 인식 가이드

Figma의 frame 이름을 보고 **어떤 레이어**인지 식별합니다.

| 패턴 | 레이어 | 캡처 방법 | 저장 위치 예시 |
|------|--------|-----------|------|
| `[PRD]` | Policy | get_design_context() 참고 + 스크린샷 | `01_policy/` |
| `Changelog` / `[Update]` | Policy | 스크린샷 | `01_policy/` |
| `NN-policy-*` | Policy | 스크린샷 + 필요 시 get_design_context() | `01_policy/` |
| `[Requirements]` | Requirements | 스크린샷 (크면 내부 frame 분할 가능) | `01_policy/` |
| `[FR-0N] Description` | Requirements | 스크린샷, 필요 시 text 확인용 get_design_context() | `01_policy/` |
| `요구사항 테이블` | Requirements | 스크린샷 | `01_policy/` |
| `회사 설정 > ...` | Wireframes | 개별 스크린샷 | `02_wireframes/...` |
| `[Modal XS]` | Wireframes | 개별 스크린샷 | `02_wireframes/03_modal/` |
| `[ConfirmModal]` | Wireframes | 개별 스크린샷 | `02_wireframes/03_modal/` |

> 위 패턴은 **분류 힌트**일 뿐입니다.
> 패턴 하나당 대표 frame 하나만 저장하라는 뜻이 아닙니다.

---

## 무엇이 캡처 대상(eligible)인가?

### 반드시 캡처해야 하는 것

아래에 하나라도 해당하면 **eligible** 입니다.

1. **정책/문서 frame**
   - PRD
   - changelog / update history
   - `NN-policy-*`
   - requirements table / description / guide 성 문서 frame

2. **화면-level overview frame**
   - 상위 screen composition
   - overview + guide 가 함께 있는 large frame
   - child frame 들을 묶어 전체 컨텍스트를 보여주는 frame

3. **독립 상태 frame**
   - 일간/월간/상세/지도 같은 메인 상태
   - commute / schedule / attendance / anomaly 같은 탭/상태 분기
   - empty / filled / filtered / selected / multi / cluster / panel variant

4. **모달 / 팝업 / 도움말 / 드롭다운 예시 frame**
   - 작은 frame 이어도 독립 정보가 있으면 eligible
   - compact variant 도 eligible
   - example dropdown / example panel 도 기획 의도가 있으면 eligible

5. **가이드 / spec frame**
   - 화면 설명용 긴 문서 frame
   - 컬럼 설명 / 패널 가이드 / 조작 가이드 / 설정 가이드

### 제외 가능한 것

아래는 **excluded 가능** 합니다. 단, 제외 사유 기록이 필요합니다.

- `section`
- 반복되는 side navigation shell
- 의미 없는 wrapper (`body`, unnamed container)
- 익명 atomic fragment
- dropdown 내부의 순수 시각 파편
- 동일 nodeId instance 중복

### 주의

다음은 excluded 로 오판하기 쉽지만 **대개 eligible** 입니다.

- `Frame 427321947` 같은 overview header frame
- child 를 포함한 큰 overview frame
- 같은 기능의 다른 상태를 보여주는 panel example
- 구성원 현황 / 상세 테이블 / 컬럼 설명용 보조 문서 frame
- 지도 패널 기본 / 다중 케이스 예시

### 독립 기획 의도 판별 기준

작은 frame 이라도 아래 중 하나면 **eligible** 로 본다.

- 이름이 상태/예시/가이드/패널/드롭다운/모달 역할을 설명한다
- user-facing text, 표, 가이드 문장, 버튼 조합이 들어 있다
- 단독으로 스크린샷을 봐도 “하나의 예시 상태”로 읽힌다
- 인접한 guide/spec 문서가 그 frame 을 별도 예시로 설명한다
- 같은 family 안에서 default / compact / multi / cluster / selected 같은 변형 중 하나다

반대로 아래를 모두 만족해야만 `atomic-fragment` 또는 `anonymous-wrapper` 로 제외할 수 있다.

- standalone 제목/역할명이 없다
- 별도 상태/예시/문맥을 전달하지 않는다
- 상위 eligible frame 의 시각 파편일 뿐이다
- 그 조각이 빠져도 문서/기획 해석이 달라지지 않는다

판단이 애매하면 **캡처 쪽으로 보수적으로 선택**하세요.

---

## 워크플로우

### Phase 0: 사전 준비

1. Figma URL 에서 `fileKey`, `nodeId`, `title` 추출
2. `get_metadata(fileKey)` 로 페이지 목록 조회
3. 출력 경로 결정

```text
docs/{title}/scrap/
```

4. **전수검사 ledger 준비**
   - `completeness-checklist.md` (보통 `_meta/` 아래) 의 ledger 형식 또는 동등한 ledger 형식 사용
   - ledger / checklist / manifest 를 파일로 남기면 `scrap/_meta/` 아래에 둔다
   - repo 루트에 `.claude_figma_*` 같은 helper 파일을 만들었다면 최종 산출물로 남기지 않는다
   - frame inventory 없이 캡처부터 시작하지 말 것

---

### Phase 1: 문서형 레이어 스크랩 (Policy + Requirements docs)

찾을 것:

1. `[PRD]`
2. `Changelog` / `[Update]`
3. `NN-policy-*`
4. `[Requirements]`
5. `[FR-0N] Description`
6. `요구사항 테이블`
7. guide 성 문서 frame

**중요:** 문서형 frame 은 metadata 전체를 스캔해 **policy / requirements / guide 패턴에 맞는 frame 전부**를 수집합니다.

**캡처 방법:**
- 보통 `width=1000`, `height=2000~5000`
- width 유지가 깨지지 않도록 `maxDimension=4096` 이상 우선 검토
- width 90% 미만이면 상향 재시도
- 필요하면 `get_design_context()` 로 내용을 이해하되, **최종 산출물은 `01_policy/` 스크린샷 저장이 기본**
- **스크랩 결과를 바탕으로 별도 requirements md 디렉토리를 기본 생성하지 않음**

---

### Phase 2: 와이어프레임 레이어 스크랩 (Wireframes)

#### 2-0. 플랫폼 판별 (필수)

eligible wireframe 을 캡처하기 전에 **각 frame 의 플랫폼부터 판별**합니다.

1. 각 eligible wireframe 에 `mobile / dashboard / modal` 중 하나의 target bucket 을 먼저 부여합니다.
2. 플랫폼 판별은 **실제 UI 구조**로 합니다. 이름, 섹션 위치, "메인" 같은 단어만으로 결정하지 않습니다.
3. 아래 중 하나라도 보이면 `dashboard` 우선 판정합니다.
   - side navigation
   - top filter bar / 검색 바 / 다단 툴바
   - 넓은 table / grid / column layout
   - map panel / desktop-style split layout
   - 가로가 넓은 웹 콘솔 화면
4. 아래 중 하나라도 보이면 `mobile` 판정합니다.
   - phone/device frame
   - status bar / bottom tab / mobile header
   - iOS / Android 명시
   - 좁은 1열 모바일 레이아웃
5. **모바일 증거가 없으면 `01_mobile/` 을 만들지 마세요.** 웹 화면만 있는 기획서는 `02_dashboard/` 만 사용합니다.
6. 애매하면 `mobile` 로 기본 배치하지 말고 ledger 에 판별 보류 메모를 남긴 뒤 재확인합니다.

#### 2-1. 전수 식별

metadata 에서 아래 조건의 frame 을 모두 모읍니다.

- `frame` 타입
- width/height 가 의미 있는 수준 (`>= 200×200` 는 **기본 스크리닝값**일 뿐, 더 작아도 독립 기획 의도가 있으면 포함)
- 이름이 의미 있거나, 이름이 generic 이어도 **screen-level composition** 이면 포함
- `상세 기획` 같은 dense section 내부의 sibling state / modal / guide / panel example 포함
- **상위 overview/frame 을 eligible 로 분류했다면 descendant 를 재귀적으로 훑어서 의미 있는 child frame 이 남지 않을 때까지 ledger 에 추가**

#### 2-2. 대표 캡처 금지 규칙

**아래는 모두 별도 캡처 대상입니다.**

- overview parent
- child main state
- child guide/spec
- child modal/popup/help
- same-family state variation
- panel example
- cluster example
- dropdown example

즉,
- parent 캡처했다고 child 생략 금지
- main state 캡처했다고 guide 생략 금지
- default panel 캡처했다고 multi panel 생략 금지
- 모달 하나 저장했다고 compact modal 생략 금지

#### 2-3. 크기별 maxDimension

| Frame 특징 | maxDimension | 근거 |
|:----------:|:------------:|:----:|
| width < 500, height < 1000 | 2048 | 작은 modal/popup |
| width 500~1440, height > 1200 | 4096 이상 검토 | height 기준 축소로 width 손실 가능 |
| width > 1440, height > 1200 | 4096 이상 검토 | 넓고 긴 화면 |
| width ≤ 1440, height ≤ 1200 | 2048 | 일반 화면 |
| width > 2000 | 4096 이상 우선 | 초광폭 / overview |

#### 2-4. 해상도 검증

- `get_screenshot()` 결과의 `width / original_width >= 0.9` 확인
- 90% 미만이면 `maxDimension` 상향 재시도
- 긴 문서는 width 유지가 우선

#### 2-5. nodeId 오류 대처

- frame nodeId 실패 시 parent section/frame 으로 fallback 가능
- 하지만 fallback 시에도 **원래 실패한 frame 이 무엇이었는지 ledger 에 남겨야 함**
- **fallback 이미지가 원래 child frame 의 내용을 실제로 포함하는지 확인되지 않으면, 그 child 는 resolved 로 치지 말고 `failed-needs-retry` 또는 `excluded-with-justification` 으로 남긴다**

---

### Phase 3: 관계 분석

찾을 것:
1. 문서형 frame 과 화면 frame 사이의 참조 관계
2. 같은 nodeId instance 중복
3. overview ↔ child state ↔ modal ↔ guide 관계
4. user flow 상에서 연결되는 frame 그룹

> 이 단계는 스크랩 이해를 돕기 위한 것이지, 별도의 requirements md 대량 생성을 강제하지 않습니다.

---

### Phase 4: 디렉토리 배치

```text
docs/{기획서_타이틀}/
└── scrap/
    ├── index.md
    ├── 01_policy/
    ├── 02_wireframes/
    │   ├── 01_mobile/        ← 실제 모바일 화면이 있을 때만
    │   ├── 02_dashboard/     ← 실제 웹 대시보드 화면이 있을 때만
    │   └── 03_modal/
    └── _meta/                ← 선택적 내부 검증 산출물
```

**파일명 컨벤션:**
```text
screenshot_{platform}_{state}_{description}.png
```

- `platform` 값은 `policy`, `mobile`, `dashboard`, `modal` 중 하나로 적습니다.
- **`app` 라는 단어는 쓰지 마세요.** 모호하므로 `mobile` 로 명시합니다.
- 필요하면 nodeId suffix 추가
- state/variant 의미가 드러나야 함
- 같은 family 의 여러 sibling 이면 overview / main / guide / compact / multi 등으로 구분
- 요구사항/문서 frame 도 스크린샷 파일로 `01_policy/` 에 저장

---

### Phase 5: 인덱스 문서 작성

반드시 포함:

1. 전체 디렉토리 구조
2. 레이어 관계 맵
3. 정책/문서 frame ↔ 와이어프레임 연결 표
4. 플랫폼 구성 맵
5. user flow
6. **스크랩 완료 범위 요약**
   - 정책/문서 몇 장
   - mobile 몇 장
   - dashboard 몇 장
   - modal 몇 장
7. **제외 항목 요약**
   - 무엇을 제외했고 왜 제외했는지
8. **coverage statement**
   - “eligible frame 전부를 캡처했음” 또는 “제외 사유 기록 완료” 문구

---

## 전수검사 절차 (필수)

`completeness-checklist.md` (보통 `_meta/` 아래) 를 끝까지 수행하세요.

핵심은 아래입니다.

1. metadata 에서 frame inventory 작성
2. 각 frame 을 `eligible / excluded` 로 분류
3. eligible frame 마다 target filename 부여
4. 캡처 후 저장 파일과 1:1 대조
5. **metadata 를 다시 읽어 ledger 와 saved file set 을 재대조**
6. 미캡처 eligible frame 이 0 이 될 때까지 반복

**이 단계 없이 “완료” 선언 금지**

---

## 대표 Frame 탐색 패턴 → 전체 Frame 열거 패턴

이 패턴은 **분류용 seed** 입니다. sampling 용이 아닙니다.

```python
patterns = {
    'policy': ['PRD', 'Changelog', 'Update', 'Background', 'policy', '정책', 'Requirements', 'FR-0', 'Description', '요구사항 테이블'],
    'wireframes': ['회사 설정', '메뉴', 'Modal', 'Accordion', 'ConfirmModal'],
}
```

사용법:
1. 패턴으로 frame family 를 찾는다
2. 해당 family 의 **모든 sibling frame** 을 metadata 에서 열거한다
3. overview / main / guide / modal / state variation 을 각각 평가한다
4. eligible 이면 모두 캡처한다

---

## 주의사항

### ⚠️ 해상도 손실 방지
- width 90% 미만이면 재캡처
- 긴 문서는 width 유지가 우선

### ⚠️ 텍스트가 변수명인 경우
- 변수명 그대로 기록 + 추후 확인 필요 표기

### ⚠️ section 단위 금지
- section 은 기본적으로 캡처 대상이 아님
- fallback 일 때만 예외

### ⚠️ 중복 제거 오남용 금지
- 이름 유사성으로 dedup 금지
- 상태 유사성으로 dedup 금지
- **nodeId 동일할 때만 dedup 허용**

### ⚠️ overview 생략 금지
- child frame 를 많이 캡처했더라도, 상위 overview frame 이 별도 기획 문맥을 제공하면 그것도 저장

### ⚠️ small example 생략 금지
- 작은 dropdown/panel example 이어도 독립 기획 의도가 있으면 eligible

### ⚠️ 파생 md 생성 과잉 금지
- 스크랩 결과를 바탕으로 별도의 requirements md 묶음을 기본 생성하지 않는다
- 문서형 frame 은 우선 **스크린샷 그대로 보존**한다
- 사용자에게 직접 보여줄 기본 산출물은 `index.md`, `01_policy/`, `02_wireframes/` 로 한정해 설명한다
- ledger / manifest / checklist 같은 검증 파일을 유지한다면 `scrap/_meta/` 아래에 모은다
- repo 루트의 `.claude_figma_*` helper 파일은 중간 작업물일 뿐이므로 완료 전에 삭제한다

---

## 체크리스트

- [ ] Phase 0: metadata 로 페이지 구조 파악 + 출력 경로 결정
- [ ] Phase 0: frame inventory ledger 작성
- [ ] Phase 1: PRD / 정책 / 요구사항 / 변경 이력 / guide frame 전수 수집
- [ ] Phase 2: 상세 기획의 wireframe sibling 전수 열거
- [ ] Phase 2: overview / main / guide / modal / panel / dropdown example 분리 평가
- [ ] Phase 2: 해상도 검증 및 재시도
- [ ] Phase 2: nodeId 실패 fallback 기록
- [ ] Phase 3: 문서형 frame 과 화면 frame 관계 정리
- [ ] Phase 4: 파일명과 디렉토리 구조 정리
- [ ] Phase 5: index.md 에 coverage / exclusion summary 반영
- [ ] Final: `completeness-checklist.md` (보통 `_meta/` 아래) 완료
- [ ] Final: eligible frame 미캡처 0 확인
- [ ] Final: repo 루트의 `.claude_figma_*` helper 파일 삭제 확인
