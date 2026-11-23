# Comment Cleanup

## 목차

- [기능](#기능)
- [동작](#동작)
- [규칙 수정](#규칙-수정)
- [한계](#한계)
- [설치](#설치)
- [검증](#검증)

## 기능

에이전트가 코딩 중 새로 쓴 주석을 작업 종료 직전에 한 번 점검시키는 Pi 확장.

- 주석 규칙을 시스템 프롬프트에 넣어 처음부터 불필요한 주석을 쓰지 않게 함
- 그래도 새 주석이 남으면 목록을 넘겨 **같은 에이전트가 한 번 더 실행**되어 정리
- 원래 있던 주석과 주석 외 코드는 대상 아님
- 명령어와 설정 없음. 설치하면 자동 동작

## 동작

| 시점 | hook | 하는 일 |
|------|------|---------|
| 실행 시작 | `before_agent_start` | `rules.md`를 시스템 프롬프트의 `<comment_rules>` 섹션으로 추가 |
| 파일 수정 직전 | `tool_call` | `edit`·`write` 대상 파일의 주석을 수정 전 상태로 기록 (실행 중 파일별 최초 1회) |
| 종료 직전 | `agent_before_settle` | 현재 파일의 주석 중 수정 전에 없던 것만 골라 정리 요청 |

- 정리 요청은 `comment-cleanup` 메시지로 대화에 표시되며, **실행당 1회**만 발생
- 새 주석이 없으면 추가 모델 호출 없음
- 새 주석이 규칙에 맞더라도 확인을 위한 모델 호출 1회 발생. 맞는 주석은 그대로 유지
- 정리 요청 목록은 최대 40개. 넘는 분량은 개수만 전달

### 요청에서 제외하는 주석

- 수정 전에 같은 내용으로 있던 주석 (위치가 바뀌어도 제외)
- 도구가 해석하는 주석: `eslint-disable`, `@ts-expect-error`, `noinspection`, `# noqa`, `//go:build`, 포매터 on/off, `// language=SQL`, 라이선스 표기, shebang 등
- `// given`, `// when`, `// then`: 수정 전 파일이 이미 쓰고 있던 경우에 한함

### 대상 파일

확장자 기준. 그 밖의 파일(Markdown, YAML, JSON 등)은 대상 아님.

- `//`, `/* */`: ts, tsx, js, jsx, mjs, cjs, java, kt, kts, groovy, gradle, scala, go, rs, swift, dart, c, h, cc, cpp, hpp, cs
- `#`: py(docstring 포함), rb, sh, bash, zsh
- `--`, `/* */`: sql

## 규칙 수정

규칙 본문은 [`rules.md`](./rules.md). 실행을 시작할 때마다 다시 읽으므로 수정 후 `/reload` 불필요.

판단은 모델 몫. 확장은 새 주석을 찾아 알리기만 하고, 지울지는 규칙을 읽은 에이전트가 결정. 사용자가 주석을 직접 요청한 경우 규칙에 따라 유지.

## 한계

- `bash`로 한 수정(`sed`, heredoc 등)과 다른 확장의 편집 도구는 감지 대상 아님
- Esc로 중단한 실행은 종료 직전 단계가 없어 정리 생략. 기록은 남아 있다가 다음에 정상 종료되는 실행에서 함께 확인
- 주석 탐지는 구문 분석이 아닌 문자열 규칙 기반. 정규식 리터럴 안의 따옴표처럼 드문 형태에서는 오탐·누락 가능
- 주석 내용을 고치면 새 주석으로 취급

## 설치

저장소에 추가하는 작업과 전역 Pi에 설치하는 작업은 별개. 저장소 루트에서 실행:

```bash
bash scripts/install-pi --restore
```

이 디렉터리가 `~/.pi/agent/extensions/comment-cleanup`에 연결됨. 설치 후 Pi에서 `/reload` 실행 또는 재시작. 한 번만 써 보려면:

```bash
pi -e runtime/pi/extensions/comment-cleanup/index.ts
```

## 검증

```bash
node --test runtime/pi/extensions/comment-cleanup/comment-cleanup.test.mjs
bash scripts/check-resources --quiet
```

테스트는 설치된 Pi의 실제 확장 로더로 `index.ts`를 불러와 hook을 직접 호출하고, 임시 디렉터리의 실제 파일로 수정 전후를 재현. 모델 호출은 없음.

Pi 패키지는 `~/.pi/agent/install`의 현재 버전, 없으면 전역 npm 경로에서 탐색. 다른 위치라면 패키지 루트 지정:

```bash
PI_PACKAGE_DIR=/path/to/node_modules/@earendil-works/pi-coding-agent \
  node --test runtime/pi/extensions/comment-cleanup/comment-cleanup.test.mjs
```
