# AGENTS.md (프로젝트 부착용 템플릿)

> **적용 방법**: 이 파일을 프로젝트 루트에 `AGENTS.md`로 복사하고, 예시 내용을 프로젝트 도메인/실제 기능명으로 교체하세요.
> 문서 디렉토리 구조(`docs/features/{feature}/v{version}/`), 공통 규약(`docs/engineering/`), 템플릿 사용법(`docs/templates/README.md`)을 함께 생성해야 합니다.

## 목차
- [문서 목적](#문서-목적)
- [기본 원칙](#기본-원칙)
- [문서 디렉토리 규칙](#문서-디렉토리-규칙)
- [기능 작업 표준 절차](#기능-작업-표준-절차)
- [단계별 체크리스트](#단계별-체크리스트)
- [문서 작성 규칙](#문서-작성-규칙)
- [API 및 에러 코드 규칙](#api-및-에러-코드-규칙)
- [구현 및 검증 규칙](#구현-및-검증-규칙)
- [산출물 위치 기준](#산출물-위치-기준)

## 문서 목적

- 기능 작업 시 반복되는 절차를 표준화하기 위함
- 기획 / 화면정의 / API / 설계 / 구현 / 검증 흐름의 일관성 확보 목적
- 작업 단계마다 우선 확인해야 할 문서와 산출물 위치를 명확히 하기 위함

## 기본 원칙

- 모든 기능 작업은 아래 순서를 기본값으로 사용
  1. 요구사항 수집 및 정의
  2. 기획 및 정책 수립
  3. 화면정의서 작성 / 기존 정의서 반영하며 구체화
  4. API 명세서 정의 (에러 코드 포함)
  5. 백엔드 시스템 설계
  6. 백엔드 API 개발 및 모바일 / 웹 화면 구현
- 이전 단계 합의 없이 다음 단계로 건너뛰지 않음
- 기능 기획 문서와 기술 문서는 분리
- 같은 내용을 여러 문서에 중복 정의하지 않음
- 문서보다 코드가 늦게 가야 하며, 구현 전에 최소한 API와 정책 합의 선행 필요

## 문서 디렉토리 규칙

### 문서 구조 개요

문서는 **공통 기준(shared)** 과 **기능별(feature)** 로 이분됩니다.

```
docs/
├── PROGRESS.md                      # 전체 진행 현황 (루트)
├── ARCHITECTURE.md                  # 시스템 아키텍처 (루트, 선택)
├── screen-definitions.md            # 전체 화면 ID 레지스트리 (루트)
│
├── engineering/                    # 공통 API/엔지니어링 기준
│   └── api-conventions.md          #   응답 규약, 에러 코드 규칙
│
├── templates/                      # 문서 템플릿 (가이드: README.md)
│   ├── README.md
│   ├── feature-index-template.md
│   ├── feature-01-requirements-template.md
│   ├── feature-02-plans-template.md
│   ├── feature-03-screens-template.md
│   ├── feature-04-api-template.md
│   ├── feature-05-design-template.md
│   ├── feature-06-decisions-template.md
│   └── feature-07-progress-template.md
│
└── features/                       # 기능 단위 디렉토리
    └── {feature}/                  #   기능명 (예: auth, order, project)
        └── v{version}/             #     버전 (v0, v0.1, v1, ...)
            ├── index.md            #       기능 개요 + 문서 맵
            ├── 01-requirements.md  #       요구사항 — 1단계
            ├── 02-plans.md         #       기획 / 정책 / UX 흐름 — 2단계
            ├── 03-screens.md       #       화면 정의 + 상태/CTA — 3단계
            ├── 04-api.md           #       API 명세 (에러 코드 포함) — 4단계
            ├── 05-design.md        #       시스템 설계 (선택) — 5단계
            ├── 06-decisions.md     #       의사결정 로그
            └── 07-progress.md      #       진행 상황
```

### 디렉토리 이름 규칙

- 소문자 + 하이픈 사용 (예: `auth/`, `order-management/`)
- 최초 버전은 `v0`부터 시작

### 크로스 레퍼런스

- 기능 내 문서 간 참조는 같은 디렉토리 내에서 해결 (`./04-api.md` → ./03-screens.md)
- 기능 간 참조는 `../{feature}/v{version}/{file}.md` 형식 (features/ 하위에서 상대 경로)
- 공통 문서 참조는 상대 경로로 명시 (`../../../engineering/api-conventions.md`)

## 기능 작업 표준 절차

### 1. 요구사항 수집 및 정의

목적:

- 무엇을 만들지, 왜 만드는지 명확히 정의
- 사용자 시나리오, 기능 범위 고정

우선 확인 문서:

- `PROGRESS.md`
- `docs/features/` 기존 문서
- 제품 요구사항 / 로드맵 (있는 경우)

산출물:

- `docs/features/{feature}/v{version}/01-requirements.md`

완료 기준:

- 기능 목표 명확, 사용자 시나리오 정리 완료, 포함/제외 범위 명확
- DB 스키마 / 코드 설계로 내려가지 않은 상태 유지

### 2. 기획 및 정책 수립

목적:

- 요구사항을 바탕으로 실제 처리 규칙과 UX 흐름 결정

산출물:

- `docs/features/{feature}/v{version}/02-plans.md`

완료 기준:

- 정책 및 예외 상황 정리 완료, UX 흐름 정리 완료
- 오픈 포인트 명시

### 3. 화면정의서 작성 / 구체화

목적:

- 화면 단위로 사용자 흐름과 상태, CTA, 에러 분기를 정리

산출물:

- `docs/features/{feature}/v{version}/03-screens.md`

완료 기준:

- 화면 ID / 사용자 목적 / CTA 정의
- 상태 분기 (기본/Empty/Loading/Error/Success) 정리

### 4. API 명세서 정의

목적:

- 클라이언트와 서버가 합의할 인터페이스 정의
- 에러 코드는 API 정의 시점에 함께 정의

산출물:

- `docs/features/{feature}/v{version}/04-api.md`

완료 기준:

- 엔드포인트 책임 정의, 주요 요청/응답 개념 정의
- 상태/예외 시나리오 정리
- 클라이언트 분기 가능한 수준의 에러 코드 정의

### 5. 백엔드 시스템 설계

산출물:

- `docs/features/{feature}/v{version}/05-design.md` (선택)

완료 기준:

- 주요 컴포넌트 책임 정리, 도메인 경계 정리
- 테스트 포인트 식별 완료

### 6. 백엔드 API 개발 및 화면 구현

원칙:

- 문서 합의 없는 임의 스펙 추가 금지
- 구현 중 새 정책이 나오면 문서 먼저 갱신

완료 기준:

- 핵심/예외 시나리오 검증 완료
- 응답 포맷 / 상태 코드 / 에러 코드 검증 완료
- 문서와 실제 동작 간 차이 없음

## 단계별 체크리스트

### 1단계 (요구사항) 시작 전
- [ ] 관련 문서 위치 확인
- [ ] 기존 유사 기능 문서 존재 여부 확인

### 2단계 (기획) 시작 전
- [ ] 요구사항 문서 최신 상태 확인 (`01-requirements.md`)

### 3단계 (화면정의서) 시작 전
- [ ] 기획/정책 문서 최신 상태 확인 (`02-plans.md`)

### 4단계 (API 명세) 시작 전
- [ ] 기획/정책 문서 최신 상태 확인 (`02-plans.md`)
- [ ] 화면정의서의 상태/에러 분기가 API에서 커버 가능한지 확인
- [ ] 공통 응답 규약 확인

### 5단계 (설계) 시작 전
- [ ] API와 에러 코드 정의 완료 여부 확인
- [ ] 권한 정책 확정 여부 확인

### 6단계 (구현) 시작 전
- [ ] 문서 합의 상태 확인
- [ ] 테스트 대상 시나리오 정리

### 완료 처리 전
- [ ] 테스트 실행 결과 확인
- [ ] 문서 갱신 여부 확인
- [ ] 남은 TODO / 미결 이슈 명시

## 문서 작성 규칙

- 모든 본문형 Markdown 문서에 **목차 포함**
- 긴 줄글보다 목록 / 표 / 절차 중심 작성
- 문체는 명사형 / 기준형 우선
- 파일명에 날짜 포함 금지
- 가능한 한 소문자 + 하이픈 사용
- 같은 주제의 문서는 같은 디렉토리 아래에서 관리
- 같은 내용을 여러 문서에 중복 정의하지 않음

## API 및 에러 코드 규칙

공통 기준 문서: `docs/engineering/api-conventions.md` 참조.

핵심 규칙:

- HTTP status는 의미 있게 사용
- 응답 body 기본 구조는 `result`, `data`, `error` (프로젝트 규약에 따라 변경)
- `result` 값은 `SUCCESS`, `ERROR`
- `error.message`는 사용자 노출 가능한 문장 기준
- `error.code`는 도메인 접두어 포함 대문자 스네이크 케이스 사용
- **에러 코드는 API 정의 시점에 정의**

## 구현 및 검증 규칙

- 구현 완료 주장 전 검증 필수
- 테스트가 없으면 완료로 간주하지 않음
- 기능 정책과 실제 동작 차이가 있으면 문서 또는 코드 중 하나를 즉시 정정

## 산출물 위치 기준

| 단계 | 기본 위치 | 예시 |
|---|---|---|
| 요구사항 정의 | `docs/features/{feature}/v{version}/requirements.md` | `docs/features/auth/v0/requirements.md` |
| 기획 / 정책 | `docs/features/{feature}/v{version}/plans.md` | `docs/features/order/v0/plans.md` |
| 기능별 화면 정의 | `docs/features/{feature}/v{version}/screens.md` | `docs/features/order/v0/screens.md` |
| 공통 API 규약 | `docs/engineering/api-conventions.md` | 응답 포맷, 에러 코드 규칙 |
| 기능 API 문서 | `docs/features/{feature}/v{version}/api.md` | `docs/features/order/v0/api.md` |
| 시스템 설계 | `docs/features/{feature}/v{version}/design.md` | `docs/features/order/v0/design.md` |
| 의사결정 로그 | `docs/features/{feature}/v{version}/decisions.md` | `docs/features/auth/v0/decisions.md` |
| 현재 진행 상황 | `docs/features/{feature}/v{version}/progress.md` | `docs/features/auth/v0/progress.md` |
| 구현 코드 | 실제 소스 디렉토리 | 서버 / 클라이언트 코드 |
| 문서 템플릿 | `docs/templates/` | 8개 표준 템플릿 |
