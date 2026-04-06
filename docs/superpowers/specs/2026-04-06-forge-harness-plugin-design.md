# Forge: OpenCode Harness Plugin Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Author:** Brainstormed with OpenCode AI

---

## 1. Overview

**Forge**는 OpenCode용 경량 멀티 에이전트 오케스트레이션 harness plugin이다. `@opencode-ai/plugin` SDK 위에 구축하며, 5개의 전문 에이전트와 카테고리 기반 모델 라우팅을 통해 범용 소프트웨어 개발 워크플로우를 자동화한다.

### Goals

- 경량 MVP: 실제 동작하는 최소 구현
- Modular Kernel 구조: 기능별 모듈 분리로 확장성 확보
- 카테고리 기반 라우팅: 모델명이 아닌 의도 기반으로 태스크 분배
- oh-my-openagent의 검증된 패턴을 참고하되, 복잡도를 대폭 축소

### Non-Goals (MVP 범위 외)

- Wisdom Accumulation (태스크 간 학습 축적)
- 계획 검증 에이전트 (Metis/Momus 역할)
- Fallback chain (모델 폴백)
- Claude/GPT 이중 프롬프트 시스템
- 배경 병렬 에이전트 실행

### Reference

- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — 설계 참고 원본
- `@opencode-ai/plugin` v1.2.24 — Plugin SDK

---

## 2. Agent Architecture

### 2.1 에이전트 구성 (5개)

```
                    ┌─────────────┐
                    │   Planner   │  Planning Layer
                    │ (READ-ONLY) │
                    └──────┬──────┘
                           │ .forge/plans/*.md
    ┌──────────────────────┼──────────────────────┐
    │                      ▼                      │
    │               ┌─────────────┐               │
    │               │    Pilot    │               │
    │               │ (Main Agent)│               │
    │               └──┬───┬───┬──┘               │
    │                  │   │   │                  │
    │         ┌────────┘   │   └────────┐         │
    │         ▼            ▼            ▼         │
    │   ┌──────────┐ ┌──────────┐ ┌───────────┐  │
    │   │  Worker  │ │ Scouter  │ │ Architect │  │
    │   │(Executor)│ │(Explorer)│ │(Consult.) │  │
    │   └──────────┘ └──────────┘ └───────────┘  │
    └─────────────────────────────────────────────┘
```

### 2.2 에이전트 요약표

| 에이전트  | 계층          | 역할                                      | 권한           | 위임 가능               | oh-my-openagent 대응 |
| --------- | ------------- | ----------------------------------------- | -------------- | ----------------------- | -------------------- |
| Pilot     | Orchestration | 메인 에이전트. 범용 수행 + 오케스트레이션 | 읽기/쓰기/실행 | Worker, Scouter, Architect | Sisyphus + Atlas  |
| Planner   | Planning      | 인터뷰 → 실행 계획 수립. READ-ONLY        | 계획 파일만    | Scouter, Architect      | Prometheus           |
| Architect | Consulting    | 아키텍처 자문, 설계 리뷰. READ-ONLY       | READ-ONLY      | Scouter                 | Oracle               |
| Worker    | Execution     | 단일 태스크 집중 실행. 위임 불가          | 읽기/쓰기/실행 | 없음                    | Sisyphus-Junior      |
| Scouter   | Utility       | 빠른 코드 탐색/패턴 검색. READ-ONLY       | READ-ONLY      | 없음                    | Explore              |

### 2.3 에이전트 상세

#### Pilot — 메인 오케스트레이터

| 항목                 | 내용                                             |
| -------------------- | ------------------------------------------------ |
| 계층                 | Orchestration                                    |
| 역할                 | 범용 작업 직접 수행 + 복잡한 작업 위임/분배/검증 |
| 권한                 | 읽기/쓰기/실행 (전체)                            |
| 위임 대상            | Worker, Scouter, Architect                       |
| 기본 카테고리        | `standard`                                       |
| oh-my-openagent 대응 | Sisyphus + Atlas                                 |

**핵심 행동:**

1. 사용자 요청의 복잡도를 판단
2. 간단한 작업은 직접 수행 (단일 파일 변경, 빠른 수정)
3. 복잡한 작업은 Scouter로 탐색 후 Worker에 태스크 분배
4. `.forge/plans/`에 계획이 있으면 이를 읽고 태스크 분배
5. Worker 결과물에 대해 린트/테스트 등 검증 수행

**프롬프트 원칙 (~100줄):**

- 복잡도 판단 기준: 단일 파일 변경 → 직접, 다중 파일/시스템 변경 → 위임
- 위임 시 카테고리와 상세 컨텍스트를 함께 전달
- 검증 실패 시 Worker에 재시도 지시

#### Planner — 전략적 기획자

| 항목                 | 내용                                           |
| -------------------- | ---------------------------------------------- |
| 계층                 | Planning                                       |
| 역할                 | 사용자 인터뷰 → 요구사항 정리 → 실행 계획 수립 |
| 권한                 | READ-ONLY (.forge/plans/*.md 파일만 생성/수정) |
| 위임 대상            | Scouter, Architect                                     |
| 기본 카테고리        | `deep`                                         |
| oh-my-openagent 대응 | Prometheus                                     |

**핵심 행동:**

1. 사용자에게 명확화 질문 (한 번에 하나씩)
2. Scouter에 기존 코드베이스 탐색 위임
3. 실행 가능한 태스크 목록이 담긴 계획 파일 작성
4. 각 태스크에 카테고리, 컨텍스트, 검증 기준 명시

**계획 파일 포맷 (`.forge/plans/{name}.md`):**

```markdown
# Plan: {name}

## Context
{배경 설명}

## Tasks
- [ ] Task 1: {설명}
  - category: standard
  - files: src/auth/middleware.ts
  - verify: 테스트 통과
- [ ] Task 2: {설명}
  - category: quick
  - files: src/config/index.ts
  - verify: 타입 체크 통과
```

#### Architect — 아키텍처 컨설턴트

| 항목                 | 내용                                         |
| -------------------- | -------------------------------------------- |
| 계층                 | Consulting                                   |
| 역할                 | 설계 자문, 아키텍처 리뷰, 복잡한 디버깅 상담 |
| 권한                 | READ-ONLY                                    |
| 위임 대상            | Scouter                                      |
| 기본 카테고리        | `deep`                                       |
| oh-my-openagent 대응 | Oracle                                       |

**핵심 행동:**

1. 아키텍처 질문에 대한 분석과 추천 제공
2. Scouter에 관련 코드 탐색 위임하여 근거 확보
3. 트레이드오프 분석, 설계 패턴 제안
4. 코드를 직접 수정하지 않음 — 조언만 제공

**사용 시나리오:**

- Pilot이 복잡한 설계 결정 시 Architect에 자문
- Planner가 계획 수립 중 기술적 방향 확인

#### Worker — 태스크 실행자

| 항목                 | 내용                                                |
| -------------------- | --------------------------------------------------- |
| 계층                 | Execution                                           |
| 역할                 | 단일 태스크 집중 실행 (코딩, 테스트 작성, 리팩토링) |
| 권한                 | 읽기/쓰기/실행                                      |
| 위임 대상            | 없음 (위임 불가)                                    |
| 기본 카테고리        | Pilot이 지정 (standard/deep/visual)                 |
| oh-my-openagent 대응 | Sisyphus-Junior                                     |

**핵심 행동:**

1. Pilot으로부터 전달받은 단일 태스크 집중 수행
2. TODO 추적하며 진행
3. 완료 전 자체 검증 (린트, 타입체크)
4. 다른 에이전트에 위임 불가 — `task()` 도구 접근 차단

**프롬프트 원칙 (~50줄):**

- Pilot이 상세 컨텍스트를 전달하므로 프롬프트는 최소한으로 유지
- "지능은 시스템에, 실행은 Worker에" 원칙
- MUST DO / MUST NOT DO 제약사항 준수

#### Scouter — 코드베이스 탐색기

| 항목                 | 내용                                 |
| -------------------- | ------------------------------------ |
| 계층                 | Utility                              |
| 역할                 | 빠른 코드 탐색, 패턴 검색, 구조 파악 |
| 권한                 | READ-ONLY                            |
| 위임 대상            | 없음 (위임 불가)                     |
| 기본 카테고리        | `quick`                              |
| oh-my-openagent 대응 | Explore                              |

**핵심 행동:**

1. grep, glob, AST 검색으로 코드 패턴 발견
2. 파일 구조 및 의존성 파악
3. 결과를 요약하여 호출자에게 반환
4. 저비용 고속 모델 사용 (속도 우선)

---

## 3. Category System

### 3.1 카테고리 정의

모델명이 아닌 **의도 기반**으로 태스크를 분류한다. 각 카테고리는 설정 파일에서 모델 매핑을 오버라이드할 수 있다.

| 카테고리 | 의도                 | 기본 모델 예시                  | 사용 시나리오                             |
| -------- | -------------------- | ------------------------------- | ----------------------------------------- |
| `quick`  | 단순/빠른 작업       | claude-haiku-4-5 / gpt-4o-mini  | 단일 파일 수정, 패턴 검색, 타입 오류 수정 |
| `standard` | 일반 개발 작업     | claude-sonnet-4-6 / gpt-4o      | 기능 구현, 테스트 작성, 일반 리팩토링     |
| `deep`   | 복잡한 추론/아키텍처 | claude-opus-4-6 / gpt-5.4       | 아키텍처 설계, 복잡한 디버깅, 계획 수립   |
| `visual` | 프론트엔드/UI        | gemini-3.1-pro                  | UI 컴포넌트, 스타일링, 레이아웃           |

### 3.2 카테고리 → 에이전트 기본 매핑

| 에이전트  | 기본 카테고리 | 이유                                        |
| --------- | ------------- | ------------------------------------------- |
| Pilot     | `standard`    | 범용 작업 수행, 필요시 다른 카테고리로 위임 |
| Planner   | `deep`        | 계획 수립은 높은 추론 능력 필요             |
| Architect | `deep`        | 아키텍처 자문은 높은 추론 능력 필요         |
| Worker    | 위임 시 지정  | Pilot이 태스크 성격에 맞게 카테고리 지정    |
| Scouter   | `quick`       | 탐색은 속도 우선, 고성능 불필요             |

### 3.3 설정 파일에서 오버라이드

```jsonc
// .forge/config.jsonc 또는 ~/.config/opencode/forge.jsonc
{
  "categories": {
    "quick":    { "model": "anthropic/claude-haiku-4-5" },
    "standard": { "model": "anthropic/claude-sonnet-4-6" },
    "deep":     { "model": "openai/gpt-5.4" },
    "visual":   { "model": "google/gemini-3.1-pro" }
  },
  "agents": {
    "pilot":     { "model": "anthropic/claude-opus-4-6" },
    "architect": { "model": "openai/gpt-5.4" }
  }
}
```

우선순위: `agents.{name}.model` > `categories.{category}.model` > 기본값

---

## 4. Project Structure (Modular Kernel)

```
forge-plugin/
├── src/
│   ├── index.ts                  # Plugin 진입점 (Plugin 타입 구현)
│   ├── kernel/
│   │   ├── agent-registry.ts     # 에이전트 등록/조회/위임 규칙
│   │   ├── category-router.ts    # 카테고리 → 모델 매핑 엔진
│   │   └── types.ts              # 내부 타입 정의
│   ├── agents/
│   │   ├── pilot.ts              # Pilot 에이전트 정의 + 프롬프트
│   │   ├── planner.ts            # Planner 에이전트 정의 + 프롬프트
│   │   ├── architect.ts          # Architect 에이전트 정의 + 프롬프트
│   │   ├── worker.ts             # Worker 에이전트 정의 + 프롬프트
│   │   └── scouter.ts            # Scouter 에이전트 정의 + 프롬프트
│   ├── hooks/
│   │   ├── model-router.ts       # chat.message 훅: 카테고리 기반 모델 라우팅
│   │   ├── agent-registrar.ts    # config 훅: 에이전트를 OpenCode에 등록
│   │   └── event-logger.ts       # event 훅: 세션 이벤트 로깅 (디버깅용)
│   ├── tools/
│   │   └── start-work.ts         # /start-work 커맨드: 계획 기반 실행 시작
│   └── config/
│       ├── schema.ts             # 설정 스키마 (Zod)
│       └── loader.ts             # 설정 파일 로드 (user + project 레벨)
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Plugin Integration

### 5.1 진입점 (src/index.ts)

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "./config/loader"
import { createAgentRegistry, registerAgents } from "./kernel/agent-registry"
import { createCategoryRouter, routeByCategory } from "./kernel/category-router"
import { startWork } from "./tools/start-work"
import { logEvent } from "./hooks/event-logger"

const ForgePlugin: Plugin = async (ctx) => {
  // 1. 설정 로드 (user + project 레벨)
  const config = loadConfig(ctx.directory)

  // 2. 에이전트 레지스트리 초기화
  const registry = createAgentRegistry(config)

  // 3. 카테고리 라우터 초기화
  const router = createCategoryRouter(config)

  return {
    name: "forge",

    // 에이전트를 OpenCode에 등록
    config: async (openCodeConfig) => {
      registerAgents(openCodeConfig, registry, router)
    },

    // 카테고리 기반 모델 라우팅
    "chat.message": async (input, output) => {
      routeByCategory(input, output, registry, router)
    },

    // 세션 이벤트 로깅
    event: async ({ event }) => {
      logEvent(event)
    },

    // /start-work 커맨드
    "command.execute.before": async (input, output) => {
      if (input.command === "start-work") {
        await startWork(ctx, input, output, registry)
      }
    },

    // Worker의 task() 도구 접근 차단
    "tool.execute.before": async (input, output) => {
      if (input.tool === "task" && registry.isWorkerSession(input.sessionID)) {
        output.args = { _blocked: "Worker cannot delegate tasks to other agents" }
      }
    },
  }
}

export default ForgePlugin
```

### 5.2 핵심 훅 동작

**config 훅 — 에이전트 등록:**

```typescript
// openCodeConfig.agent에 5개 에이전트 등록
openCodeConfig.agent = {
  ...openCodeConfig.agent,
  pilot:     { system: pilotPrompt,     model: router.resolve("pilot", "standard") },
  planner:   { system: plannerPrompt,   model: router.resolve("planner", "deep") },
  architect: { system: architectPrompt, model: router.resolve("architect", "deep") },
  worker:    { system: workerPrompt,    model: router.resolve("worker", "standard") },
  scouter:   { system: scouterPrompt,   model: router.resolve("scouter", "quick") },
}
```

**chat.message 훅 — 모델 라우팅:**

```typescript
// 현재 에이전트의 카테고리를 확인하고 적절한 모델로 라우팅
const agentName = input.agent
const category = registry.getCategoryFor(agentName)
const resolved = router.resolveModel(category)
if (resolved && input.model) {
  input.model.providerID = resolved.providerID
  input.model.modelID = resolved.modelID
}
```

**tool.execute.before 훅 — Worker 위임 차단:**

```typescript
// Worker 세션에서 task() 호출 시 차단
if (input.tool === "task" && registry.isWorkerSession(input.sessionID)) {
  output.args = { _blocked: "Worker cannot delegate tasks" }
}
```

---

## 6. Data Flow

### 6.1 간단한 작업 (Pilot 직접 수행)

```
User: "이 함수 이름을 calculateTotal로 변경해줘"
  → Pilot (기본 에이전트)
  → 직접 파일 수정
  → 완료
```

### 6.2 복잡한 작업 — 자동 모드

```
User: "JWT 인증 시스템을 추가해줘"
  → Pilot: 복잡도 판단 → 위임 결정
  → task(agent:"scouter") → "기존 인증 패턴 검색"
  → Scouter 결과 반환: "Express 미들웨어 패턴 사용 중"
  → task(category:"standard") → Worker: "JWT 미들웨어 구현"
  → task(category:"standard") → Worker: "로그인 엔드포인트 구현"
  → task(category:"standard") → Worker: "테스트 작성"
  → Pilot: 린트/테스트 실행으로 검증
  → 완료 보고
```

### 6.3 복잡한 작업 — 정밀 모드

```
User → Tab → Planner 선택
  → Planner: 인터뷰 시작
  → Planner → task(agent:"scouter") → 코드베이스 탐색
  → (필요시) Planner → Architect에게 설계 자문 요청
  → Planner: .forge/plans/auth-system.md 생성

User: /start-work
  → Pilot: .forge/plans/auth-system.md 읽기
  → Pilot: 태스크 순서대로 Worker에 분배
  → Worker × N: 각 태스크 수행
  → Pilot: 각 결과 검증
  → 전체 완료 보고
```

---

## 7. Configuration

### 7.1 설정 파일 위치

| 레벨    | 경로                             | 용도                  |
| ------- | -------------------------------- | --------------------- |
| User    | `~/.config/opencode/forge.jsonc` | 전역 기본 설정        |
| Project | `.forge/config.jsonc`            | 프로젝트별 오버라이드 |

로드 순서: User → Project (Project가 User를 오버라이드)

### 7.2 설정 스키마

```typescript
import { z } from "zod"

const AgentOverrideSchema = z.object({
  model: z.string().optional(),
  prompt_append: z.string().optional(),
}).optional()

export const ForgeConfigSchema = z.object({
  categories: z.object({
    quick:    z.object({ model: z.string() }).optional(),
    standard: z.object({ model: z.string() }).optional(),
    deep:     z.object({ model: z.string() }).optional(),
    visual:   z.object({ model: z.string() }).optional(),
  }).optional(),

  agents: z.object({
    pilot:     AgentOverrideSchema,
    planner:   AgentOverrideSchema,
    architect: AgentOverrideSchema,
    worker:    AgentOverrideSchema,
    scouter:   AgentOverrideSchema,
  }).optional(),

  disabled_agents: z.array(
    z.enum(["planner", "architect", "worker", "scouter"])
  ).optional(),
})

export type ForgeConfig = z.infer<typeof ForgeConfigSchema>
```

### 7.3 OpenCode 등록

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugin": ["forge-plugin"]
}
```

---

## 8. File Conventions

### 8.1 .forge/ 디렉토리 구조

```
.forge/
├── config.jsonc          # 프로젝트별 설정
├── plans/                # 계획 파일 (Planner가 생성)
│   └── {name}.md
└── state.json            # 실행 상태 추적 (현재 활성 계획 등)
```

### 8.2 state.json 포맷

```json
{
  "active_plan": ".forge/plans/auth-system.md",
  "started_at": "2026-04-06T10:00:00Z",
  "session_ids": ["sess_abc123"]
}
```

`/start-work` 실행 시 state.json을 확인하여 기존 작업 재개 또는 새 작업 시작을 결정한다.

---

## 9. Tech Stack

| 항목        | 선택                                      |
| ----------- | ----------------------------------------- |
| 언어        | TypeScript (ESM)                          |
| 런타임      | Bun                                       |
| SDK         | `@opencode-ai/plugin` v1.2.24+            |
| 스키마 검증 | Zod                                       |
| 빌드        | `bun build` + `tsc --emitDeclarationOnly` |

---

## 10. Success Criteria

MVP가 완성되었다고 판단하는 기준:

1. **에이전트 등록**: OpenCode에서 Tab으로 5개 에이전트(Pilot, Planner, Architect, Worker, Scouter) 전환 가능
2. **카테고리 라우팅**: 에이전트별 카테고리에 따라 다른 모델로 라우팅 동작
3. **Pilot 직접 수행**: 간단한 코딩 요청을 Pilot이 직접 처리
4. **Pilot → Worker 위임**: 복잡한 요청 시 Pilot이 `task()`로 Worker에 위임하고 결과 수신
5. **Pilot → Scouter 위임**: 코드 탐색 요청 시 Scouter에 위임
6. **Planner 계획 수립**: Planner로 전환 후 인터뷰 → `.forge/plans/*.md` 생성
7. **/start-work 동작**: 계획 파일을 읽고 Pilot이 순차적으로 태스크 분배
8. **설정 오버라이드**: `forge.jsonc`에서 카테고리별 모델 변경이 반영됨
9. **Worker 위임 차단**: Worker 세션에서 `task()` 호출 시 차단됨

---

## 11. Future Extensions (MVP 이후)

| 기능                | 설명                                    | 우선순위 |
| ------------------- | --------------------------------------- | -------- |
| Wisdom Accumulation | 태스크 간 학습 축적 (`.forge/notepads/`) | P1       |
| Plan Reviewer       | 계획 검증 에이전트 (Momus 역할)         | P1       |
| Fallback Chain      | 에이전트별 모델 폴백 체인               | P2       |
| Dual Prompt         | Claude/GPT별 프롬프트 자동 전환         | P2       |
| Background Agents   | 병렬 에이전트 실행                      | P3       |
| Skill System        | 도메인별 스킬 로딩                      | P3       |
