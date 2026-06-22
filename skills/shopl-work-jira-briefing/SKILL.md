---
name: shopl-work-jira-briefing
description: Creates concise Shopl Jira briefings grouped as parent issue trees for any assignee/current user, using Shopl-safe Jira REST patterns. Use when the user asks for Jira issue lists, assigned tickets, open/practical-action issues, non-Close issues, 실질 미종결 이슈, parent-child grouping, tree summaries, or quick work briefings for Shopl Jira.
---

# Shopl Jira Briefing

## Quick start

기본은 대상 Jira 이슈를 끝까지 조회해 `상위 이슈 > 하위 이슈` 트리로 요약하는 전체 브리핑이다.

Default:
- assignee: 요청에 명시된 사용자, 없으면 `currentUser()`
- filter: 실질 미종결(`statusCategory != Done`) 우선. 사용자가 “Close 제외”를 명시하면 Non-Close 사용
- fields: `summary,status,issuetype,priority,updated,parent`
- fetch: `/rest/api/3/search/jql`은 **GET + query string**. POST body 금지
- size: `maxResults=100`으로 먼저 전체 조회. 100건 초과가 의심될 때만 추가 전략 사용
- output: `KEY [상태][유형] - 제목`

## Workflow

1. 자격 증명 확인: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.
2. 네트워크 호출은 `bash`로 실행하고 `timeout: 30` 이상을 명시한다. `ctx_execute(shell)` 금지.
3. Jira REST `/rest/api/3/search/jql`은 GET으로 호출하고 `jql`, `fields`, `maxResults`를 query string에 넣는다.
4. curl 진단은 `-s -o /tmp/jira.json -w "%{http_code}"` 패턴을 사용한다. `-v`, raw stdout flood 금지.
5. `search/jql`의 `total/isLast/startAt`은 신뢰하지 않는다. 기본은 `maxResults=100` 한 번 조회 후 결과 개수로 판단한다.
6. 모든 이슈를 합친 뒤 중복 key를 제거하고 `parent.key` 기준으로 그룹화한다.
7. JSON 원문 대신 한국어 트리 요약만 출력한다.

## Query modes

### Practical action / 실질 미종결 기본

```text
assignee = <assignee>
AND statusCategory != Done
AND status NOT IN (Close, 완료, 해결됨, "Ready PROD", "Ready To PROD", "PROD", Done)
ORDER BY priority DESC, updated DESC
```

### Non-Close / 명시 요청 시

```text
assignee = <assignee> AND status != Close ORDER BY priority DESC, updated DESC
```

주의: Shopl Jira에서 `완료`, `해결됨`, `Ready PROD`는 Close가 아니므로 Non-Close 결과에 포함될 수 있다.

`<assignee>` 규칙:
- “내”, “나”, assignee 미지정: `currentUser()`
- 이름이 있으면 Jira에서 허용되는 displayName/accountId/email 조건을 사용한다.
- 모호하면 사용자 확인 후 조회한다.

## Output shape

```text
- PARENT-123
  - CHILD-1 [DEV][하위 작업] - 제목
  - CHILD-2 [QA][버그] - 제목
- 상위 이슈 없음
  - OP-100 [해야 할 일][버그] - 제목
```

## More

- 자세한 기준: [REFERENCE.md](REFERENCE.md)
- 예시: [EXAMPLES.md](EXAMPLES.md)
