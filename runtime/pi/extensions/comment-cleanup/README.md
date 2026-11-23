# Comment Cleanup

## 목차

- [기능](#기능)
- [동작](#동작)
- [규칙 수정](#규칙-수정)
- [한계](#한계)
- [설치](#설치)
- [검증](#검증)

## 기능

에이전트가 코딩 중 새로 쓴 주석을 파일을 수정한 직후에 점검시키는 Pi 확장.

- 주석 규칙을 시스템 프롬프트에 넣어 처음부터 불필요한 주석을 쓰지 않게 함
- 그래도 새 주석이 생기면 그 수정의 도구 결과 끝에 목록을 덧붙여, 에이전트가 작업 도중에 조용히 정리
- 추가 실행이 없어서 응답의 마지막은 작업 결론으로 남음
- 원래 있던 주석과 주석 외 코드는 대상 아님
- 명령어와 설정 없음. 설치하면 자동 동작

## 동작

| 시점 | hook | 하는 일 |
|------|------|---------|
| 실행 시작 | `before_agent_start` | `rules.md`를 시스템 프롬프트의 `<comment_rules>` 섹션으로 추가하고 이전 실행의 기록을 비움 |
| 파일 수정 직전 | `tool_call` | `edit`·`write` 대상 파일의 주석을 수정 전 상태로 기록 (실행 중 파일별 최초 1회) |
| 파일 수정 직후 | `tool_result` | 수정 전에 없었고 아직 알리지 않은 주석을 골라 도구 결과 끝에 `[comment-cleanup]` 안내로 덧붙임 |

- 안내는 모델에게만 전달됨. Pi 화면은 성공한 `edit`·`write`의 결과 문구를 그리지 않음
- 안내에 "정리 사실을 사용자에게 알리지 않는다"를 포함
- 추가 모델 호출 없음. 수정 뒤에 원래 이어지는 다음 요청에서 처리
- 같은 주석은 실행 중 한 번만 알림. 규칙에 맞아 남긴 주석이 다음 수정에서 다시 나오지 않음
- 실패한 수정의 결과는 건드리지 않음
- 안내 목록은 수정 1회당 최대 40개. 넘는 분량은 개수만 전달

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
- 작업 도중에 확인하므로 주석만 보는 별도 실행보다 일부를 놓칠 수 있음
- 정리 여부는 모델 판단. 안내를 받고도 고치지 않을 수 있음
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

테스트는 설치된 Pi의 실제 확장 로더로 `index.ts`를 불러와 hook(`tool_call` → `tool_result`)을 직접 호출하고, 임시 디렉터리의 실제 파일로 수정 전후를 재현. 모델 호출은 없음.

Pi 패키지는 `~/.pi/agent/install`의 현재 버전, 없으면 전역 npm 경로에서 탐색. 다른 위치라면 패키지 루트 지정:

```bash
PI_PACKAGE_DIR=/path/to/node_modules/@earendil-works/pi-coding-agent \
  node --test runtime/pi/extensions/comment-cleanup/comment-cleanup.test.mjs
```
