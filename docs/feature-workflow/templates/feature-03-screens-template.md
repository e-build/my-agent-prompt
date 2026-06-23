# Feature Name 화면 정의

## 목차
- [문서 목적](#문서-목적)
- [전체 화면 참조](#전체-화면-참조)
- [소속 화면](#소속-화면)
- [화면별 정의](#화면별-정의)
- [상태 / CTA 공통 기준](#상태--cta-공통-기준)
- [관련 디자인 시각 참고](#관련-디자인-시각-참고)
- [연동 메모](#연동-메모)

## 문서 목적

- feature 화면 단위 사용자 흐름 정리 목적
- 상태, CTA, 에러 분기 기준 문서 역할
- 클라이언트 구현 기준 제공 목적

## 전체 화면 참조

전체 화면 ID 상세 정의는 [`../../../screen-definitions.md`](../../../screen-definitions.md) 참조.

## 소속 화면

| 화면 ID | 설명 | 우선순위 |
|---------|------|---------|
| `S-FEATURE-LIST` | 목록 화면 | P0 |
| `S-FEATURE-DETAIL` | 상세 화면 | P0 |
| `S-FEATURE-ACTION` | 액션 화면 | P1 |

## 화면별 정의

### 1. `S-FEATURE-LIST`

- 사용자 목적:
  - 이 화면에서 사용자가 달성해야 하는 목표
- 진입 조건:
  - 어디서 오는지
- 주요 정보:
  - 무엇을 보여주는지
- Primary CTA:
  - 대표 액션
- Secondary CTA:
  - 보조 액션
- 상태:
  - 기본
  - Empty
  - Loading
  - Error
  - Success 또는 완료 후 상태

### 2. `S-FEATURE-DETAIL`

- 사용자 목적:
- 진입 조건:
- 주요 정보:
- Primary CTA:
- Secondary CTA:
- 상태:
  - 기본
  - Empty / 대상 없음
  - Loading
  - Error

## 상태 / CTA 공통 기준

- 에러 코드별 CTA 매핑 필요 여부
- 인증 만료 시 공통 이동 규칙
- 삭제 / 만료 / 권한 부족 시 공통 안내 규칙

## 관련 디자인 시각 참고

- `../../../design-system/screen-visuals.html` — 관련 시각 예시
- `../../../design-system/design-system.html` — 공통 디자인 패턴
- 필요 시 feature 전용 HTML 시안 경로 추가

## 연동 메모

- 연동 API 문서: `./04-api.md`
- 관련 정책 문서: `./02-plans.md`
- 비고:
  - 화면 예시는 패턴 표현인지, 실제 확정 정책인지 구분 명시
