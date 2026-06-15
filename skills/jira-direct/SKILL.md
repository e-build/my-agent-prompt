---
name: jira-direct
description: Use Jira REST API directly without MCP to fetch issue details, child issues, and focused field data. Use when the user asks about Jira tickets by key and direct API access via shell scripts is preferred.
---

# Jira Direct

Use Jira REST API directly via the helper scripts in this skill. Do not use MCP for Jira work when this skill applies.

## Required environment variables

Load credentials from the user's shell environment:

- `JIRA_BASE_URL` — e.g. `https://shoplworks.atlassian.net`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

## Rules

- Prefer these scripts over MCP tools for Jira access.
- Use `bash` to run the scripts from this skill directory.
- If the user provides an issue key and wants issue details, start with `scripts/get-issue.js`.
- If the user wants child tickets, linked tickets under an epic, or names of subtasks/children, use `scripts/get-children.js`.
- Return concise summaries unless the user asks for raw JSON.

## Commands

### Get one issue

```bash
node /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/skills/jira-direct/scripts/get-issue.js SH-18398
```

Optional fields:

```bash
node /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/skills/jira-direct/scripts/get-issue.js SH-18398 summary,status,assignee,parent,subtasks
```

### Get child issues under a parent/epic

```bash
node /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/skills/jira-direct/scripts/get-children.js SH-18398
```

### Create subtasks (with assignee + status transition)

```bash
# 인라인 제목 목록으로 생성 + 담당자 + 상태 변경
node /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/skills/jira-direct/scripts/create-subtasks.js SH-18440 \
  --assignee 625df820b8be7c006a4401fc \
  --status "진행 중" \
  --prefix auto \
  --titles "첫 번째 하위작업" "두 번째 하위작업"

# 마크다운 파일에서 특정 섹션의 목록만 추출하여 생성
node /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/skills/jira-direct/scripts/create-subtasks.js SH-18440 \
  --assignee 625df820b8be7c006a4401fc \
  --status "진행 중" \
  --prefix auto \
  --section "구현 하위작업 이름" \
  --from-file docs/근태-종합-리포트-v-0.4/backend-requirements.md

# dry-run 미리보기 (--dry-run 붙이면 실제 생성 안 함)
node /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/skills/jira-direct/scripts/create-subtasks.js SH-18440 \
  --section "구현 하위작업 이름" \
  --from-file requirements.md --dry-run

# shell alias로 간편 실행 (source ~/.zshrc 필요)
jira-subtask-create SH-18440 \
  --assignee 625df820b8be7c006a4401fc \
  --status "진행 중" \
  --prefix auto \
  --section "구현 하위작업 이름" \
  --from-file path/to/doc.md
```

**옵션:**
- `--assignee <accountId|email|displayName>` — 담당자 지정 (displayName/email로도 검색 가능)
- `--status <상태명>` — 생성 후 상태 전환 ("진행 중", "Hold", "Close")
- `--titles "작업1" "작업2" ...` — 인라인 제목 목록
- `--from-file <경로>` — 마크다운 파일에서 목록 항목(1. xxx, - xxx)만 자동 추출
- `--section <섹션명>` — 문서 내 특정 헤딩 이후의 목록만 추출 (--from-file과 함께 사용)
- `--prefix auto` — `[01]`, `[02]`... 자동 채번
- `--dry-run` — 실제 생성 없이 미리보기
- stdin 파이프도 지원 (`cat tasks.txt | node create-subtasks.js SH-18440`)

## Output behavior

- The scripts print compact JSON intended for agent consumption.
- Summarize keys and summaries for the user unless more detail is requested.
- If credentials are missing, tell the user which env vars are required.
