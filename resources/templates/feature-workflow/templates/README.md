# 문서 템플릿 가이드 (Feature Doc Workflow)

## 목차
- [문서 목적](#문서-목적)
- [개요](#개요)
- [적용 대상](#적용-대상)
- [기본 사용 원칙](#기본-사용-원칙)
- [Feature 표준 파일 템플릿](#feature-표준-파일-템플릿)
- [작성 순서](#작성-순서)
- [작성 규칙](#작성-규칙)

## 문서 목적

- `docs/features/{feature}/v{version}/` 하위 표준 문서를 **재사용 가능한 형식**으로 관리하기 위한 가이드
- 기능별 문서 품질, 구조, 목차, 링크 형식 일관성 확보 목적
- 새 기능 문서 생성 시 복사 시작점 제공 목적

## 개요

Feature 디렉토리의 표준 문서는 아래 8개 파일 기준으로 관리.

| 파일 | 템플릿 | 용도 |
|---|---|---|
| `index.md` | `feature-index-template.md` | 기능 개요, 문서 맵, 공통 참조 문서 연결 |
| `01-requirements.md` | `feature-requirements-template.md` | 배경, 시나리오, 포함/제외 범위 정의 |
| `02-plans.md` | `feature-plans-template.md` | 정책, UX 흐름, 예외, 오픈 포인트 정리 |
| `03-screens.md` | `feature-screens-template.md` | 화면 ID, 상태, CTA, 관련 시각 참조 정리 |
| `04-api.md` | `feature-api-template.md` | API 계약, 상태/예외, 에러 코드 정의 |
| `05-design.md` | `feature-design-template.md` | 시스템 설계, 책임 분리, 테스트 포인트 정리 |
| `06-decisions.md` | `feature-decisions-template.md` | 기능 의사결정 로그 누적 |
| `07-progress.md` | `feature-progress-template.md` | 진행 상태, 다음 액션, 차단 항목 추적 |

## 적용 대상

- 신규 feature 디렉토리 생성 시점
- 기존 feature 문서를 최신 구조로 재정리할 때
- 기능 버전(`v0`, `v0.1`, `v1`) 추가 시점

## 기본 사용 원칙

- **문서별 책임 분리 유지**
  - 요구사항 문서에 API 상세 스펙 작성 금지
  - API 문서에 구현 내부 구조 과도하게 혼합 금지
- **파일 간 링크 명시**
  - 같은 feature 내부 문서는 `./` 상대 경로 사용
  - 공통 문서는 `../../../` 상대 경로 사용
- **목차 유지**
  - 본문형 Markdown 문서는 H1 아래 목차 포함
- **기능 고유 내용만 채우기**
  - 템플릿의 항목명은 유지하되 값과 예시는 기능에 맞게 교체
- **문서가 코드보다 선행**
  - 정책, 화면, API 합의 없이 구현 단계로 건너뛰지 않음

## Feature 표준 파일 템플릿

### 1. 기능 진입 문서

- `feature-index-template.md`
- 사용 시점:
  - feature 디렉토리 생성 직후
- 최소 포함 항목:
  - 기능 한 줄 설명
  - 문서 맵
  - 공통 참조 문서
  - 연관 feature 링크

### 2. 요구사항 문서

- `feature-requirements-template.md`
- 사용 시점:
  - 1단계 요구사항 수집 및 정의 시작 시점
- 최소 포함 항목:
  - 배경
  - 핵심 요구사항
  - 포함/제외 범위
  - 사용자 시나리오

### 3. 기획 / 정책 문서

- `feature-plans-template.md`
- 사용 시점:
  - 2단계 정책 협의 시작 시점
- 최소 포함 항목:
  - 현재 합의 사항
  - UX 흐름
  - 정책 및 예외 상황
  - 오픈 포인트

### 4. 화면 정의 문서

- `feature-screens-template.md`
- 사용 시점:
  - 3단계 화면정의서 정리 시점
- 최소 포함 항목:
  - 소속 화면 목록
  - 화면별 목적/상태/CTA
  - 관련 시각 참고

### 5. API 문서

- `feature-api-template.md`
- 사용 시점:
  - 4단계 API 명세 정의 시점
- 최소 포함 항목:
  - 엔드포인트 목록
  - 엔드포인트 상세
  - 상태 / 예외 시나리오
  - 에러 코드

### 6. 설계 문서

- `feature-design-template.md`
- 사용 시점:
  - 5단계 시스템 설계 시점
- 최소 포함 항목:
  - 설계 원칙
  - 상태 모델
  - 책임 분리
  - 테스트 포인트

### 7. 의사결정 로그

- `feature-decisions-template.md`
- 사용 시점:
  - 전 단계 공통
- 최소 포함 항목:
  - 일자
  - 결정
  - 대안
  - 근거
  - 후속 영향

### 8. 진행 상황 문서

- `feature-progress-template.md`
- 사용 시점:
  - 전 단계 공통
- 최소 포함 항목:
  - 현재 상태
  - 다음 액션
  - 차단 항목
  - 검증 메모

## 작성 순서

1. `feature-index-template.md` 복사
2. `01-requirements.md` 작성
3. `02-plans.md` 작성
4. `03-screens.md` 작성
5. `04-api.md` 작성
6. 필요 시 `05-design.md` 작성
7. `06-decisions.md`, `07-progress.md`는 전 단계에 걸쳐 갱신

## 작성 규칙

- 기능명은 사용자 관점 용어 우선 사용
- 파일 제목에는 가능하면 `기능명 + 문서 목적` 형태 사용
- 긴 문단보다 목록, 표, 절차 중심 구성
- 예시는 복사 후 반드시 실제 기능 기준으로 수정
- 미작성 문서는 `index.md`에 상태를 명시
