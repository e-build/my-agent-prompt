# Figma Scrap Completeness Checklist

이 체크리스트는 `shopl-dev-figma-scrap` 스킬의 **완료 게이트**입니다.

목표:
- `eligible frame` 을 빠짐없이 캡처한다.
- 제외한 frame 은 반드시 이유를 남긴다.
- representative sampling 으로 끝내는 실수를 막는다.
- **raw capture 중심의 스크랩**에 집중하고, 스크랩 결과 기반의 별도 requirements md 대량 생성은 기본 산출물에서 제외한다.

---

## 1. Inventory Ledger 만들기

캡처 전에 metadata 기준 ledger 를 먼저 만든다.

최소 컬럼:

| nodeId | name | path | width | height | layer | eligible? | exclusionReason | targetFile | status |
|-------|------|------|------:|-------:|------|-----------|-----------------|-----------|--------|
| 1:1049 | 근무지별 출퇴근 일간 메인 | 상세 기획 > ... | 2500 | 2930 | wireframe | yes |  | 02_wireframes/02_dashboard/...png | pending |

`status` 권장 값:
- `pending`
- `captured`
- `excluded`
- `fallback-captured`
- `failed-needs-retry`

`exclusionReason` 은 free-text 한 줄로 끝내지 말고 아래 코드 중 하나로 시작한다.
- `section`
- `duplicate-nodeid`
- `repeated-nav-shell`
- `anonymous-wrapper`
- `atomic-fragment`
- `fallback-covered` (실제로 parent 안에 child 내용이 확인될 때만)

---

## 2. Frame 전수 추출

metadata 에서 아래를 모두 뽑는다.

- `frame` 타입
- node id
- name
- x/y
- width/height
- parent path

**중요:**
- `상세 기획` 같은 dense section 에서는 sibling frame 전부를 뽑는다.
- 패턴 검색은 시작점일 뿐, 최종 inventory 를 대신하지 않는다.
- 상위 overview/frame 을 eligible 로 잡았다면 descendant 를 재귀적으로 훑어서 의미 있는 child frame 을 ledger 에 추가한다.
- `>= 200×200` 는 기본 스크리닝값일 뿐이다. 더 작아도 이름/텍스트/기획 의도가 독립적이면 ledger 에 넣는다.

---

## 3. eligible / excluded 분류

### eligible 로 분류할 것

아래 중 하나라도 해당하면 eligible.

- PRD / changelog / policy / requirements / guide 문서
- screen overview frame
- main state / alternate state / filtered state
- member list / detail table / column guide
- modal / popup / help / confirm / compact variant
- panel example / cluster example / dropdown example

> requirements 성 frame 도 **별도 md 생성 대상**이 아니라, 우선 **스크린샷 보존 대상**으로 분류한다.

### excluded 가능 항목

아래는 excluded 가능하지만 이유를 써야 한다.

- `section`
- 반복되는 side navigation shell
- 의미 없는 wrapper (`body`, unnamed container)
- atomic dropdown fragment
- exact duplicate by same `nodeId`

### 작은 frame 판정 규칙

작아도 아래 중 하나면 eligible.

- 상태/예시/가이드/패널/드롭다운/모달 역할명이 있다
- user-facing text, 표, 버튼 조합, 설명 문장이 있다
- standalone 으로 보면 하나의 상태 예시로 읽힌다
- 인접한 guide/spec 가 그 frame 을 별도 예시로 다룬다
- default / compact / multi / cluster / selected 같은 변형이다

아래를 모두 만족할 때만 `atomic-fragment` 또는 `anonymous-wrapper` 로 제외 가능.

- standalone 제목/역할명이 없다
- 별도 상태/예시/문맥을 전달하지 않는다
- 상위 eligible frame 의 시각 파편이다
- 빠져도 문서/기획 해석이 달라지지 않는다

### 금지

다음 이유로 excluded 처리 금지:
- “비슷해 보여서”
- “대표 화면으로 충분해서”
- “상위 화면에 이미 들어 있어서”
- “작아서 중요하지 않을 것 같아서”

---

## 4. overview / child 동시 보존 규칙

아래 질문을 각각 따진다.

1. 상위 frame 이 전체 문맥을 보여주는가?
2. child frame 이 별도 상태/설명/예시를 보여주는가?

둘 다 yes 면 **둘 다 저장**한다.

예:
- overview + main state
- main state + commute state + schedule state
- map main + panel overview + panel basic + panel multi
- member overview + member modal + column guide

---

## 5. 캡처 전 사전 점검

캡처 시작 전 아래를 확인한다.

- [ ] ledger 에 eligible frame 이 전부 등록되어 있다
- [ ] excluded frame 은 이유가 있다
- [ ] target filename 이 정해져 있다
- [ ] overview / guide / modal / variant 가 빠지지 않았다
- [ ] 기본 출력 디렉토리는 `01_policy/` 와 `02_wireframes/` 중심으로 잡혀 있다
- [ ] 별도 `02_requirements/` 생성 계획이 없다

---

## 6. 캡처 중 상태 업데이트

각 frame 을 캡처할 때 ledger 를 즉시 업데이트한다.

- 저장 성공 → `captured`
- nodeId 실패 후 parent fallback 저장 → `fallback-captured`
- 해상도 부족 → `failed-needs-retry`
- 제외 → `excluded`

fallback 을 썼다면 `exclusionReason` 또는 메모에 아래를 남긴다.
- 원래 nodeId
- 실패 원인
- 대신 캡처한 parent nodeId
- parent 이미지 안에 원래 child 내용이 실제로 보이는지 여부

**주의:**
- parent fallback 을 했다고 child 가 자동 해결되는 것은 아니다.
- parent 가 child 내용을 실제로 포함한다고 확인된 경우에만 `fallback-covered` 로 닫는다.
- 확인되지 않으면 child 는 `failed-needs-retry` 또는 `excluded` 로 남겨서 후속 판단한다.

---

## 7. 해상도 검증

각 이미지에 대해 확인:

- `rendered_width / original_width >= 0.9`
- 긴 문서는 width 보존이 특히 중요
- 0.9 미만이면 `maxDimension` 상향 후 재시도

---

## 8. 전수 대조

캡처 후 아래를 계산한다.

1. metadata 를 다시 읽는다.
2. ledger 의 eligible 집합과 saved file 집합을 nodeId 기준으로 다시 맞춘다.
3. 아래를 계산한다.

- `eligible_total`
- `captured_total`
- `excluded_total`
- `missing_eligible = eligible_total - captured_total - fallback_captured_total`

**완료 조건:**
- `missing_eligible == 0`
- ledger 에 없는 eligible frame 이 metadata 재조회에서 새로 나오지 않는다

하나라도 남으면 완료 아님.

---

## 9. 최종 누락 검사

아래 질문에 모두 yes 여야 한다.

- [ ] overview frame 이 빠지지 않았는가?
- [ ] same-family sibling state 가 빠지지 않았는가?
- [ ] modal / popup / help / compact variant 가 빠지지 않았는가?
- [ ] guide / panel example / dropdown example 이 빠지지 않았는가?
- [ ] member list / detail / column guide 가 빠지지 않았는가?
- [ ] excluded 항목은 모두 정당한 저수준 구성요소인가?

---

## 10. index.md 에 남길 것

최종 문서에는 아래를 반드시 적는다.

1. 총 스크린샷 수
2. 정책/문서형 frame 수
3. app / dashboard / modal 별 수량
4. 제외 항목 요약
5. coverage statement

예시:

> metadata 기준 eligible frame 전부를 캡처했으며, 제외한 항목은 section / side navigation shell / unnamed wrapper / exact duplicate instance 로 한정했다.

---

## 11. 실패 신호

아래 생각이 들면 아직 완료가 아니다.

- “대충 대표 화면은 다 모았어”
- “비슷한 화면은 하나만 있으면 되겠지”
- “child 는 너무 많으니 main 만 저장하자”
- “modal 은 메인 화면에 보이니까 생략해도 되겠다”
- “작은 dropdown 예시는 중요하지 않을 거야”
- “스크랩 후 md 로 다시 정리하면 되니 원본 캡처는 덜 해도 되겠지”

**이런 생각이 들면 inventory 로 돌아가서 다시 대조한다.**
