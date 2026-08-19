---
name: me-refactor-layered-arch
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
app -> support
app -> infra는 컴파일 시점 금지 (런타임 조립은 app-boot의 runtimeOnly)
infra -> app은 compileOnly 매핑 의존만 예외 허용
```

금지 기준:

- `core -> app` 금지
- `infra -> app` 금지 — 단, 매핑용 `compileOnly` 의존은 예외 (EntityMapper가 app의 Domain Model/port 타입을 컴파일 시점에만 참조)
- `infra -> core` 금지
- `infra -> infra` 금지
- `support -> app/core/infra` 금지
- `app -> infra` 컴파일 시점 금지 (헥사고널) — app은 port interface만 알고, app-boot가 런타임에 infra를 조립

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
- **application 계층(Facade, Command)이 api 계층의 Request/Response DTO에 직접 의존 금지** — Command는 domain model 타입만 참조한다. API DTO → Command 변환은 api 계층의 Mapper에서 끝낸다.
- **domain layer가 api/application 계층의 DTO/enum에 의존 금지** — domain service는 framework Web DTO, Swagger/Jackson request enum을 참조하지 않는다.
- **FQN(정규화된 이름, `com.example...ClassName`) 남용 금지** — 임시 회피가 아닌 이상 import 문으로 정리한다. 긴 FQN이 반복되면 설계 신호(계층 의존 위반 또는 네이밍 충돌)로 간주하고 근본 원인을 해결한다.

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

### 5. JPA Entity 분리 (헥사고널)

기본 원칙은 `Entity != Domain Model`이며, 배치 기준은 다음과 같다.

- Domain Model + **Repository port(interface)**: `app/{domain}/domain/model/`, `app/{domain}/infrastructure/`
- JPA Entity / EntityMapper / **Repository 구현체**: `infra-jpa/`
- Gradle: **`infra-jpa → app`은 `compileOnly`만 허용** (매핑을 위한 컴파일 시점 타입 참조, 런타임 전이 없음). app 모듈은 infra-jpa를 의존하지 않고, app-boot가 `runtimeOnly(infra-jpa)`로 런타임 조립한다.
- Domain Model은 JPA annotation, Spring persistence 기술에 의존하지 않음
- 반대로 app 모듈이 `implementation(infra-jpa)`로 Entity를 직접 참조하는 것은 위반 (Domain Model 오염)

### 6. DTO/Enum 계층 분리 및 Mapper 변환

API 계층의 Request/Response DTO( Jackson 역직렬화, Swagger 문서화 전용)와 domain model(순수 비즈니스 타입)은 분리한다.

**기본 원칙:**

- API request enum은 api 계층 전용. domain enum은 별도 존재.
- Facade/Command는 domain enum만 참조.
- API DTO → domain model 변환은 api 계층의 Mapper가 담당.
- 변환은 보통 `EnumType.valueOf(other.name)` 패턴 (상수명 동일 가정).

**이름 충돌 해결 — nested API enum 패턴:**

API enum과 domain enum이 같은 이름을 써야 할 때(예: 둘 다 `SortType`), API enum을 부모 Request 내부 nested enum으로 둔다:

```kotlin
// API 계층
data class TableRequest(
    val pageRequest: PageRequest<SortType>?,
) {
    enum class SortType { NAME, CODE, COUNT }  // nested
}

// Domain 계층
enum class TableSortType { NAME, CODE, COUNT }  // top-level
```

이렇게 하면 `TableRequest.SortType`(API) vs `TableSortType`(domain)로 스코프가 좁혀져 Mapper에서 import 충돌이 없다.

**FQN(정규화된 이름)은 임시 회피용:**

- 계층 의존 위반 또는 이름 충돌을 FQN으로 덮지 않는다.
- FQN이 반복되면 근본 원인(domain이 api DTO 참조 등)을 해결한다.
- 최종 코드에는 import 문만 남기고 타입명만 쓴다.

### 7. Facade 헬퍼 추출 기준

Facade는 유즈케이스 오케스트레이션(Reader/Service 호출 순서 조립)만 담당한다. 순수 로직이 Facade에 쌓이면 별도 서비스로 추출한다.

**추출 대상 (Facade에 두지 않는 것):**

- 순수 후처리 로직: filter / sort / paginate / merge / transform / map
- 이 로직들이 DB/Repository/외부 의존 없이 입력→출력만 처리하면 **domain service**로 추출.
- Reader/Repository 의존이 포함되면 **application service**로 추출.

**추출 신호:**

- Facade private 함수가 3개 이상
- Facade가 특정 컬렉션 후처리(filter/sort/pagination)를 인라인으로 갖음
- 같은 헬퍼 로직이 여러 Facade 메서드에서 중복

**이점:**

- Facade는 파이프라인 조립만 남아 읽기 쉬워짐
- 추출된 domain service는 순수 단위 테스트로 검증 가능 (DB 불필요)
- 블록 간 재사용 가능 (예: 동일한 sort/pagination 로직)

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
   - Entity/Domain Model 분리 여부 (infra-jpa → app이 `compileOnly`인지, app이 infra-jpa를 의존하지 않는지)
5. **빌드/기동 검증 — 문서만 고치고 끝내지 않는다**
   - `./gradlew build` 성공 확인 (전체 모듈)
   - boot 모듈 `./gradlew :app:app-boot:bootRun` 기동 확인 (조립 오류는 컴파일에서 안 터지고 기동에서 터진다)
   - `./gradlew` 실행 시 "Unable to locate a Java Runtime"이면 JDK 17+ 설치 + `JAVA_HOME` 지정 후 재시도 (`jvmToolchain`은 빌드 JVM을 찾은 뒤에만 동작)

### Java 프로젝트에 적용할 때

원본 문서는 Kotlin 예시가 많지만 원칙은 Java에도 동일하게 적용한다.

- `data class` 예시는 Java record/class로 변환
- Kotlin top-level/object 예시는 Java class/static factory로 변환
- Spring annotation, Gradle 멀티모듈, 레이어/모듈 의존 규칙은 동일하게 유지

## 실전 함정 (시행착오 기반 — 상세는 refs 참조)

| 함정 | 한 줄 규칙 | 상세 |
|---|---|---|
| Entity 배치 모순 | Entity/매퍼/리포지토리 구현은 infra-jpa, port는 app, infra→app은 `compileOnly`만 | [application-architecture.md](refs/application-architecture.md) "JPA Entity 분리 전략" |
| 비-boot 모듈 BOM | 루트에서 `implementation(platform(...))` 주입, `DependencyManagementExtension` 쓰지 않음 | [module-architecture.md](refs/module-architecture.md) "루트 build.gradle.kts" |
| devtools 버전 미해결 | boot 모듈에서 `developmentOnly { extendsFrom(implementation) }` | [module-architecture.md](refs/module-architecture.md) "app-boot" |
| 모듈 리네임 | `project(...).name=` 금지 — 경로까지 바뀌어 참조가 전부 깨짐. 디렉터리명을 바꾼다 | [module-architecture.md](refs/module-architecture.md) "모듈 디렉터리 계층화" |
| 접두 방향 | 모듈명은 항상 그룹 접두 포함 (`app-boot`, `core-web`, `infra-jpa`), 디렉터리 경로 = 모듈 경로 | [module-architecture.md](refs/module-architecture.md) "네이밍 컨벤션" |
| app-boot 중복 의존 | boot = `implementation(app)` + `runtimeOnly(infra)` + 프레임워크 직접 선언 | [module-architecture.md](refs/module-architecture.md) "app-boot" |
| JAVA_HOME | `./gradlew` 실패 시 JDK 17+ / `JAVA_HOME` 먼저 확인 | [module-architecture.md](refs/module-architecture.md) "루트 build.gradle.kts" |

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
