# Forge Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenCode용 경량 멀티 에이전트 오케스트레이션 harness plugin (5개 에이전트 + 카테고리 기반 모델 라우팅)

**Architecture:** `@opencode-ai/plugin` SDK의 `config` 훅으로 5개 에이전트를 등록하고, `chat.message` 훅으로 카테고리 기반 모델 라우팅을 수행한다. 에이전트 권한은 `AgentConfig.permission`으로 제어하며, `start-work` tool로 계획 기반 실행을 지원한다.

**Tech Stack:** TypeScript (ESM), Bun, @opencode-ai/plugin ^1.3.15, @opencode-ai/sdk ^1.3.15, Zod, bun build + tsc

---

## Scope

- 구현 위치: `opencode-plugins/forge-plugin/`
- MVP만 구현한다.
- Worker의 `task()` 차단은 `permission: { task: "deny" }`로 구현한다.
- 모델 라우팅은 `output.message.model` 갱신 방식으로 구현한다.
- 테스트는 Bun test 기반 단위 테스트 위주로 작성한다.

## Task List

- [ ] Task 1: Project scaffold and package metadata
- [ ] Task 2: Core config schema and loader
- [ ] Task 3: Kernel router and registry
- [ ] Task 4: Agent prompt and factory definitions
- [ ] Task 5: Hooks, start-work tool, and plugin entry point
- [ ] Task 6: Build, test, and installation documentation
