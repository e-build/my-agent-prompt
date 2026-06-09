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

## Output behavior

- The scripts print compact JSON intended for agent consumption.
- Summarize keys and summaries for the user unless more detail is requested.
- If credentials are missing, tell the user which env vars are required.
