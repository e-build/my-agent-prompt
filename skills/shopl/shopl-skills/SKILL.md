---
name: shopl-skills
description: "Shopl 프로젝트 전용 스킬 인덱스. 신규 스킬은 아래 4개 분류 중 하나에 따라 프리픽스를 자동 결정한다. Use when: Shopl Jira 작업, Shopl API 검증 문서 작성, Shopl 개발/업무/트러블슈팅 스킬 확인."
---

# Shopl 전용 스킬

Shopl 프로젝트 업무에 특화된 스킬 모음. 모든 스킬은 원본이 `shopl-authorization-server`, `shopl-server-sub`, `e-build/my-agent-prompt` 중 한 곳에 정의되어 있으며 `~/.pi/agent/skills/`로 심링크되어 있다.

## 스킬 목록

| 스킬 | 분류 | 설명 | 사용 시점 |
|------|------|------|----------|
| 스킬 | 분류 | 설명 | 사용 시점 |
|------|------|------|----------|
| `shopl-backend-log-query` | fix | Elasticsearch 로그 조회 질의, 필드 카탈로그, Recipe | 운영 로그 조회, rId/cId 추적, ERROR 분석, Batch/IDP 로그 |
| `shopl-dev-api-draft` | dev | 구현 분해 문서 → 개발 착수 전 API 초안 명세 작성 | breakdown의 API 후보를 전체 명세로 전환, API 초안/설계/명세 작성 |
| `shopl-dev-auth-token` | dev | Shopl 인증서버 토큰 발급 절차 | API curl 검증 시 SESSION 쿠키 필요할 때 |
| `shopl-dev-jira-task-flow` | dev | Jira 하위작업 순차 실행 워크플로우 | Jira 매핑된 작업 계획→승인→실행→검증→Jira 동기화 |
| `shopl-dev-verify-feature` | dev | 기능 검증 문서 작성 | 기능 구현 완료 후 검증 문서(시나리오/SQL/절차) 작성 |
| `shopl-dev-backend-breakdown-from-scrap` | dev | Scrap 기획서 → 백엔드 구현 분해 | 기획서/Figma/샘플 Excel 대조, 구현 gap 분석 |
| `shopl-work-jira-briefing` | work | Jira 이슈 요약/브리핑 | Jira 티켓 리스트 확인, 할당 이슈 현황 파악 |
| `shopl-work-jira-direct` | work | Jira REST API 직접 호출 | Jira 이슈 세부 정보 조회, 하위 작업 확인 |

## 스킬 간 관계

```
shopl-backend-log-query (ES 로그 조회, 운영 질의)
         │
         v
shopl-work-jira-briefing ──> shopl-work-jira-direct (Jira REST API 호출)
         │
         v
shopl-dev-jira-task-flow ──> shopl-work-jira-briefing (계획 수립 시 참조)
         │
         v
shopl-dev-backend-breakdown-from-scrap (기획서 → 백엔드 구현 분해)
         │
         v
shopl-dev-api-draft (구현 분해 → API 초안 명세 작성)
         │
         v
shopl-dev-verify-feature (검증 문서 작성)
         │
         v
shopl-dev-auth-token (API 호출 시 인증 토큰 발급)
```

**분류 체계:**

Shopl 전용 스킬은 아래 4개 분류 중 하나에 따라 프리픽스가 자동 결정된다. 신규 스킬 추가 시 이 기준을 따른다.

| 분류 | 프리픽스 | 기준 | 예시 |
|------|---------|------|------|
| **shopl** (프로젝트 공용) | `shopl-` | Shopl 전반에서 사용, dev/work/fix 어디에도 속하지 않음 | `shopl-skills` (인덱스) |
| **shopl-dev** (개발) | `shopl-dev-` | 코드 구현/테스트/빌드/CI/배포 | auth-token, jira-task-flow, verify-feature, backend-breakdown-from-scrap, api-draft |
| **shopl-work** (업무) | `shopl-work-` | Jira 조회/브리핑/문서/커뮤니케이션/행정 | jira-briefing, jira-direct |
| **shopl-fix** (트러블슈팅) | `shopl-fix-` | 디버깅/장애대응/성능분석/문제해결 | backend-log-query, (향후 추가) |

## 원본 저장소

- **Shopl 애플리케이션 코드:** `shopl-server-sub/`, `shopl-authorization-server/`
- **스킬 원본 & 설정:** `e-build/my-agent-prompt/skills/shopl/`
- **설치:** `~/.pi/agent/skills/` 에서 심링크로 연결
