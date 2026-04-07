---
description: 현재 프로젝트에 lab autoresearch 프레임워크를 초기화한다. autoresearch.yaml, executor.md, scripts/analyze.py, workspace/ 구조를 생성한다.
---

# /lab-init

현재 프로젝트 디렉토리에 Bilevel Autoresearch 프레임워크를 초기화한다.

## 사전 확인

1. `autoresearch.yaml`이 이미 있으면 덮어쓰기 전에 사용자에게 확인한다.
2. git 레포지토리인지 확인 (`git status`). git이 없으면 경고만 하고 계속 진행한다.

## 생성할 파일과 내용

### 1. `autoresearch.yaml` 생성

아래 템플릿으로 생성한다. 사용자가 나중에 직접 수정해야 하는 항목에 `# TODO:` 주석을 붙인다:

```yaml
# Bilevel Autoresearch Framework Configuration
project:
  name: "my-project"         # TODO: 프로젝트 이름
  description: "description" # TODO: 설명
  language: "python"         # TODO: python | node | go | rust | any

scope:
  editable:
    - "src/**/*.py"          # TODO: 수정 허용 파일 패턴
  readonly:
    - "tests/**"
    - "scripts/**"
    - "workspace/**"
    - "autoresearch.yaml"
    - "executor.md"

metrics:
  primary:
    name: "p99_latency_ms"   # TODO: 주요 메트릭 이름
    optimize: "minimize"     # minimize | maximize
    unit: "ms"
  secondary:
    - name: "rps"
      optimize: "maximize"
      constraint: "soft"
    - name: "memory_mb"
      optimize: "minimize"
      constraint: "soft"

evaluate:
  command: "python scripts/benchmark.py"  # TODO: 실제 벤치마크 명령
  timeout_seconds: 120
  parse:
    p99_latency_ms: 'p99_latency:\s*([\d.]+)'   # TODO: 메트릭 파싱 regex
    rps: 'requests_per_second:\s*([\d.]+)'
    memory_mb: 'memory_mb:\s*([\d.]+)'

inner_loop:
  max_cycles: 100
  outer_trigger: 10
  git_branch: "lab/autoresearch"
  on_success: "keep"         # keep | commit_and_keep
  min_improvement_pct: 0.5

outer_loop:
  convergence_window: 5
  tabu_size: 15
  lessons_file: "workspace/memory/outer_lessons.jsonl"

executor:
  binary: "codex"
  instructions_file: "executor.md"
  approval_mode: "full-auto"
  task_file: "workspace/task.md"
  result_file: "workspace/result.md"
```

### 2. `executor.md` 생성

```markdown
# Executor Agent Instructions

당신은 Bilevel Autoresearch 프레임워크의 **실행자(Executor)**입니다.

## 역할

Codex CLI로 호출됩니다: `codex -q @executor.md --approval-mode full-auto`

- **입력**: `workspace/task.md` (오케스트레이터가 작성)
- **출력**: `workspace/result.md` (반드시 작성 후 종료)

## 규칙

1. `workspace/task.md` 를 먼저 읽는다.
2. `autoresearch.yaml`의 `scope.editable` 파일만 수정한다.
3. `evaluate.command`로 벤치마크를 실행한다.
4. 반드시 `workspace/result.md` 를 작성한다 (실패해도).
5. 한 사이클에 하나의 변경만 한다.
6. `workspace/`, `autoresearch.yaml`, `executor.md` 는 수정하지 않는다.

## result.md 형식

```markdown
# Result

## Status
<keep | discard | error>

## Metrics
- <primary_metric>: <value>
- <secondary>: <value>

## Change Description
<한 문장>

## Files Modified
- <path>: <설명>

## Notes
<오류, 경고 등>
```
```

### 3. `scripts/` 디렉토리 생성 및 `analyze.py` 복사

```bash
mkdir -p scripts
cp ~/.config/opencode/skills/autoresearch/analyze.py scripts/analyze.py
```

복사가 실패하면 (`~/.config/opencode/skills/autoresearch/analyze.py` 없을 때) 스킬이 설치되지 않은 것이므로 오류를 알린다.

### 4. `workspace/` 구조 생성

```bash
mkdir -p workspace/memory
```

`workspace/state.json` 생성:
```json
{
  "best": {
    "commit": null,
    "metrics": {},
    "description": "초기화 전",
    "inner_cycle": 0
  },
  "inner_cycle": 0,
  "outer_cycle": 0,
  "strategy": "initial",
  "tabu_list": [],
  "trajectory": "improving",
  "branch": "lab/autoresearch",
  "last_updated": null
}
```

### 5. `.gitignore` 항목 추가 (있으면)

`.gitignore`에 없으면 아래 항목 추가:
```
workspace/run.log
workspace/task.md
workspace/result.md
```

## 완료 후 안내

생성된 파일을 나열하고 다음을 안내한다:

```
✓ autoresearch.yaml   — TODO 항목을 실제 프로젝트에 맞게 수정하세요
✓ executor.md         — Codex CLI 지시문 (필요시 수정)
✓ scripts/analyze.py  — 실험 분석 도구
✓ workspace/state.json

다음 단계:
1. autoresearch.yaml 의 TODO 항목 수정
2. scripts/benchmark.py 작성 (평가 명령)
3. /lab-run 으로 루프 시작
```
