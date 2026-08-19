# Kotlin/Spring Boot 멀티모듈 아키텍처 가이드

## 목차
- [개요](#개요)
- [용어 정리](#용어-정리)
- [모듈 그룹 구조](#모듈-그룹-구조)
- [모듈 그룹별 정의](#모듈-그룹별-정의)
  - [app 모듈 그룹](#app-모듈-그룹)
  - [core 모듈 그룹](#core-모듈-그룹)
  - [infra 모듈 그룹](#infra-모듈-그룹)
  - [support 모듈 그룹](#support-모듈-그룹)
- [모듈 의존성 규칙](#모듈-의존성-규칙)
- [Gradle 의존성 설정](#gradle-의존성-설정)
- [네이밍 컨벤션](#네이밍-컨벤션)

---

## 개요

Kotlin/Spring Boot 기반의 멀티모듈 프로젝트에서 **4개 모듈 그룹** 아키텍처를 적용하면 관심사를 명확히 분리하고, 모듈 간 재사용성과 유지보수성을 높일 수 있다.

이 문서는 특정 도메인에 종속되지 않는 범용 아키텍처 패턴을 다룬다. 이커머스, SaaS, 핀테크 등 어떤 도메인이든 동일하게 적용할 수 있다.

**핵심 설계 원칙:**
- 4개 모듈 그룹 (app, core, infra, support) 분리
- 단방향 의존성 (app → core → infra → support)
- 역방향 의존 금지
- 각 그룹별 명확한 책임 영역

---

## 용어 정리

| 용어 | 정의 | 예시 |
|------|------|------|
| **모듈** | Gradle 모듈 (빌드 단위) | app-order, core-notification, infra-jpa 등 |
| **모듈 그룹** | 동일 성격의 모듈 집합 | app, core, infra, support |
| **레이어** | app 모듈 내부의 애플리케이션 아키텍처 계층 | api, application, domain, infrastructure |

> **주의:** "레이어"는 오직 app 모듈 내부 구조에만 사용한다. 모듈 간 구조는 "모듈" 또는 "모듈 그룹"으로 표현한다.

---

## 모듈 그룹 구조

4개 모듈 그룹이 계층적으로 구성되어 명확한 의존 방향을 가진다.

```mermaid
flowchart TB
    subgraph app["app 그룹"]
        app-boot["app-boot<br/>(조립 전용)"]
        app-order["app-order<br/>(주문 비즈니스)"]
        app-product["app-product<br/>(상품 비즈니스)"]
        app-payment["app-payment<br/>(결제 비즈니스)"]
    end
    
    subgraph core["core 그룹"]
        core-web["core-web"]
        core-notification["core-notification"]
        core-tx["core-tx"]
        core-resilience["core-resilience"]
        core-event["core-event"]
        core-cache["core-cache"]
        core-search["core-search"]
    end
    
    subgraph infra["infra 그룹"]
        infra-jpa["infra-jpa"]
        infra-redis["infra-redis"]
        infra-kafka["infra-kafka"]
        infra-elasticsearch["infra-elasticsearch"]
        infra-s3["infra-s3"]
    end
    
    subgraph support["support 그룹"]
        support-logging["support-logging"]
        support-util["support-util"]
        support-test["support-test"]
    end
    
    app-boot --> app-order
    app-boot --> app-product
    app-boot --> app-payment
    app-order --> core
    app-product --> core
    app-payment --> core
    core --> infra
    app --> support
    core --> support
    infra --> support
```

모듈 그룹 간 의존성은 **위에서 아래로 단방향**으로만 흐른다.

> **헥사고널 전제:** app 비즈니스 모듈은 infra를 컴파일 시점에 의존하지 않는다 (port·어댑터 분리). infra 모듈이 app 타입을 참조해야 할 때는 `compileOnly`만 허용한다. 런타임 조립은 app-boot가 `runtimeOnly`로 담당한다.

```mermaid
flowchart LR
    app-boot --> app-order
    app-order --> core
    core --> infra
    app-boot --> support
    app-order --> support
    core --> support
    infra -.->|compileOnly 예외| app-order
    app-boot -.->|runtimeOnly 조립| infra
```

---

## 모듈 그룹별 정의

### app 모듈 그룹

**성격:** 비즈니스 로직. 각 app은 독립된 배포 단위. core, support 의존 가능. **infra는 컴파일 시점 비의존** (헥사고널) — 런타임에 app-boot가 조립한다.

| 모듈 | 성격 | 포함 내용 |
|------|------|----------|
| `app-boot` | 조립 전용 | @SpringBootApplication, 설정 클래스, Bean 조립 |
| `app-order` | 주문 비즈니스 | 주문 생성, 주문 상태 관리, 주문 이력 등 |
| `app-product` | 상품 비즈니스 | 상품 등록, 재고 관리, 카테고리 등 |
| `app-payment` | 결제 비즈니스 | 결제 처리, 환불, 정산 등 |
| `app-admin` | (예시) 관리자 | 사용자 관리, 시스템 모니터링 |
| `app-batch` | (예시) 배치 작업 | 스케줄링, 대량 데이터 처리 |

> **app-boot의 역할:** `app-boot`는 비즈니스 로직을 포함하지 않는다. 오직 모든 모듈을 조립하여 실행 가능한 Spring Boot 애플리케이션을 만드는 것이 유일한 책임이다.

### core 모듈 그룹

**성격:** 재사용 가능한 공통 컴포넌트. infra를 조합해서 고수준 기능 제공. app을 모른다 (역방향 의존 없음).

| 모듈 | 성격 | 포함 내용 |
|------|------|----------|
| `core-web` | 웹 공통 기능 | 공통 예외 처리, API 응답 포맷, 인증/인가 필터 |
| `core-notification` | 알림 통합 | 알림 추상화 (Slack, Email, Push 등 infra 조합) |
| `core-tx` | 트랜잭션 관리 | 트랜잭션 템플릿, 분산 트랜잭션, Saga 패턴 |
| `core-resilience` | 장애 회복 | Circuit Breaker, Retry, Timeout, Fallback |
| `core-event` | 이벤트 처리 | 이벤트 발행/구독, 비동기 처리, 이벤트 소싱 |
| `core-cache` | 캐시 통합 | 캐시 추상화, 다중 캐시 전략 (Local + Redis 조합) |
| `core-search` | 검색 통합 | 검색 추상화, Elasticsearch 조합, 인덱싱 전략 |

> **core의 핵심 가치:** core는 app을 모르므로, 다른 프로젝트에서 그대로 재사용할 수 있다. 예를 들어 `core-notification`을 이커머스와 SaaS 프로젝트 모두에서 사용 가능하다.

### infra 모듈 그룹

**성격:** 외부 시스템과의 순수 연동. 단일 책임 (하나의 외부 시스템만 담당). 비즈니스 로직 없음.

| 모듈 | 성격 | 포함 내용 |
|------|------|----------|
| `infra-jpa` | DB 연동 | @Entity, JpaRepository, EntityMapper (Entity ↔ Domain 변환) |
| `infra-redis` | Redis 연동 | RedisTemplate, 캐시/세션 저장소 |
| `infra-kafka` | Kafka 연동 | Producer/Consumer, 토픽 설정 |
| `infra-elasticsearch` | 검색엔진 연동 | Elasticsearch 클라이언트, 인덱스 관리 |
| `infra-s3` | S3 연동 | 파일 업로드/다운로드 |
| `infra-slack` | Slack API | 메시지 전송 클라이언트 |
| `infra-email` | 이메일 전송 | SMTP/SES 클라이언트 |

> **infra의 핵심 원칙:** 각 infra 모듈은 단 하나의 외부 시스템만 담당한다. `infra-jpa`가 Redis를 알거나, `infra-kafka`가 Elasticsearch를 참조하는 것은 금지된다. infra 모듈 간 의존도 금지한다.

### support 모듈 그룹

**성격:** Cross-cutting concerns. 모든 모듈에서 의존 가능. 비즈니스 무관한 순수 유틸리티.

| 모듈 | 성격 | 포함 내용 |
|------|------|----------|
| `support-logging` | 로깅 | 구조화된 로깅, MDC 관리, 로그 포맷 |
| `support-util` | 공통 유틸리티 | 날짜/시간, 문자열, JSON 유틸 |
| `support-test` | 테스트 지원 | 테스트 픽스처, Mock 빌더, 테스트 유틸 |

> **support의 특성:** support는 어떤 모듈에도 의존하지 않는다. 가장 하위에 위치하며, 의존 그래프의 리프 노드 역할을 한다.

---

## 모듈 의존성 규칙

| From | To | 허용 | 설명 |
|------|----|:----:|------|
| app-boot | app | O | 조립 대상 비즈니스 모듈 (`implementation`) |
| app-boot | infra | O | 런타임 조립 (`runtimeOnly`) |
| app-boot | core · support | O | 조립 전용이므로 모두 의존 가능 |
| app | core | O | 공통 컴포넌트 사용 (tx, resilience, notification, cache, event 등) |
| app | infra | **X** | 컴파일 시점 금지 (헥사고널). port interface만 알고 구현은 app-boot가 런타임 조립 |
| app | support | O | 로깅 등 cross-cutting 유틸리티 |
| core | infra | O | infra 조합해서 고수준 기능 제공 |
| core | support | O | cross-cutting 유틸리티 |
| core | app | **X** | **역방향 의존 금지** |
| infra | support | O | cross-cutting 유틸리티 |
| infra | app | **X** | **역방향 의존 금지 — 단, 매핑용 `compileOnly`는 예외** (EntityMapper가 Domain Model/port 타입을 컴파일 시점에만 참조, 런타임 전이 없음) |
| infra | core | **X** | **역방향 의존 금지** |
| infra | infra | **X** | **infra 간 의존 금지** |

**핵심 원칙:**
- **단방향 의존:** app → core → infra → support
- **역방향 의존 금지:** 하위 모듈이 상위 모듈을 참조할 수 없음 (유일한 예외: infra → app `compileOnly` 매핑 의존)
- **app은 infra를 컴파일 시점에 모름:** 영속성 구현은 port(interface)로 추상화하고 app-boot가 런타임 조립
- **infra 간 의존 금지:** infra 모듈끼리 서로 참조 불가
- **core 재사용:** core는 app을 모르므로 다른 프로젝트에서 재사용 가능

> **왜 단방향인가?** 의존 방향을 엄격히 제한하면, 하위 모듈의 변경이 상위 모듈에 영향을 주지 않는다. 예를 들어 `infra-jpa`를 `infra-mongodb`로 교체해도 core 모듈은 수정할 필요가 없다.

---

## Gradle 의존성 설정

### 루트 build.gradle.kts — 버전/BOM 관리 (모든 모듈의 기반)

boot 플러그인이 없는 비-boot 모듈은 BOM을 상속받지 못하므로, **루트에서 `platform()`으로 일괄 주입**한다.

```kotlin
// 루트 build.gradle.kts
plugins {
    id("org.springframework.boot") version "3.4.4" apply false
    kotlin("jvm") version "1.9.25" apply false
    kotlin("plugin.spring") version "1.9.25" apply false
    kotlin("plugin.jpa") version "1.9.25" apply false
}

val springBootVersion = "3.4.4"

allprojects {
    group = "com.example"
    version = "0.0.1-SNAPSHOT"
    repositories { mavenCentral() }
}

// 리프 모듈(실제 코드를 담은 모듈)에만 공통 적용
configure(subprojects.filter { it.childProjects.isEmpty() }) {
    apply(plugin = "org.jetbrains.kotlin.jvm")

    dependencies {
        // ⚠️ io.spring.gradle.dependency-management의
        // configure<DependencyManagementExtension>는 boot 플러그인 미적용 모듈에서
        // Unresolved reference가 난다 — platform()으로 BOM을 주입한다.
        "implementation"(platform("org.springframework.boot:spring-boot-dependencies:$springBootVersion"))
    }

    configure<org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension> {
        jvmToolchain(17)
    }
}
```

> **함정 1 — BOM 미상속:** boot 플러그인이 없는 모듈에서 `org.springframework.boot:spring-boot-starter-web`을 버전 없이 쓰면 `Could not find ...` 오류가 난다. 루트의 `platform()` 주입으로 해결한다.
>
> **함정 2 — JAVA_HOME:** `./gradlew` 실행 시 "Unable to locate a Java Runtime"이면 JDK 17+ 설치 및 `JAVA_HOME` 지정이 필요하다. `jvmToolchain(17)`은 빌드 JVM은 찾은 뒤에만 동작한다.

### app-boot (조립 전용)

```kotlin
// app/app-boot/build.gradle.kts
plugins {
    id("org.springframework.boot")
    kotlin("plugin.spring")
}

configurations {
    // 함정 3 — boot 플러그인의 developmentOnly는 BOM을 상속받지 않아
    // devtools 버전이 미해결("Could not find ...:spring-boot-devtools:.")된다.
    // implementation(→ platform 포함)을 상속시켜 버전을 푼다.
    developmentOnly {
        extendsFrom(configurations.implementation.get())
    }
}

dependencies {
    // ① 비즈니스 모듈은 implementation (조립 대상)
    implementation(project(":app:app-order"))
    implementation(project(":app:app-product"))

    // ② 인프라 선택은 runtimeOnly (런타임 조립 — 코드에서 참조 금지 강제)
    runtimeOnly(project(":infrastructure:infra-jpa"))

    // ③ 프레임워크 의존은 boot가 직접 선언 (app 모듈에 위임하지 않음)
    implementation("org.springframework.boot:spring-boot-starter-web")

    developmentOnly("org.springframework.boot:spring-boot-devtools")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
```

> **app-boot 원칙 (헥사고널):**
> - `implementation(app-*)` — 조립 대상 비즈니스 모듈
> - `runtimeOnly(infra-*)` — 런타임에만 조립할 인프라 선택 (컴파일 시점 참조 차단)
> - 프레임워크(starter-web 등)는 boot가 직접 선언 — app 비즈니스 모듈에 중복 선언하지 않음
> - `runtimeOnly`는 "코드에서 타입을 쓰지 않는 순수 런타임 조각/인프라 선택" 전용. 타입을 참조해야 하면 `implementation`이다.

### app-order (비즈니스 로직 — infra를 모름)

```kotlin
// app/app-order/build.gradle.kts
plugins {
    kotlin("plugin.spring")
}

dependencies {
    implementation(project(":core:core-web"))
    implementation(project(":core:core-event"))
    implementation(project(":support:support-logging"))
    // ⚠️ infra-jpa 의존 금지 — Repository port(interface)만 알고,
    // 구현은 app-boot가 runtimeOnly(infra-jpa)로 런타임 조립한다 (헥사고널).
}
```

### infra-jpa (외부 시스템 연동 — app을 compileOnly로만 참조)

```kotlin
// infrastructure/infra-jpa/build.gradle.kts
plugins {}

dependencies {
    // 헥사고널: EntityMapper/RepositoryImpl이 app의 Domain Model + port 타입을
    // 컴파일 시점에만 참조한다. implementation이면 app 의존이 소비자에게 전이되어
    // "infra → app 금지" 위반이 된다.
    compileOnly(project(":app:app-order"))

    api("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("org.postgresql:postgresql")
}
```

### api() vs implementation() vs compileOnly() 사용 기준

| 스코프 | 용도 | 예시 |
|--------|------|------|
| `api()` | 전이적 인터페이스 노출이 필요할 때 | infra-jpa가 app 모듈의 인터페이스를 전이적으로 제공해야 할 때 |
| `implementation()` | 내부 구현 의존 | 대부분의 모듈 간 의존, boot의 app 모듈 의존 |
| `compileOnly()` | 컴파일 시점 타입 참조만 (런타임 전이 없음) | infra → app 매핑 의존 (EntityMapper가 Domain Model/port 참조) |
| `runtimeOnly()` | 런타임에만 필요한 조립용 의존 | app-boot에서 인프라 모듈 등록 (순수 런타임 조각/인프라 선택 전용) |

---

## 네이밍 컨벤션

모듈 이름은 `{그룹}-{이름}` 형식을 따른다.

| 그룹 | 예시 | 설명 |
|------|------|------|
| app | app-boot, app-order, app-product, app-admin | 애플리케이션 모듈 |
| core | core-web, core-notification, core-tx, core-event | 공통 컴포넌트 |
| infra | infra-jpa, infra-redis, infra-kafka, infra-s3 | 외부 시스템 어댑터 |
| support | support-logging, support-util, support-test | 횡단 관심사 |

### 모듈 디렉터리 계층화 — 정답 레시피

**규칙: Gradle 모듈 경로 = 디렉터리 경로, 디렉터리명 = 모듈명(접두 포함).** 별도 매핑 없이 `include`만 쓴다.

```text
backend/
├── settings.gradle.kts
├── app/                    # 그룹 디렉터리 (소문자)
│   ├── app-boot/           # 모듈 디렉터리 = 모듈명
│   └── app-order/
├── core/
│   └── core-web/
├── infrastructure/         # 그룹 디렉터리는 예외적으로 풀네임 허용
│   └── infra-jpa/
└── support/
    └── support-logging/
```

```kotlin
// settings.gradle.kts — 경로가 디렉터리와 동일하므로 이것만으로 끝
include(
    ":app:app-boot",
    ":app:app-order",
    ":core:core-web",
    ":infrastructure:infra-jpa",
    ":support:support-logging",
)
```

**금지 사항 (실제로 겪은 시행착오):**

| 금지 | 이유 |
|------|------|
| `project(":core:web").name = "core-web"` 리네임 | Gradle에서 `.name` 변경은 **경로까지 변경**한다 (`:core:web` → `:core:core-web`). 기존 `project(":core:web")` 참조가 전부 깨진다. 이름을 바꾸려면 디렉터리명을 바꾸고 include 경로를 고친다. |
| `projectDir` 매핑으로 이중 네이밍 (`:app:order` → 디렉터리 `app-order`) | 디렉터리명 ≠ 모듈명인 2중 네이밍이 생겨 혼란의 원인이 된다. 매핑이 필요하면 구조가 잘못된 것이다. |
| 접두 제거로 "통일" (`:app:boot`) | 접두는 그룹 소속 식별자다. `app-boot`, `core-web`, `infra-jpa`처럼 **모듈명에는 항상 그룹 접두를 붙인다.** 그룹 디렉터리명(`infrastructure`)과 모듈 접두(`infra-`)가 다른 것은 허용한다. |

### 패키지 컨벤션

| 모듈 그룹 | 패키지 패턴 | 예시 |
|----------|------------|------|
| app | `com.{회사}.{서비스}.{도메인}.{레이어}` | `com.example.shop.order.api.http` |
| core | `com.{회사}.core.{모듈명}` | `com.example.core.notification` |
| infra | `com.{회사}.infra.{외부시스템}` | `com.example.infra.jpa` |
| support | `com.{회사}.support.{모듈명}` | `com.example.support.logging` |
