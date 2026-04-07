---
name: autoresearch
description: |-
  Bilevel Autoresearch 프레임워크 핵심 스킬. 이너/아우터 루프 프로토콜, keep/discard 판단 규칙, 타부 서치, 실험 JSONL 스키마를 정의한다. /lab-run, /lab-analyze 커맨드 실행 시 lab-orchestrator가 로드한다.
---

# Autoresearch 스킬 — Bilevel 최적화 루프

## 개요

두 개의 중첩 루프:
- **이너 루프 (Level 1)**: 코드 수정 → 벤치마크 → keep/discard 반복
- **아우터 루프 (Level 2)**: 궤적 분석 → 전략 업데이트 → 타부 서치로 반복 실패 방지

### 필수 파일 (프로젝트 루트)

```
autoresearch.yaml       # 도메인 설정 (editable 범위, 메트릭, 벤치마크 명령)
executor.md             # Codex CLI 실행자 지시문
workspace/
  task.md               # 오케스트레이터 → 실행자 핸드오프 (ephemeral)
  result.md             # 실행자 → 오케스트레이터 핸드오프 (ephemeral)
  experiments.jsonl     # 전체 실험 로그 (append-only)
  state.json            # 현재 베스트 + 전략 상태
  memory/
    outer_lessons.jsonl # 아우터 루프 교훈 (누적)
scripts/
  analyze.py            # 실험 분석 CLI (~/.config/opencode/skills/autoresearch/analyze.py 복사본)
```

> 파일이 없으면 `/lab-init`을 먼저 실행한다.

---

## 1. 초기화

```bash
cat autoresearch.yaml          # 도메인 설정 확인
cat workspace/state.json       # 현재 상태 (없으면 초기화)
python scripts/analyze.py --tail 10
git status
```

`inner_cycle == 0`이면 **baseline 측정**부터 시작:
```bash
<autoresearch.yaml의 evaluate.command>
```

baseline 실험 기록:
```json
{"id": 1, "timestamp": "...", "commit": "<hash>", "metrics": {"p99_latency_ms": 250.0, "rps": 1200.0, "memory_mb": 128.0}, "status": "baseline", "description": "초기 baseline", "strategy": "initial", "inner_cycle": 0, "outer_cycle": 0}
```

---

## 2. 이너 루프

### 2.1 task.md 작성

```markdown
# Task — Inner Cycle <N>

## 현재 전략
<strategy>

## 현재 베스트
- <primary>: <value>

## 이번 사이클 지시
<구체적 최적화 제안 1가지>

## 금지 (Tabu List)
<tabu_list 항목들>
```

### 2.2 Executor 호출

```bash
codex -q @executor.md --approval-mode full-auto
```

### 2.3 Keep/Discard 판단

```
result.status == "error"
  → discard

primary 메트릭 개선 >= min_improvement_pct%
AND secondary hard constraint 미위반
  → keep, best 업데이트, git commit (설정에 따라)

그 외 → discard
```

### 2.4 experiments.jsonl append

```json
{
  "id": <N>, "timestamp": "<ISO8601>", "commit": "<hash|null>",
  "metrics": {"<primary>": <v>, "<secondary>": <v>},
  "status": "<keep|discard|error|baseline>",
  "description": "<한 문장>",
  "strategy": "<전략>",
  "inner_cycle": <N>, "outer_cycle": <N>,
  "files_modified": ["<path>"],
  "notes": "<선택>"
}
```

### 2.5 state.json 업데이트

```json
{
  "best": {"commit": "<hash>", "metrics": {}, "description": "", "inner_cycle": <N>},
  "inner_cycle": <N>, "outer_cycle": <N>,
  "strategy": "<전략>",
  "tabu_list": ["<항목>"],
  "trajectory": "<improving|plateauing|stuck>",
  "branch": "lab/autoresearch",
  "last_updated": "<ISO8601>"
}
```

### 2.6 아우터 루프 트리거

```
inner_cycle % outer_trigger == 0  →  아우터 루프 실행 후 재개
inner_cycle >= max_cycles          →  루프 종료
```

---

## 3. 아우터 루프

### 3.1 궤적 분석

```bash
python scripts/analyze.py --outer-analysis
```

### 3.2 궤적 판단

```
최근 N 사이클 keep 비율 >= 30%  → improving
keep 비율 10~30%               → plateauing
keep 비율 < 10%                → stuck
```

### 3.3 전략 업데이트

| 궤적 | 행동 |
|------|------|
| improving | 전략 유지, tabu 정리, 성공 패턴 기록 |
| plateauing | 더 공격적 전략, 새 방향 3개 제안 중 1개 선택, 실패 패턴 tabu 추가 |
| stuck | 전략 완전 전환, outer_lessons 참조, best 커밋으로 복귀 후 다른 방향 |

### 3.4 outer_lessons.jsonl 기록

```json
{
  "outer_cycle": <N>, "timestamp": "<ISO8601>",
  "trajectory_before": "<상태>", "keep_rate": <0.0-1.0>,
  "lesson": "<교훈>", "new_strategy": "<전략>",
  "tabu_additions": [], "tabu_removals": []
}
```

---

## 4. 타부 서치

- **추가**: 동일 접근법이 연속 2회 이상 discard
- **제거**: `tabu_size` 초과 시 FIFO
- **전달**: task.md에 반드시 현재 tabu_list 포함
- **목적**: vanilla 루프의 반복 실패(동일 제안 22회+) 방지

---

## 5. Git 전략

```bash
# 브랜치 생성 (최초 1회)
git checkout -b lab/autoresearch

# keep 시 커밋 (on_success: commit_and_keep 설정 시)
git add <수정된 파일>
git commit -m "lab[<N>]: <설명> | <primary>: <값>"

# discard 시 롤백
git checkout -- <수정된 파일>
```

---

## 6. 오류 처리

| 상황 | 행동 |
|------|------|
| result.md 없음 | discard + 해당 접근법 tabu 추가 |
| 벤치마크 타임아웃 | discard + timeout 패턴 tabu |
| 메트릭 파싱 실패 | discard + autoresearch.yaml의 parse regex 확인 권고 |
| git 충돌 | `git checkout -- .` 후 재시도 |
| Codex CLI 오류 | 기록 후 다음 사이클 진행 |

---

## 7. 전체 루프 흐름

```
초기화 → baseline 측정
↓
┌── 이너 루프 ──────────────────────────────┐
│ task.md 작성 → Executor 호출              │
│ → result.md 읽기 → keep/discard 판단      │
│ → experiments.jsonl append                │
│ → state.json 업데이트                     │
│ → 아우터 트리거? → 아우터 루프 실행        │
│ → 종료 조건? → 탈출 : 반복                │
└───────────────────────────────────────────┘
↓
최종 리포트
```

---

## 8. 분석 도구

`scripts/analyze.py`는 `~/.config/opencode/skills/autoresearch/analyze.py`를
`/lab-init` 시 프로젝트에 복사한 파일이다.

```bash
python scripts/analyze.py --tail 10          # 최근 N개
python scripts/analyze.py --summary          # 요약 통계
python scripts/analyze.py --full-report      # 전체 리포트
python scripts/analyze.py --outer-analysis   # 아우터 루프용 JSON 출력
```
