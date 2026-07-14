---
name: me-refactor-oop-simple-9-principles
description: Use when refactoring or reviewing backend business logic in Java/Spring, Kotlin/Spring, Node.js/NestJS, or similar server code, especially if the user wants a practical take on object calisthenics or the code shows deep if/else nesting, large services, primitive obsession, value object or first-class collection questions, getter/setter or JPA entity concerns, tell-don’t-ask issues, or domain logic leaking across layers.
---

# Pragmatic Backend OO Refactoring

객체지향 생활체조를 교리처럼 밀어붙이지 말고,
백엔드 실무 코드에서 **복잡도와 변경 비용을 낮추는 방향으로만 선택적으로 적용**한다.

핵심은 세 가지다.

- **도메인 핵심에는 더 엄격하게 적용한다.**
- **프레임워크 경계에는 더 실용적으로 적용한다.**
- **패턴 자체보다 변경 축과 유지보수 비용을 먼저 본다.**

## 적용 대상

다음 요청에 이 스킬을 사용한다.

- “객체지향 생활체조를 실무적으로 적용해줘”
- “Spring/Nest 서비스가 너무 비대하다”
- “if/else 분기가 많고 depth가 깊다”
- “Money, Email, OrderLines 같은 값 객체가 필요한지 판단해줘”
- “getter/setter 남용을 줄이고 싶다”
- “Tell, Don’t Ask 쪽으로 리팩토링하고 싶다”
- “JPA 엔티티가 너무 빈약하거나 setter 위주다”

다음 경우에는 약하게 적용하거나 생략한다.

- 단순 DTO, Request/Response, serializer 전용 구조
- ORM 매핑을 위한 보일러플레이트 코드
- 일회성 배치/스크립트처럼 모델링보다 속도가 중요한 코드
- 이미 충분히 단순하고 변경 축이 뚜렷하지 않은 코드

## 먼저 레이어를 구분한다

리팩토링 제안 전에, 이 코드가 어디에 속하는지 먼저 판단한다.

| 레이어 | 의미 | 적용 강도 |
|---|---|---|
| Domain Core | 상태 전이, 금액 계산, 정책 판단, 유효성 규칙처럼 비즈니스 핵심이 있는 코드 | 강하게 적용 |
| Application / Service | 유스케이스 오케스트레이션, 트랜잭션 경계, 외부 호출 순서 제어 | 중간 강도 적용 |
| Framework Boundary | Controller, DTO, ORM Entity 매핑, serializer, client adapter | 실용적으로 적용 |

### 레이어별 기본 원칙

- **Domain Core**: 값 객체, 일급 컬렉션, 의도 드러나는 메서드, Tell-Don’t-Ask를 우선한다.
- **Application / Service**: 깊은 중첩 제거, 정책 위임, 역할 분리를 우선한다.
- **Framework Boundary**: getter/setter 존재 자체를 문제 삼지 말고, 도메인 규칙이 새는 구조를 문제 삼는다.

## 객체지향 생활체조 9원칙의 실무형 해석

| 원칙 | 실무형 해석 | 적용 신호 | 과하게 적용하지 말 곳 |
|---|---|---|---|
| 1. 한 메서드에 한 단계 들여쓰기 | depth 2까지는 허용. **3 이상이면 경계**하고 guard clause나 메서드 추출을 우선한다. | 중첩 if, 깊은 loop | 짧은 예외 처리, 단순 반복 |
| 2. else를 쓰지 않는다 | 단순 2지선다 else는 허용. **분기가 계속 늘어날 때만** 구조를 바꾼다. | 상태/정책 분기 증가 | 단순 null/empty 분기 |
| 3. 모든 원시값/문자열 포장 | **비즈니스 규칙이 있는 값만** 값 객체로 감싼다. | Email, Money, Quantity, DateRange | 반복문 변수, 단순 DTO 필드 |
| 4. 한 줄에 점 하나 | 진짜 목적은 점 개수가 아니라 **Tell, Don’t Ask**다. | `getA().getB()` 체인 뒤 외부 계산 | Builder, Stream, ORM DSL |
| 5. 축약 금지 | 도메인 용어는 풀고, `id`, `url`, `dto` 같은 관용 축약은 허용한다. | 긴 이름이 자주 충돌함 | 보편 기술 약어 |
| 6. 엔티티를 작게 유지 | 줄 수보다 **수정 이유가 몇 개인지** 본다. | God service, Repository+Client+Validator 혼재 | 설정/매핑 전용 클래스 |
| 7. 인스턴스 변수 3개 이하 | 숫자 규칙보다 **논리적 그룹화**를 우선한다. | Address, Period, Price 묶기 | wide DTO, DB Entity |
| 8. 일급 컬렉션 사용 | 컬렉션에 규칙/계산이 있을 때만 래핑한다. | total, dedupe, sort rule, validation | 단순 조회용 List |
| 9. getter/setter 금지 | **무의미한 setter는 금지**, getter는 DTO/View/ORM에서 허용한다. | `setStatus()` 남발, 서비스가 getter로 핵심 계산 | serializer/JPA 필수 접근자 |

## 판단 순서

리팩토링을 제안할 때는 아래 순서를 따른다.

### 1. 문제를 규칙으로 보지 말고 변경 비용으로 본다

먼저 아래 냄새를 찾는다.

- depth가 깊다
- 분기 수가 점점 늘어난다
- 같은 검증 로직이 여러 곳에 반복된다
- getter로 값을 꺼내와 서비스에서 핵심 규칙을 계산한다
- 값에 규칙이 있는데 그냥 `String`, `number`, `BigDecimal`로 흩어져 있다
- 컬렉션 계산/검증 로직이 서비스 곳곳에 퍼져 있다

### 2. 그 분기가 정말 자주 변하는지 본다

분기 자체가 나쁜 것이 아니다.

- 거의 안 바뀌는 단순 분기면 그대로 두는 편이 더 낫다.
- 새 상태/정책/타입이 자주 추가되는 분기라면 정책 객체, 전략 패턴, enum dispatch를 고려한다.

### 3. 가장 작은 변경으로 가장 큰 효과를 노린다

보통 아래 순서가 안전하다.

1. guard clause로 중첩 제거
2. 의미 단위 private 메서드 추출
3. 반복되는 규칙을 값 객체로 이동
4. 컬렉션 관련 규칙을 일급 컬렉션으로 이동
5. setter를 의도 있는 행동 메서드로 교체
6. 분기 증가 지점에만 전략/정책 객체 도입

처음부터 전략 패턴, 팩토리, 추상화 계층을 한꺼번에 늘리지 않는다.

### 4. 무거운 추상화 전에 더 가벼운 대안도 비교한다

특히 TypeScript/NestJS에서는 아래 대안이 더 적절할 수 있다.

- validation helper 함수
- branded type / opaque type
- 작은 mapper 함수
- policy map / 함수 테이블
- read model / query DTO 분리

값 객체나 일급 컬렉션은 **지금 겪는 중복과 규칙 누수**를 줄일 때만 도입한다.

### 5. 영속화와 트랜잭션 경계를 확인한다

실무 백엔드에서는 설계 순수성보다 이 부분이 더 자주 병목이 된다.

- 메서드 추출/이동이 `@Transactional` 경계에 영향을 주는지 확인한다.
- JPA/TypeORM/Prisma 매핑이 새 값 객체 구조를 감당할 수 있는지 확인한다.
- 엔티티를 도메인 모델처럼 쓸지, 영속성 모델로만 둘지 명시한다.
- 직렬화/역직렬화에서 값 객체가 과도한 마찰을 만드는지 본다.

### 6. 멈출 선을 분명히 둔다

다음 중 하나라도 해당하면 여기서 멈춘다.

- 코드가 이미 충분히 평평해졌다
- 분기 증가 가능성이 낮다
- 값 객체 도입 비용이 규칙 중복보다 크다
- ORM/프레임워크 마찰이 커진다
- 팀이 읽기 더 어려워진다

목표는 “원칙 준수”가 아니라 **설명 가능한 구조**다.

## 자주 쓰는 리팩토링 패턴

### Guard Clause

비정상 케이스를 먼저 return/throw해서 본문을 평평하게 만든다.

### Tell, Don’t Ask

`user.getStatus()`를 꺼내 와서 서비스에서 판단하지 말고,
가능하면 `user.canActivate()` 또는 `user.activate()`처럼 객체에 행동을 맡긴다.

### Value Object for Invariants

유효성, 포맷, 반올림, 음수 금지, 단위 일치 같은 규칙은 값 객체 내부로 모은다.

### Intention-Revealing Method

`setStatus(ACTIVE)`보다 `activate()`가 낫다.
상태 변경의 이유와 허용 조건이 이름에 드러나야 한다.

### First-Class Collection When Behavior Exists

`List<OrderLine>`를 감싸는 이유는 예뻐 보이기 위해서가 아니다.
합계 계산, 중복 방지, 정렬 규칙, 최소/최대 개수 제한 같은 동작이 있을 때만 도입한다.

## 프레임워크별 메모

### Spring / JPA

- JPA Entity는 프레임워크 제약이 있으므로 getter 존재 자체를 문제 삼지 않는다.
- 진짜 문제는 **서비스가 getter로 꺼낸 값들로 핵심 규칙을 밖에서 계산하는 구조**다.
- setter 대신 `changeAddress(...)`, `activate()`, `cancel()` 같은 행동 메서드를 우선한다.
- `@Embedded`로 묶을 수 있는 필드는 후보로 본다.
- Repository, Client, Validator, Domain 로직이 한 클래스에 섞이면 분리 신호로 본다.
- 엔티티를 곧바로 풍부한 도메인 모델로 만들지, 영속성 모델로 제한할지는 먼저 명시한다.

### Node.js / NestJS

- 값 객체는 class 기반으로 만들 수도 있고, 더 가볍게 branded type + validator 조합으로 갈 수도 있다.
- 깊은 중첩은 guard clause와 함수 분리로 먼저 줄인다.
- 분기 증가가 보이면 strategy 객체, policy map, enum-like dispatch를 고려한다.
- DTO class와 domain model에 같은 기준을 강요하지 않는다.
- TypeORM/Prisma 매핑 마찰이 큰 경우, 도메인 객체와 persistence model을 분리하는 편이 낫다.

## 응답 형식

가능하면 아래 구조로 답한다.

1. **판단 요약**
2. **레이어 분류** — Domain / Service / Boundary 중 어디에 가까운지
3. **핵심 문제** — 가장 중요한 문제 2~4개
4. **실무형 리팩토링 제안** — 무엇을 바꾸고 어디서 멈출지
5. **작은 before/after 예시** — 가능하면 코드로
6. **트레이드오프** — 지금 안 해도 되는 것, 프레임워크 제약 때문에 예외 허용할 것

## 흔한 실수

### 1. DTO까지 전부 값 객체로 감싼다
규칙이 없는 전달 객체는 단순하게 둔다.

### 2. else를 무조건 제거하려 든다
단순 2지선다까지 과하게 추상화하면 오히려 읽기 어려워진다.

### 3. Stream/Builder/ORM 체인을 점 개수로만 비판한다
문제는 체인이 아니라 내부 구조를 캐와서 밖에서 계산하는 습관이다.

### 4. 클래스가 길다는 이유만으로 무조건 쪼갠다
줄 수보다 책임 분리가 핵심이다.

### 5. getter가 있다는 이유만으로 객체지향이 아니라고 판단한다
문제는 getter의 존재가 아니라 **getter 남용으로 핵심 규칙이 밖으로 새는 것**이다.

### 6. 분기가 보이자마자 전략 패턴부터 넣는다
분기 증가 속도와 변경 빈도를 먼저 확인한다.

### 7. ORM 매핑 비용을 무시하고 도메인 순수성만 추구한다
실무에서는 영속화 마찰도 설계 비용이다.

## 최종 기준

이 스킬은 객체지향 생활체조를 “정답”으로 다루지 않는다.
항상 아래 질문으로 마무리한다.

- 이 변경이 중복 규칙을 줄이는가?
- 이 변경이 분기와 결합을 실제로 낮추는가?
- 이 변경이 프레임워크/팀 맥락에서 유지 가능한가?

셋 다 “예”일 때만 적용한다.
