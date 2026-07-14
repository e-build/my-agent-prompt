---
name: shopl-dev-backend-breakdown-from-scrap
description: "Cross-references scraped specs, Figma captures, wireframes, and sample Excel against the current backend implementation to derive backend implementation breakdown items, items needing confirmation, and screen-level subtasks bridging planning to technical design. Splits planning deliverables (input) into backend implementation units ready to hand off to technical design. Use when: analyzing scraped specs, backend implementation breakdown, backend task decomposition, planning-vs-implementation gap analysis, deriving backend work items from Figma scrap."
---

# Backend Implementation Breakdown From Scrap

Scrap 기획 자료를 요약이 아니라 **현재 백엔드 구현과 대조한 백엔드 구현 분해 항목**으로 재구성한다. 기획(입력) 산출물을 기술 설계(출력 수용자)로 넘길 백엔드 구현 단위로 쪼개는 브리지 역할이다.

## 번들 참조 (필요시 읽기)

- `references/examples.md` — 분석 각 단계의 상세 형식/예시(화면 목록 표, 매핑 표, 구현 분해 항목 형식 예시, 링크 규칙, 하위작업 예시)
- `references/pitfalls.md` — 흔한 시행착오 및 회피 원칙(판단이 애매할 때 참조)

## 사용 시점

- "scrap된 기획서에서 백엔드 요구사항 뽑아줘"
- "Figma scrap 보고 백엔드 요구사항 정리해줘"
- "기획서와 구현을 비교해서 gap 분석해줘"
- "스크린샷/와이어프레임/엑셀 샘플을 보고 서버 작업 목록 뽑아줘"

## 핵심 원칙

1. **기획서 원문 전사 금지** — 현재 구현 확인 후 `분석 절차 #5`의 상태 기준으로 분류. "기능 설명"이 아니라 **현재 구현 대비 변경 필요사항** 중심으로 작성.
2. **화면 요소 ↔ 백엔드 구현 매핑** — `분석 절차 #4`의 순서대로 현재 구현 진입점을 확인하고 매핑.
3. **불명확 항목은 전용 섹션에 집계** — OCR 애매 문구, 문서 간 충돌, 정책 경계값 누락, 프론트/백 구분 모호, 저장형인지 1회성 옵션인지 모호, **내 추정과 그 근거**, **스크랩 누락 의심 항목**, **확신 부족한 Gap 분류**, **사용자 확인 질문**. 항목 내 주석이나 "확인 필요"로 끝내지 말고 `미확인/모호/추정 항목`에 한곳으로 모음.
4. **근거 링크 필수** — scrap 문서/이미지는 상대 경로, 구현은 파일 경로 backtick. 링크 불가 시 "확인된 문서 없음" 또는 "스크린샷 OCR 기반 추정" 명시.

## 필수 입력 계약

이 기획과 현재 구현을 대조하는 스킬이므로 **셋 다 있어야 실행**.

- **필수 입력**: (a) scrap 자료 경로, (b) 구현 확인 범위(클래스/패키지/모듈/API 진입점/기능 흐름), (c) shopl-pm 프로젝트에서 해당 기획서의 경로
- **범위 미지정 시**: 분석·탐색·문서 작성을 시작하지 말고 사용자에게 범위 지정을 요청.
  ```text
  현재 구현과 대조할 클래스/패키지/모듈 범위를 지정해주세요.
  예: AttAggregationExcelDownloadService, IoAttAggregationReportSet, api/.../export/service
  ```
- **범위 확장 제한**: 지정 범위 밖은 직접 import/호출하는 파일, DTO/Entity/Mapper 등 기능 흐름상 필수 연결 파일, 인접 이해 필요 파일일 때만 확인. 확장 시 먼저 사유를 설명한 뒤 진행.
- **분석 범위 기록**: 최종 문서에 "분석 범위" 섹션으로 scrap 자료 + 구현 확인 범위 + 범위 제외 항목을 기록.

## 분석 절차

1. **프로젝트 규칙 + Scrap 구조 파악** — 최상위/근접 `AGENTS.md`, 문서 규칙 확인. Scrap `index.md`/`README.md`/`requirements.md`/정책·와이어프레임·Excel 샘플 문서로 전체 구조 파악. 이미지는 OCR 기반으로 확정도 낮음.
2. **화면 단위 분해** — 고유 화면(페이지/모달/탭/뷰) 단위로 화면 목록 작성, 여러 화면이 공유하는 집계·권한·추출 로직은 **공통 로직**으로 별도 식별(식별은 유지하되 별도 하위작업 분리가 아님 — 절차 8에서 흡수). 형식은 `references/examples.md #1-2`.
3. **화면별 Scrap 기능 후보 추출** — 소속 화면, 기능명, 사용자 동작, 정책/경계값, 입력/출력, Excel 영향, 관련 scrap 링크, 불명확 문구. 형식은 `references/examples.md #3`.
4. **현재 구현 진입점 확인 + 매핑** — Entity 필드 → Request DTO → Response DTO → Mapper → Validator → Controller/Service 진입점 → 계산 factory/aggregator → Excel drawer/Column adjustor → Repository/Query → Error code → Migration 순서로 확인하고 매핑 표 작성. 형식은 `references/examples.md #4`.
5. **Gap 분류** — 각 기능을 아래 상태 중 하나로 분류.

   | 상태 | 의미 |
   |---|---|
   | 구현 완료 | 기획 요구와 현재 구현이 대체로 일치 |
   | 구현 일부 존재 | 필드/요청/계산 중 일부만 존재 |
   | 구현 보정 필요 | 기능은 있으나 정책/경계값/대상 기준이 다름 |
   | 신규 구현 필요 | 현재 구현 기반이 거의 없음 |
   | 기획 확인 필요 | 기획 요구 자체가 불명확하거나 충돌 |
   | 프론트 중심 가능 | 백엔드 변경이 없거나 제한적일 수 있음 |

6. **백엔드 구현 분해 항목 재서술** — 화면 단위 + 공통 로직 단위로 구성. 각 항목에 관련 자료(scrap + 구현 파일) / 현재 상태 / 변경 필요(API·DB·계산·Excel·검증 영향 구분) / 확인 필요 분리. 이미 구현된 기능을 신규처럼 쓰지 않음. 형식은 `references/examples.md #5`.
7. **미확인/모호/추정 항목 컴파일 (필수)** — 전체 분석 후 모든 불확실성·추정·의문을 한 섹션에 집계(핵심 원칙 3번 항목). 추정은 근거와 함께.
8. **큰 분류 분해** — **큰 분류만 작성**. 작은 분류/스켈레톤 골격/테스트 케이스/테스트 코드는 이 문서의 책임이 아니다(작은 분류는 `shopl-dev-task-flow`가 큰 분류 진입 시 코드·현황을 다시 읽고 Orientation에서 생성, 테스트 케이스는 `shopl-dev-task-flow-unit`에서 정의). 원칙:
   - **큰 분류는 단일 API 단위**를 넘지 않음.
   - 공통 로직은 별도 큰 분류로 분리하지 않고, **그것을 처음 필요로 하는 큰 분류(API) 안에 흡수**한다고 표시만 한다. 작은 분류 수준의 분해는 task-flow로 위임.
   - 흡수된 공통 컴포넌트는 후속 큰 분류에서 재사용하므로, §15(구현 큰 분류) 최상단에 **공통 컴포넌트 매핑표**(공통 컴포넌트 / 구현 위치(신규 생성 큰 분류) / 재사용하는 큰 분류)를 둔다. 공통 로직이 하나도 없으면 생략.
   - 각 큰 분류에 **API Draft 인계 항목**(API 후보/신규·변경/권한/요청·응답 후보/주요 정책/확인 필요)과 관련 자료·현재 상태·주요 정책 조건을 포함한다. 형식은 아래 `큰 분류 작성 형식`, 예시는 `references/examples.md #7`.
9. **최종 검토 (필수)** — 미확인 섹션이 존재하는가? 비어 있지 않은가? 비어 있다면 정말 모든 불확실성이 해소된 것인지 점검(추정이 하나도 없다면 "식별된 미확인 항목 없음. 문서 명시 내용만으로 판단 가능했음"으로 서술).

## 구현 분해 항목 작성 형식

```md
### 기능명
#### 관련 자료
- Scrap: [문서명](./relative/path.md), [화면명](./relative/image.png)
- 현재 구현: `path/to/Entity.kt`, `path/to/Service.kt`
#### 현재 상태
- 현재 구현에서 확인한 사실, 코드 기준 동작
#### 변경 필요
- 현재 구현 대비 바뀌어야 할 내용, API/DB/계산/Excel 영향
#### 확인 필요
- 정책/경계값/기획 충돌
```

상세 예시는 `references/examples.md #5`.

## 큰 분류 작성 형식 (절차 8단계)

큰 분류는 단일 API 단위를 넘지 않는 작업 묶음이다. 작은 분류/테스트 케이스/스켈레톤 골격은 이 문서에서 만들지 않는다.

```md
### 큰 분류 N. <작업명>

- 목적: <이 큰 분류가 달성할 것>
- 엔드포인트: `<METHOD /path or 없음>`
- 관련 자료:
  - Scrap: [문서명](./relative/path.md), [화면명](./relative/image.png)
  - 현재 구현: `path/to/Service.kt`
- 현재 상태: <현재 구현에서 확인한 사실>
- 변경 필요: <API/DB/계산/Excel/검증 영향 구분>
- 주요 정책 조건: <이 큰 분류가 다뤄야 할 정책 분기/경계값>
- 구현 공통 컴포넌트: <이 큰 분류가 신규 생성하는 공통 로직 or 없음>
- 재사용 공통 컴포넌트: <앞선 큰 분류에서 생성한 공통 로직 or 없음>
- API Draft 후보: <API 후보 요약 — 상세는 API Draft 인계 항목에서>
- 미확인/확인 필요: <정책/경계값/기획 충돌>
```

공통 로직이 하나 이상 있으면 §15 최상단에 **공통 컴포넌트 매핑표**를 둔다.

```md
| 공통 컴포넌트 | 구현 위치 (신규 생성 큰 분류) | 재사용하는 큰 분류 |
|---|---|---|
| 대상자 후보 추출 로직 | 큰 분류 1 | 큰 분류 2, 3 |
```

형식 예시는 `references/examples.md #7`.

## API Draft 인계 형식

API 초안(`shopl-dev-api-draft`) 설계로 넘길 재료. **API를 여기서 확정하지 않는다.** 초안 후보와 확인 필요만 정리한다. 테스트 케이스는 여기서 만들지 않는다(`shopl-dev-task-flow-unit`에서 정의).

요약 표(문서 내 한 번):

```md
| 큰 분류 | API 후보 | 신규/변경 | 권한 | 주요 정책 | 관련 자료 | 확인 필요 |
|---------|----------|-----------|------|-----------|-----------|-----------|
| 큰 분류 1 | GET /admin/.../summary | 신규 | 관리자 | 조회 기간, 조직 범위 | scrap/...png | 빈 결과 응답 형태 |
```

각 큰 분류의 `API Draft 후보` 항목에 짧은 후보를 적고, 상세 초안 설계는 `shopl-dev-api-draft`에서 수행한다.

## Traceability Matrix 형식

정책/자료 → 화면 → Gap → 큰 분류 → API Draft 의 최초 연결. 기획 누락 방지가 목적이다. 이후 실행 추적은 `shopl-dev-task-flow` 큰 분류 `index.md`의 Traceability에서 unit/test case/commit으로 이어진다.

```md
| Trace ID | 정책/자료 | 화면/스크린샷 | Backend Gap | 큰 분류 | API Draft | 상태 |
|----------|-----------|---------------|-------------|---------|-----------|------|
| TR-001 | 정책서 > 조회 기간 | screenshot_...png | 기간 검증 필요 | 큰 분류 1 | 필요 | draft 대기 |
```

정책서의 모든 분기/경계값이 최소 한 Trace ID에 걸리도록 작성한다. 걸리지 않는 정책 항목이 있으면 기획 누락이므로 큰 분류 또는 확인 필요로 환원한다.

## 권장 문서 구조

```md
# <기능명> 백엔드 구현 분해
## 목차
1. 문서 목적
2. 참고 자료
3. 확인한 현재 구현
4. 기획 요구 요약
5. 현재 구현 대비 Gap
6. 화면 단위 변경 필요사항
7. 공통 로직 변경 필요사항
8. 데이터 모델 변경 후보
9. API 변경 후보
10. 계산 로직 변경 필요사항
11. Excel 출력 변경 필요사항
12. 검증 및 방어 로직
13. 미확인/모호/추정 항목 (필수)
14. 기획 검토 결정 사항
15. 구현 큰 분류 + 공통 컴포넌트 매핑표
16. API Draft 인계 항목
17. Traceability Matrix
```

## 개발설계 단계로의 인계

이 스킬의 산출물은 API 초안 설계 → task-flow 실행 단계로 차례로 넘어간다.

- 산출물 흐름: 백엔드 구현 분해(이 스킬) → `shopl-dev-api-draft`(API 초안) → `shopl-dev-task-flow`(실행). 이 문서의 **API Draft 인계 항목**(절차 #8)과 **Traceability Matrix**가 다음 두 단계의 입력이다.
- 공통 로직(2개 이상 화면 사용)은 Shared Service/Facade/Query Repository로 추출, 각 화면 Service가 주입받아 사용. 화면 전용 조립만 남기고 공통 로직 중복 구현 금지. 단, 이 문서에서는 공통 로직의 **구현 책임**을 처음 필요로 하는 큰 분류에 흡수한다고만 표시하고, 작은 분류 수준 분해는 task-flow로 위임(절차 #8).
- 화면별 Controller/Service/DTO는 분리, 공통 모델(근무지 식별·권한 컨텍스트·날짜 범위)은 공유.
- 성능(캐시/사전 집계), 연산 주체(서버/클라이언트), 아키텍처(단일 쿼리/메모리 병합), 빈 결과 응답 형태, 프론트 영역(색상·UI 상태)은 **개발설계/API 초안 단계로 위임**하고 이 문서에서 결정하지 않는다. 상세는 `references/pitfalls.md #6`.

## 최종 체크리스트

- [ ] H1 아래 목차, 관련 scrap 링크 + 구현 파일 경로 포함
- [ ] 현재 상태와 변경 필요 분리, 이미 구현된 기능을 신규처럼 쓰지 않음
- [ ] 정책/경계값 불명확 항목을 확인 필요로 분리
- [ ] API/DB/계산/Excel/검증 영향 범위 구분
- [ ] **큰 분류만 작성** (작은 분류/스켈레톤/테스트 케이스/테스트 코드 단계는 task-flow/task-flow-unit로 위임); 큰 분류는 단일 API 단위를 넘지 않음
- [ ] 공통 로직은 별도 큰 분류가 아니라 처음 필요로 하는 큰 분류에 흡수 + **공통 컴포넌트 매핑표**(구현 위치/재사용 큰 분류) 존재
- [ ] 각 큰 분류에 **API Draft 인계 항목** 포함 (API 후보/신규·변경/권한/요청·응답 후보/주요 정책/확인 필요)
- [ ] **Traceability Matrix** 존재 (정책/자료 → 화면 → Gap → 큰 분류 → API Draft)
- [ ] **미확인/모호/추정 섹션 존재 + 비어있지 않음** (추정은 근거 표기, 사용자 질문 포함)
- [ ] 이모티콘 미사용, 날짜 포함 파일명 미사용

## 출력 규칙

- 사용자가 "작성"/"만들어"를 요청할 때만 실제 Markdown 파일 작성. "점검"/"검토"의 의미는 `shopl/AGENTS.md`의 요청 해석 규칙을 따른다.
- 확인되지 않은 내용은 "추정"/"확인 필요"/"정책 결정 필요"로 표현.
- 최종 응답에는 변경 파일 경로와 핵심 반영 사항 요약 포함.
- 산출 문서는 기능 최상위(`docs/<feature>/`)에, scrap은 `docs/<feature>/scrap/`에 분리(`references/pitfalls.md #7`).
