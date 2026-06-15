---
name: kotlin-spring-gradle-backend-architecture
description: "Java/Kotlin Gradle 백엔드 프로젝트에서 Kotlin/Spring Boot 멀티모듈 구조와 Domain-First app 내부 아키텍처를 설계, 구현, 리뷰, 리팩터링할 때 사용. Trigger: Gradle 멀티모듈, Spring Boot backend architecture, app/core/infra/support, domain-first package, api/application/domain/infrastructure layer, JPA Entity 분리, 모듈 의존성 검토."
---

# Kotlin/Spring Gradle Backend Architecture

Java/Kotlin Gradle 백엔드 프로젝트에 적용하는 개인 표준 아키텍처 스킬.
멀티모듈 구조와 app 모듈 내부 Domain-First 패키지 구조를 함께 다룬다.

## 필수 참조 문서

작업 시작 시 목적에 맞는 문서를 먼저 읽고 적용한다.

- 모듈 구조, Gradle 의존성, 모듈 그룹 규칙: [`refs/module-architecture.md`](refs/module-architecture.md)
- app 모듈 내부 패키지, 레이어, 도메인 간 통신, JPA Entity 분리: [`refs/application-architecture.md`](refs/application-architecture.md)

둘 다 관련되는 작업이면 두 문서를 모두 읽는다.

## 적용 대상

- Java/Kotlin Gradle 백엔드 프로젝트 신규 설계
- Spring Boot 멀티모듈 구조 설계 또는 리팩터링
- `settings.gradle(.kts)`, `build.gradle(.kts)` 모듈 의존성 정리
- `app-*`, `core-*`, `infra-*`, `support-*` 모듈 분리
- app 모듈 내부 Domain-First 패키지 구성
- Controller, Facade, Domain Service, Repository/Client 위치 결정
- 도메인 간 통신 방식 선택
- JPA Entity와 Domain Model 분리 검토

## 핵심 아키텍처 규칙

### 1. 모듈 그룹

모듈은 기본적으로 4개 그룹으로 나눈다.

| 그룹 | 역할 |
|---|---|
| `app-*` | 비즈니스 로직, 실행 애플리케이션/도메인 애플리케이션 |
| `core-*` | 재사용 가능한 고수준 공통 컴포넌트 |
| `infra-*` | 외부 시스템 단일 연동 어댑터 |
| `support-*` | 로깅, 테스트, 유틸 등 cross-cutting support |

기본 의존 방향은 다음 기준을 따른다.

```text
app -> core -> infra -> support
app -> infra
app -> support
```

금지 기준:

- `core -> app` 금지
- `infra -> app` 금지
- `infra -> core` 금지
- `infra -> infra` 금지
- `support -> app/core/infra` 금지

### 2. app 모듈 내부 구조

app 모듈 내부는 Layer-First가 아니라 Domain-First 구조를 우선한다.

```text
app-order/
├── order/
│   ├── api/
│   │   ├── http/
│   │   └── internal/
│   ├── application/
│   ├── domain/
│   │   ├── model/
│   │   └── service/
│   └── infrastructure/
└── common/
```

레이어 의존 방향:

```text
api -> application -> domain -> infrastructure
```

금지 기준:

- 역방향 의존 금지
- 레이어 건너뛰기 금지
- 다른 도메인의 동일 레이어 직접 참조 금지
- Controller가 Domain Service/Repository 직접 호출 금지
- Domain Model이 DTO/Command/View에 의존 금지

### 3. 레이어별 책임

| 레이어 | 책임 | 대표 요소 |
|---|---|---|
| `api` | 외부/내부 인터페이스 | Controller, Request, Response, InternalApi |
| `application` | 유즈케이스 오케스트레이션 | Facade, Command, Transaction boundary |
| `domain` | 핵심 비즈니스 로직 | Domain Model, Domain Service, View Model |
| `infrastructure` | 외부 시스템/다른 도메인 연동 | Repository interface, Client, core/infra adapter |

### 4. 도메인 간 통신

- Write/Command 성격: 이벤트 기반 발행/구독 우선
- Read/Query 성격: `api/internal`의 Internal API를 통한 동기 조회 허용
- 경량 공통 값: `common/domain/model`에 Value Object 공유 가능
- 복합 조회 응답: 필요 시 Controller/API 조합 허용하되 도메인 경계 훼손 금지

### 5. JPA Entity 분리

기본 원칙은 `Entity != Domain Model`.

- Domain Model: `app/{domain}/domain/model/`
- JPA Entity: `infra-jpa/`
- EntityMapper: `infra-jpa/`
- Domain Model은 JPA annotation, Spring persistence 기술에 의존하지 않음

## 작업 절차

### 설계/리뷰 요청 시

1. 프로젝트의 모듈 목록 확인
   - `settings.gradle`, `settings.gradle.kts`
   - 루트 `build.gradle`, `build.gradle.kts`
   - `app-*`, `core-*`, `infra-*`, `support-*` 디렉토리
2. 요청이 모듈 구조인지 app 내부 구조인지 분류
3. 관련 참조 문서 읽기
4. 현재 구조와 표준 규칙의 차이를 표로 정리
5. 변경이 필요하면 최소 변경 경로 제안
6. 예외가 필요한 경우 이유와 영향 범위 명시

### 구현 요청 시

1. 기존 패키지/모듈 구조를 먼저 확인
2. 새 코드는 가장 좁은 책임 위치에 배치
3. 의존성 추가 전 방향성 검증
4. DTO, Command, Domain Model, Entity 역할을 섞지 않음
5. 변경 후 다음 항목 검증
   - Gradle 의존성 방향
   - 패키지 레이어 방향
   - 트랜잭션 경계 위치
   - 도메인 간 직접 참조 여부
   - Entity/Domain Model 분리 여부

### Java 프로젝트에 적용할 때

원본 문서는 Kotlin 예시가 많지만 원칙은 Java에도 동일하게 적용한다.

- `data class` 예시는 Java record/class로 변환
- Kotlin top-level/object 예시는 Java class/static factory로 변환
- Spring annotation, Gradle 멀티모듈, 레이어/모듈 의존 규칙은 동일하게 유지

## 응답 형식

아키텍처 검토 결과는 가능하면 아래 구조로 답한다.

1. **판단 요약**
2. **현재 구조와 표준 차이**
3. **권장 구조**
4. **변경 작업 목록**
5. **주의할 예외/트레이드오프**
6. **검증 체크리스트**

## 금지 사항

- 표준과 다른 구조를 임의로 새로 발명하지 않음
- `Service` 이름을 application orchestration과 domain logic에 혼용하지 않음
- 편의를 위해 Controller에서 Repository/Domain Service 직접 호출하지 않음
- infra 모듈에 비즈니스 로직을 넣지 않음
- support 모듈에 Spring application/domain 의존성을 넣지 않음
- JPA Entity를 Domain Model처럼 app 내부에서 직접 사용하지 않음
