# Shopl Jira Briefing Reference

## 목적

Shopl Jira 이슈를 사람 기준으로 전체 브리핑한다. 핵심 출력은 `상위 이슈 > 하위 이슈` 트리다. 이 문서는 실제 Shopl Jira에서 확인된 안전한 호출 패턴을 우선한다.

## Assignee 선택

| 사용자 요청 | JQL assignee |
|---|---|
| `내 이슈`, `내가 맡은` | `currentUser()` |
| `jimmy 이슈` | 가능한 경우 jimmy의 accountId/email/displayName |
| 특정 이메일/accountId | 해당 값 |

이름만으로 조회가 실패하거나 모호하면 사용자에게 확인한다.

## 필터 모드

### 1. Practical action / 실질 미종결 기본

“아직 액션해야 하는 이슈” 중심이다. Shopl Jira에서는 `status != Close`만으로는 `완료`, `해결됨`, `Ready PROD`가 섞이므로 기본값은 이것을 우선한다.

```text
assignee = <assignee>
AND statusCategory != Done
AND status NOT IN (Close, 완료, 해결됨, "Ready PROD", "Ready To PROD", "PROD", Done)
```

상태명이 JQL 오류를 내면 `statusCategory != Done`만 남기고 재시도한다.

### 2. Non-Close / 사용자가 명시한 경우

Close만 제외한다. 종결 유사 상태가 포함될 수 있음을 결과에 명시한다.

```text
assignee = <assignee> AND status != Close
```

## 조회 규칙

- API: `GET /rest/api/3/search/jql`
- `jql`, `fields`, `maxResults`는 query string으로 전달한다. POST body 금지.
- fields: `summary,status,issuetype,priority,updated,parent`
- maxResults: 기본 100. 100건이면 초과 가능성을 알리고 추가 조회 전략을 세운다.
- `search/jql`의 `total/isLast/startAt`은 Shopl Jira에서 신뢰하지 않는다.
- 결과 병합 후 중복 key를 제거한다.
- 원문 JSON은 사용자 요청이 있을 때만 노출

## 도구/진단 규칙

- 네트워크 I/O는 `bash`를 쓰고 `timeout: 30` 이상을 명시한다.
- `ctx_execute(shell)`로 curl을 돌리지 않는다. 로컬 파일 가공에만 사용한다.
- curl 진단은 `curl -s -o /tmp/jira.json -w "%{http_code}" ...` 패턴을 쓴다.
- `curl -v`, raw stdout 대량 출력, pipe 진단은 context-mode block을 유발하므로 피한다.
- 문서와 실제 동작이 충돌하면 동작하는 예제 스크립트/최근 성공 패턴을 우선한다.

## 트리 구성

1. `parent.key` 기준으로 자식 이슈를 그룹화한다.
2. parent가 없는 이슈는 `상위 이슈 없음`으로 묶는다.
3. 부모 제목이 필요하면 부모 키를 별도 조회한다.
4. 기본 트리는 1단계 부모만 사용한다. 더 깊은 트리는 사용자가 요청할 때만 확장한다.

## 출력 우선순위

1. 전체 요약: 조회 기준, 조회 건수, 필터 모드
2. 트리 목록
3. 필요 시 상태별 개수
4. 100건에 도달하면 “100건 초과 가능성” 명시
5. 후속 제안: Non-Close 비교, 특정 부모만 보기, 상태별 재분류
