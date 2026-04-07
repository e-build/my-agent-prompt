# OpenCode Plugins

이 디렉토리는 `my-agent-prompt` 저장소 안에서 재사용 가능한 OpenCode plugin 패키지를 모아두는 레지스트리다.
각 플러그인의 상세 사용법은 **해당 패키지 디렉토리의 `README.md`** 를 참고한다.

---

## 현재 패키지

| Package | 목적 | 문서 |
|---------|------|------|
| `opencode-autoresearch` | `lab-*` Bilevel Autoresearch 최적화 루프 | [README](./opencode-autoresearch/README.md) |
| `forge-plugin` | 5개 전문 에이전트와 카테고리 기반 모델 라우팅 harness | [README](./forge-plugin/README.md) |
| `cliproxyapi-sync` | CLI Proxy API 모델 프로바이더 자동 동기화 (실험적) | — |

---

## 문서화 규칙

이 `README.md`의 역할은 **레지스트리 관리 가이드**다. 개별 플러그인의 설치법, 사용법, API 상세는 각 패키지 `README.md`에 작성한다.

### 이 파일에 적을 것
- 패키지 목록 (한 줄 요약 + 링크)
- 디렉토리 전체에 적용되는 개발 규칙 및 컨벤션
- OpenCode Plugin API 개발 노하우
- 공식 문서 링크

### 각 패키지 `README.md`에 적을 것
- 패키지 목적과 동작 원리
- 디렉토리 구조 및 파일 설명
- 설치 방법 (로컬/npm)
- 사용법 및 커맨드 레퍼런스
- 설정 옵션

---

## 개발 규칙

### 패키지 구조

```
opencode-plugins/<package-name>/
├── package.json          # name, version, type: "module", main 필드 필수
├── index.js              # 플러그인 엔트리 (또는 빌드 출력 dist/index.js)
├── README.md             # 패키지 문서 (설치/사용법/API)
├── install-local.sh      # 로컬 심링크 설치 스크립트 (권장)
├── postinstall.js        # npm 배포 시 자산 복사 스크립트 (선택)
├── commands/             # 슬래시 커맨드 .md 파일
├── agents/               # 에이전트 정의 .md 파일
└── skills/               # 스킬 디렉토리 (하위에 SKILL.md 필수)
```

### 명명 컨벤션

- 패키지 디렉토리명: `kebab-case`
- 저장소 루트 `command/`(단수형)는 standalone 커맨드 전용이다. 플러그인 내부 자산 디렉토리는 OpenCode 패키지 규칙에 따라 `commands/`(복수형)를 사용한다.
- 에이전트, 커맨드 파일명: `kebab-case.md`

### 설치 스크립트 패턴

세 가지 패턴을 상황에 따라 선택한다.

**패턴 1 — 심링크 (`install-local.sh`, 개발 중 권장)**

`~/.config/opencode/{commands,agents,skills,plugins}`에 심링크를 생성한다. 소스 파일을 수정하면 즉시 반영되므로 로컬 개발에 적합하다.

```bash
bash opencode-plugins/<package-name>/install-local.sh
bash opencode-plugins/<package-name>/install-local.sh --uninstall
```

- 기존 심링크는 갱신한다.
- 심링크가 아닌 일반 파일이 있으면 덮어쓰지 않고 경고를 출력한다.

**패턴 2 — npm postinstall (`postinstall.js`)**

npm으로 배포할 때 `npm install` 후 자동으로 `fs.cpSync`로 자산을 복사한다. 심링크가 아닌 복사본이므로 소스 변경이 자동 반영되지 않는다.

**패턴 3 — `opencode.json` 직접 등록 (빌드 필요 플러그인)**

TypeScript로 작성한 플러그인은 빌드 후 출력 경로를 `plugin` 배열에 추가한다.

```json
{
  "plugin": ["/absolute/path/to/dist/index.js"]
}
```

### 새 플러그인 추가 체크리스트

- [ ] `opencode-plugins/<package-name>/` 디렉토리 생성
- [ ] `package.json` 작성 (`name`, `version`, `type: "module"`, `main`)
- [ ] 엔트리 파일 구현 (`Plugin` 타입 준수, 기본 내보내기)
- [ ] `README.md` 작성 (설치/사용법/옵션 포함)
- [ ] 필요 시 `commands/`, `agents/`, `skills/` 자산 동봉
- [ ] 로컬 설치 스크립트 제공 (`install-local.sh` 권장)
- [ ] 이 문서의 패키지 표에 항목 추가
- [ ] 루트 `AGENTS.md`의 패키지 표에도 반영

---

## OpenCode Plugin 개발 노하우

### Plugin 함수 시그니처

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // 훅 구현
  }
}
```

컨텍스트 파라미터:
- `project` — 현재 프로젝트 정보
- `directory` — 현재 작업 디렉토리
- `worktree` — git worktree 경로
- `client` — OpenCode SDK 클라이언트 (`client.app.log()` 등)
- `$` — Bun Shell API (명령어 실행)

### 사용 가능한 훅

| 훅 | 용도 |
|----|------|
| `tool.execute.before` | 도구 실행 전 인터셉트. `output.args` 수정, `throw`로 차단 가능 |
| `tool.execute.after` | 도구 실행 결과 후처리 |
| `shell.env` | 셸 환경변수 주입/수정 |
| `experimental.session.compacting` | 세션 압축 시 컨텍스트 추가(`output.context.push(...)`) 또는 프롬프트 교체(`output.prompt = ...`) |
| `event` | 모든 세션/파일/도구 이벤트 수신 |
| `config` | 플러그인 초기화 시 에이전트·커맨드 등록 |
| `chat.message` | 메시지 전송 전 모델·파라미터 변경 |

주요 이벤트 타입 (`event` 훅에서 `event.type`으로 구분):
`session.created` / `session.idle` / `session.error` / `session.compacted` /
`command.executed` / `file.edited` / `tool.execute.before` / `tool.execute.after`

### 커스텀 도구 등록

```ts
import { tool } from "@opencode-ai/plugin"

return {
  tool: {
    my_tool: tool({
      description: "도구 설명",
      args: {
        target: tool.schema.string(),
      },
      async execute(args, { directory }) {
        return `결과: ${args.target}`
      },
    }),
  },
}
```

- 동일 이름의 내장 도구가 있으면 플러그인 도구가 우선한다.

### 에이전트/커맨드 동적 등록

`config` 훅에서 `config.agent`와 `config.command`를 수정하여 에이전트와 커맨드를 등록한다.

```ts
return {
  config: async (input, output) => {
    output.config.agent["my-agent"] = {
      name: "My Agent",
      // ... agent config
    }
    output.config.command["my-cmd"] = {
      description: "내 커맨드",
      template: "...",
    }
  },
}
```

### 로깅

`console.log` 대신 `client.app.log()`를 사용한다. 레벨: `debug` / `info` / `warn` / `error`.

```ts
await client.app.log({
  body: { service: "my-plugin", level: "info", message: "초기화 완료" },
})
```

### 플러그인 로드 순서

1. 글로벌 config (`~/.config/opencode/opencode.json`)
2. 프로젝트 config (`opencode.json`)
3. 글로벌 plugin 디렉토리 (`~/.config/opencode/plugins/`)
4. 프로젝트 plugin 디렉토리 (`.opencode/plugins/`)

같은 이름·버전의 npm 패키지는 한 번만 로드된다. 로컬 플러그인과 npm 플러그인은 이름이 같아도 각각 별도로 로드된다.

### 외부 패키지 의존성

로컬 플러그인에서 npm 패키지를 사용할 경우, 플러그인 디렉토리 옆에 `package.json`을 두면 OpenCode 시작 시 `bun install`이 자동 실행된다.

```
.opencode/
├── package.json      # { "dependencies": { "zod": "^3.0.0" } }
└── plugins/
    └── my-plugin.ts
```

### TypeScript 플러그인 빌드 (Bun 권장)

```bash
bun build src/index.ts --outdir dist --format esm --target bun
tsc --emitDeclarationOnly  # 타입 선언만 별도 생성
```

`tsconfig.json` 핵심 설정:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

---

## 공식 문서

| 문서 | URL |
|------|-----|
| Plugin API 레퍼런스 | https://opencode.ai/docs/plugins |
| SDK 문서 | https://opencode.ai/docs/sdk |
| 에이전트 설정 | https://opencode.ai/docs/agents |
| 커맨드 설정 | https://opencode.ai/docs/commands |
| 스킬 설정 | https://opencode.ai/docs/skills |
| 커스텀 도구 | https://opencode.ai/docs/custom-tools |
| 커뮤니티 플러그인 에코시스템 | https://opencode.ai/docs/ecosystem |
| Bun Shell API | https://bun.sh/docs/runtime/shell |

---

## 관련 문서

- [루트 AGENTS.md](../AGENTS.md) — 저장소 전체 구조, 심링크 연결 방법
