---
name: shopl-dev-api-draft
description: "백엔드 구현 분해 문서(backend-implementation-breakdown.md)에서 API 후보를 추출하여 개발 착수 전 확정할 전체 API 초안 명세를 작성한다. 엔드포인트, HTTP 메서드, 권한, 요청/응답 값(필드·타입·필수), enum 가능값, 페이징, 예외 케이스를 **순수 JSON spec** 형태로 작성한다. DTO 클래스명은 명세에 포함하지 않는다. 정책 문서의 항목 enum 정확값을 교차 확인하여 반영한다. 모든 문서 간 교차 참조는 실제 markdown 링크로 변환한다. Use when: breakdown 문서의 API 후보를 초안 명세로 전환, API 초안, API 설계, API 명세, API draft, 구현 전 API 스펙 확정."
---

# Shopl API 초안 설계 (Implementation Breakdown → API Draft)

## Overview

`backend-implementation-breakdown.md` §9(데이터 모델 후보)·§10(API 변경 후보)를 입력으로, **개발 착수 전 확정할 전체 API 명세 문서**를 작성한다. 정책 문서의 항목 enum 정확값을 교차 검증하여 DTO와 enum 정의의 신뢰도를 높인다.

**산출물**: `docs/<feature>/api-draft.md`

**품질 기준**:
1. 개발자가 바로 구현할 수 있을 만큼 구체적인 필드·타입·enum·예외 명세
2. **순수 JSON spec** — 요청/응답을 JSON 형태로 정의. DTO 클래스명(`XxxRequest`, `XxxResponse` 등)은 명세에 포함하지 않는다
3. 모든 문서 간 교차 참조가 실제 markdown 링크로 존재 (plain text `§` 사용 금지)
4. 정책 문서의 항목 enum과 API 명세 enum이 1:1 대응

## 사용 시점

- "이 breakdown에서 API 초안 설계 먼저 해줘"
- "구현 전에 API 명세부터 확정하자"
- "api-draft 작성해줘"
- breakdown 문서가 있고 "API 초안", "API 설계" 언급

## 전제 조건

- **필수**: 완성된 `backend-implementation-breakdown.md` (신규 API 후보·DTO 후보·공통 enum 후보 포함)
- **필수**: 정책 원본 문서 (md 또는 접근 가능한 경로)
- **권장**: 기존 유사 API 컨트롤러/DTO 1~2개 (프로젝트 컨벤션 확인용)

## 워크플로우

### 1. 프로젝트 컨벤션 확인

기존 컨트롤러 1~2개와 공통 타입을 조사한다. Shopl 핵심 컨벤션:

- **HTTP**: 조회/필터도 POST + RequestBody. 관리자 화면은 `/admin/...` prefix
- **인증**: `CommonParamInfo` (hidden param) 주입
- **페이징**: `PageRequest<SortType>` 요청, `PageResponse<T>` / `PageResponseWithAdditionalInfo<T, S>` 응답
- **예외**: `ErrorCode.throwEx()` / `wrapEx(errorData)` — raw throw 금지
- **DTO**: outer class 내부 `data class` 중첩 + Swagger `@Schema`

조사할 파일: 기존 유사 `Controller.kt`, `PageRequest.kt`, `PageResponseWithAdditionalInfo.kt`, `ErrorCode.java`, `CommonParamInfo.java`. 상세는 [REFERENCE.md §1](REFERENCE.md#1-프로젝트-컨벤션-요약).

### 2. 정책 문서에서 항목 enum 수집

정책 원본 md에서 **정확한 항목명·집계 기준·default 선택값**을 추출한다. breakdown 요약으로 빠진 값이 있는지 교차 확인한다. 수집 대상: 조회 항목 enum, 근무 상태 enum, 스케줄 유형 enum, 특이사항 유형, 집계 기준 근무지, 권한 플래그.

### 3. 공통 타입/Enum 정의

모든 API에서 공유하는 enum을 하나의 섹션에 정의한다. enum 값은 영문 상수 + 한글 표시명을 함께 표로 제시. 상세 규칙은 [REFERENCE.md §3](REFERENCE.md#3-enum-정의-규칙).

### 4. 개별 API 명세 작성

각 API마다 다음 항목을 포함한다. **섹션 헤더에 DTO 클래스명을 붙이지 않는다** (`### 5.4 Request`, `### 5.5 Response` 형태).

```
### A. 개요 (정책 링크)
### B. 엔드포인트 (POST/GET + 경로)
### C. 권한 (역할별 분기)
### D. Request (필드 표: 필드명·타입·필수·설명·예시)
### E. Response (JSON 예시 — pseudo-class/DTO 클래스명 금지)
### F. 예외 케이스 (HTTP 상태·ErrorCode·조건)
### G. 비고 (구현 참고사항·정책 특이사항)
```

### 5. cross-reference 링크화 (필수)

문서 내 모든 교차 참조를 실제 markdown 링크로 변환한다. **plain text `섹션 X` 사용 금지** (`§`도 사용 금지).

| 참조 유형 | 링크 형식 |
|---|---|
| 내부 섹션 (같은 문서) | `[섹션 3.4](#34-출퇴근-탭-조회-항목-최대-8개-선택)` |
| breakdown 문서 | `[breakdown 섹션 10.1](./backend-implementation-breakdown.md#101-신규-api-후보)` |
| 정책 문서 (shopl-pm) | `[정책 섹션 3](01-policy-일간-집계-화면.md#3-근무지별조회-항목별-구성원-조회)` |

**주의사항**:
- URL에 괄호 `( )` 가 포함된 파일명은 `%28` / `%29` 로 URL 인코딩 (마크다운 링크 구문 깨짐 방지)
- 코드 주석 내 참조 (`// 섹션 3.2`)는 링크 대상이 아님. 변수/타입 참조이므로 그대로 유지
- `breakdown 섹션 10.1` 과 `breakdown 섹션 10` 이 공존할 경우, **긴 패턴을 먼저** 치환 (중첩 치환 방지)

### 6. breakdown 문서에 연결

작성 완료 후 breakdown §16(구현 하위작업) 최상단에 "선행 작업. 모든 신규 API 초안 설계" 블록을 추가하고 `api-draft.md` 링크를 건다.

### 7. 검증

- `[[` 이중 링크 발생 여부
- 일반 텍스트로 남은 `섹션 N` 참조 (코드 주석 제외)
- 모든 링크 URL의 괄호 인코딩

---

## 상세 컨벤션

자세한 규칙과 체크리스트는 [REFERENCE.md](REFERENCE.md) 참조.
