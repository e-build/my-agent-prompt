---
name: cmux-orchestrator
description: "cmux 멀티 AI 오케스트레이션 v6 — Main은 지휘관, 다른 AI는 부하. 조사→취합→구현 완주 보장. 529 Circuit Breaker. 48/48 테스트. 이식성 100% (SKILL_DIR 동적 해석). eagle ERROR 강화(rate limit/502/OOM/auth)."
user-invocable: true
classification: workflow
allowed-tools: Bash, Read, Write, Grep, Glob, Agent, AskUserQuestion
---

# cmux Multi-AI Orchestrator v6

> 48/48 기능 테스트 완료 | cmux 85개 CLI 100% 문서화 | 529 Circuit Breaker

**경로 변수** (이식성):
- `${SKILL_DIR}` = 이 스킬의 루트 디렉토리 (예: `~/.claude/skills/cmux-orchestrator/`)
- `$CLAUDE_PLUGIN_ROOT` = 플러그인 루트 (있으면 사용, 없으면 프로젝트 루트)

**패키징 시 포함되는 파일:**
```
cmux-orchestrator/
├── SKILL.md                          # 오케스트레이션 지침 (이 파일)
├── agents/                           # 서브에이전트 정의
│   ├── cmux-reviewer.md              # 코드 리뷰어 (Sonnet, 0스킬)
│   ├── cmux-git.md                   # Git 작업 (haiku)
│   └── cmux-security.md              # 보안 검사 (Sonnet, 4스킬)
├── scripts/                          # 실행 스크립트
│   ├── eagle_watcher.sh              # Surface 상태 감시 (WAITING 감지 포함)
│   ├── cmux-claude-bridge.sh         # Claude Code ↔ cmux 브릿지 훅
│   ├── cmux-idle-reminder.sh         # IDLE surface 알림 훅
│   ├── cmux-orchestra-enforcer.sh    # 세션 시작 시 자동 활성화 훅
│   ├── install_agents.sh             # 에이전트 설치 스크립트
│   └── detect_surfaces.py            # Surface 자동 감지
└── config/
    └── orchestra-config.json         # AI 프리셋 (생존: 세션 재시작 유지)
```

## 핵심 원칙 (MANDATORY — 모든 행동의 기반)

### 1. Main은 지휘관, 다른 AI는 부하

```
Main(Opus): 계획 + 판단 + 취합 + 구현 + 커밋
다른 AI:    조사 + 분석 + 보조 구현 (cmux send로만 통신)
```

- Main이 직접 코딩해도 됨 (판단 작업)
- 다른 AI에게 조사/구현 위임 가능 (cmux send, API 0원)
- 서브에이전트는 코드리뷰(Sonnet)에만 제한적 사용

### 2. 절대 멈추지 않는다

| 금지 표현 | 해야 하는 것 |
|----------|------------|
| "별도 세션에서" | 즉시 다음 단계 진행 |
| "나중에 구현" | cmux AI에 위임하고 Main은 다른 작업 |
| "컨텍스트 부족" | /compact 후 계속 |
| "이 세션은 여기까지" | 사용자가 "멈춰" 하기 전까지 완주 |

### 3. 조사 완료 → 즉시 구현

```
조사 배포 (cmux send) → 결과 JSON 수집 → 계획 수립 → 코드 구현 → 테스트 → 커밋
                     ↑ 이 지점에서 멈추면 안 됨 ↓
```

### 4. 놀고 있는 AI = 0

매 UserPromptSubmit마다 cmux-idle-reminder.sh가 IDLE surface 알림.
IDLE surface 있으면 → 현재 작업에서 병렬 가능한 부분 즉시 위임.

### 5. 에러 발생 → Main이 즉시 대응

설정 파일의 프리셋으로 자동 복구:
- 컨텍스트 초과 → reset_cmd (/new 또는 /clear)
- 완전 멈춤 → quit_cmd (/quit) → start_cmd (codex 등)
- 529 → Circuit Breaker → cmux send만 사용

## ⛔ HARD GATE 시스템 — 위반 불가 강제 규칙

> **이 섹션의 규칙은 절대 스킵할 수 없다. 위반 시 라운드가 무효.**
> SKILL.md의 다른 규칙은 "해야 한다(SHOULD)"이지만, 여기는 "하지 않으면 진행 불가(MUST NOT PROCEED)".

### 강제 수단 (cmux 공식 기능 + CC Hook 활용)

**4중 강제 체계 (L0이 가장 강력 — AI가 무시 불가능):**

| 계층 | 수단 | 강제 대상 | 강제력 |
|------|------|----------|--------|
| **L0: PreToolUse block** | `gate-blocker.sh` → `git commit` 물리적 차단 | WORKING/미완료 시 커밋 차단 | ⛔ **AI 무시 불가** |
| **L1: cmux set-hook** | `after-send-keys` → eagle 자동 갱신 | surface 상태 실시간 감시 | 자동 |
| **L2: PostToolUse 경고** | `gate-enforcer.py` + `cmux-idle-reminder.sh` | WORKING/ERROR/WAITING 경고 주입 | 경고 |
| **L3: SKILL.md GATE** | 5-GATE 체크리스트 (이 문서) | Main 행동 제한 | 텍스트 |

**L0 — 물리적 차단 (최강 강제력):**
`gate-blocker.sh`가 PreToolUse 훅으로 등록됨 (settings.json).
- `git commit` 시도 시 eagle + speckit-tracker 자동 검증
- WORKING surface 있으면 → `{"decision":"block"}` → **커밋 물리적 불가**
- speckit 미완료 태스크 있으면 → `{"decision":"block"}` → **커밋 물리적 불가**
- **AI가 무시할 수 없음** — LLM 추론 외부에서 작동하는 시스템 레벨 차단

**L2 — speckit-tracker (태스크 추적):**
```bash
# 디스패치 시 태스크 등록
python3 ${SKILL_DIR}/scripts/speckit-tracker.py --init "Round N"
python3 ${SKILL_DIR}/scripts/speckit-tracker.py --add T1 S3 "epub_export"

# 수집 시 완료 마킹
python3 ${SKILL_DIR}/scripts/speckit-tracker.py --done T1

# GATE 5 검증 (미완료 있으면 exit 1)
python3 ${SKILL_DIR}/scripts/speckit-tracker.py --gate
```

**세션 시작 시 자동 활성화 (MANDATORY):**
```bash
# L0: gate-blocker.sh — settings.json PreToolUse에 이미 등록 (영구)
# L1: cmux 이벤트 훅 등록 (세션마다)
cmux set-hook after-send-keys "bash ${SKILL_DIR}/scripts/eagle_watcher.sh --once > /dev/null 2>&1 &"
# L2: gate-enforcer.py — settings.json PostToolUse에 이미 등록 (영구)
# L3: SKILL.md — 스킬 활성화 시 자동 로드
```

**Main이 위반하려 할 때의 자가 교정 프롬프트:**
- "라운드 종료합니다" → ⛔ STOP. eagle 스캔 먼저: WORKING surface 있나?
- "코드 리뷰 결과:" → ⛔ STOP. 서브에이전트 위임했나?
- "커밋합니다" → ⛔ STOP. GATE 4 체크리스트 전부 확인했나?
- **"S3 sandbox라서 Main이 직접 구현"** → ⛔ STOP. S3가 진짜 완료됐나? DONE 키워드 확인했나?
- **surface가 IDLE이지만 DONE 미확인** → ⛔ STOP. 절대 완료 판정하지 마. 재질문 먼저.

**⚠️ 반복 위반 패턴 경고 (Round 8-12에서 5회 발생):**
Main이 "IDLE이면 끝났겠지"로 자의적 판단 → GATE 위반.

**해결 — cmux 직접 확인 프로토콜 (재질문 금지!):**
```
IDLE 감지 시 확인 순서 (MANDATORY):
1. cmux read-screen --surface surface:N --scrollback --lines 50
   → "DONE:" 또는 작업 완료 키워드 검색
   → 발견 → ✅ 완료

2. 미발견 → cmux read-screen --surface surface:N --lines 20
   → 진행 바(■), Working, spinner 확인 → ⏳ 아직 작업 중 → 대기
   → 에러 키워드 → ❌ 에러 → 재배정
   → 프롬프트만 보임 → 작업 완료했지만 DONE 미출력

3. 프롬프트만 보이는 경우 → 작업 결과가 scroll 밖에 있을 수 있음
   → cmux read-screen --scrollback --lines 100 으로 더 넓게 검색
   → 그래도 없으면 → 그때만 재질문 (최후 수단)

⛔ 재질문은 최후 수단! cmux read-screen으로 직접 화면 확인이 우선.
⛔ "IDLE이면 끝났겠지" 자의적 판단 절대 금지.
⛔ AI에게 재질문하면 컨텍스트 소비 + 이전 작업 기억 못할 수 있음 (/new 했을 수도).
```

### GATE 1: 과업 완료 GATE (라운드 종료 전 반드시 통과)

```
⛔ WORKING surface가 1개라도 있으면 라운드 종료 금지.
⛔ IDLE이지만 "DONE:" 키워드 미확인이면 완료 판정 금지. (IDLE ≠ 완료)

검증 방법 (커밋/자가개선 보고 전에 반드시 실행):
  eagle_status = eagle_watcher.sh --once
  for each surface in checklist:
    if status == "WORKING":
      → ⛔ BLOCKED — 해당 surface 완료 대기 필수
    if status == "IDLE":
      → scrollback으로 "DONE:" 키워드 반드시 확인
      → "DONE:" 없으면 → cmux send로 "결과 알려줘" 재질문
      → "DONE:" 있어야만 ✅ 완료 판정
    if status == "ERROR":
      → ⛔ 단순 스킵 금지! 해당 surface 작업을 다른 surface에 반드시 재배정
      → 재배정 불가능한 경우에만 ❌(사유 기록) + Main 직접 처리
      → 재배정 절차:
        1. 에러 surface의 할당 작업 목록 확인
        2. IDLE surface 중 능력 적합한 곳에 재배정
        3. 재배정 불가 → Main이 직접 실행
        4. 미처리 작업 0개 되어야 ❌ 확정

  ALL surfaces must be: ✅(성공) or ❌(에러→재배정 완료) — 단순 스킵(⏭️) 금지
  하나라도 미확정이면 → ⛔ BLOCKED
```

### GATE 2: 코드리뷰 위임 GATE (Main 직접 리뷰 금지)

```
⛔ Main(Opus)이 직접 코드리뷰를 하면 안 된다.

코드리뷰가 필요한 시점:
  → Agent(subagent_type="code-reviewer", model="sonnet", run_in_background=true) 디스패치
  → Main은 결과만 읽고 APPROVE/REJECT 판단

위반 감지 (자가 점검):
  Main이 "리뷰 결과:" 또는 "Verdict:" 같은 리뷰 판정을 직접 작성하려 하면
  → ⛔ STOP — "서브에이전트에 위임해야 합니다" 자기 교정

예외:
  - 서브에이전트가 3회 실패한 경우에만 Main 직접 리뷰 허용 (사유 기록 필수)
  - 단순 테스트 실행 (pytest)은 리뷰가 아님 → Main 직접 OK
```

### GATE 3: 서브에이전트 사용 GATE (규칙 준수 강제)

```
⛔ 다음 작업은 반드시 서브에이전트를 사용해야 한다:

| 작업 | 필수 에이전트 | Main 직접 금지 |
|------|-------------|--------------|
| 코드리뷰 | Agent(code-reviewer, sonnet) | ⛔ |
| 코드리뷰 (보안) | Agent(code-reviewer, sonnet) | ⛔ |

Main이 해야 하는 것 (위임 금지):
| 작업 | Main 직접 | 이유 |
|------|----------|------|
| 계획 수립 | ✅ | speckit 스킬 호출 |
| 태스크 분해 | ✅ | speckit-tasks |
| 커밋 판단 | ✅ | 최종 판단은 Main |
| cmux send 디스패치 | ✅ | 오케스트레이션 |
| SKILL.md 수정 | ✅ | 자가개선 |
| 결과 취합 | ✅ | 체크리스트 |
```

### GATE 5: Speckit 태스크 완결성 GATE (미완료 태스크 → 재배정 강제)

```
⛔ speckit으로 분해한 태스크 중 1개라도 미완료이면 라운드 종료 금지.

검증 절차 (Step 4 수집 완료 후 반드시 실행):

  1. 디스패치 시 생성한 TASK_CHECKLIST의 모든 항목 확인
     각 태스크마다:
     - surface 결과에서 해당 태스크의 결과물이 존재하는가?
     - 코드 변경이 필요한 태스크 → 실제 파일이 변경되었는가?
     - 에러로 실패한 태스크 → 다른 surface에 재배정되었는가?

  2. 미완료 태스크 발견 시 (MANDATORY):
     → ⛔ 즉시 재배정:
       a. IDLE surface 중 능력 적합한 곳에 재배정
       b. 모든 surface 바쁨 → 가장 빨리 끝날 surface 완료 대기 후 배정
       c. 재배정 불가 → Main이 직접 실행
     → 재배정 후 수집 루프 재실행 (Step 4로 돌아감)

  3. 완결성 확인:
     SPECKIT_TASKS = [디스패치 시 분해한 전체 태스크 목록]
     COMPLETED = [결과 수집된 태스크]
     MISSING = SPECKIT_TASKS - COMPLETED
     if len(MISSING) > 0:
       → ⛔ BLOCKED — MISSING 태스크 재배정 필수
       → 재배정 후 이 GATE 재검증
     else:
       → ✅ GATE 5 통과

  예시:
    speckit 분해: [epub_export, cross_ref, spell_fix, burstiness_fix]
    S3에 배정: [epub_export, cross_ref, spell_fix]
    S10에 배정: [burstiness_fix]
    S10 ERROR → burstiness_fix 미완료
    → ⛔ burstiness_fix를 S1/S2/S5 중 하나에 재배정
    → 재배정 후 DONE 확인
    → 전체 4/4 완료 → ✅ GATE 5 통과
```

### GATE 4: 라운드 종료 자가 점검 체크리스트 (GATE 1-5 통과 후에만)

```
라운드를 종료하기 전에 Main은 반드시 이 체크리스트를 확인해야 한다:

□ GATE 1: 모든 surface DONE 확인 (WORKING/미확인 없음)
□ GATE 2: 코드리뷰 서브에이전트 위임 (Main 직접 리뷰 0건)
□ GATE 3: 서브에이전트 사용 규칙 준수
□ GATE 5: speckit 태스크 전체 완료 (미완료 0개 — 재배정 포함)
□ 서브에이전트 리뷰 결과 수신 + REJECT 항목 수정
□ 커밋 실행

하나라도 □(미체크)이면 → ⛔ 라운드 종료 금지. 미완료 항목 처리 후 재확인.
```

### 위반 이력 기록 (자가개선용)

```
위반 발생 시 /tmp/cmux-gate-violations.log에 기록:
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) GATE_${N}_VIOLATION: ${사유}" >> /tmp/cmux-gate-violations.log

세션 시작 시 이전 위반 이력 확인 → 반복 위반 패턴 감지 → SKILL.md 강화
```

## Phase -1: 온보딩 (최초 1회 또는 설정 변경 시)

> **이 Phase는 스킬 활성화 시 가장 먼저 실행됩니다.**
> 설정 파일이 있으면 재사용 여부를 물어보고, 없으면 처음부터 진행합니다.

### Step 0: 기존 설정 확인

```bash
CONFIG_FILE="${SKILL_DIR}/config/orchestra-config.json"
if [ -f "$CONFIG_FILE" ]; then
  # 기존 설정 발견 → 사용자에게 재사용 여부 질문
fi
```

**기존 설정 있을 때:**
```
이전 cmux 오케스트레이션 설정이 남아있습니다:
- surface:1 = Claude Code (시작: claude, 종료: /exit)
- surface:3 = Codex (시작: codex, 종료: /quit)
- surface:5 = Gemini (시작: gemini, 종료: Ctrl+C)

이전 세팅대로 진행할까요? (예/아니오)
```

- **예** → Phase 0으로 바로 이동 (온보딩 스킵)
- **아니오** → Step 1부터 새로 진행

### Step 0.5: cmux 이벤트 훅 자동 등록

세션 시작 시 cmux set-hook으로 이벤트 기반 감시를 자동 등록합니다.
eagle_watcher 20초 폴링을 보완하여 실시간 이벤트 반응이 가능합니다.

```bash
# 키 입력 후 상태 갱신 (작업 완료 즉시 감지)
cmux set-hook after-send-keys "bash ${SKILL_DIR}/scripts/eagle_watcher.sh --once > /dev/null 2>&1 &"

# 상태 바에 현재 오케스트레이션 상태 표시
cmux display-message -p "cmux orchestrator active"
```

> **참고**: `cmux set-hook --list`로 등록된 훅 확인, `--unset <event>`로 해제 가능.
> 세션 종료 시 훅은 자동 해제됨 (영속 X).

### Step 1: cmux 감지 + 활성화 질문

```bash
cmux tree --all  # surface 목록 확인
```

**surface가 2개 이상:**
```
cmux에 {N}개 창이 감지되었습니다. 멀티 AI 오케스트레이션을 활성화할까요?
(예/아니오)
```
- **예** → Step 1-1 (AI 확인) → Step 2
- **아니오** → 일반 모드

**surface가 1개 (Main만 있음):**
```
cmux에 창이 1개뿐입니다. 다른 AI를 추가하면 병렬 작업이 가능합니다.
새 창을 만들까요? (예/아니오)
```
- **예** → Step 1-1 (AI 설치 지원)
- **아니오** → 일반 모드

### Step 1-1: AI 에이전트 확인 + 설치 지원

**각 surface에 AI가 있는지 확인:**
```bash
# 각 surface 화면 읽어서 AI 존재 여부 판별
for sid in $(cmux tree --all | grep -oE 'surface:[0-9]+' | sed 's/surface://'); do
  screen=$(cmux read-screen --surface surface:$sid --lines 5)
  # AI 프롬프트 감지: ❯, ›, *, Type your message 등
done
```

**빈 surface 발견 시 (AI 없음):**
```
surface:{N}에 AI가 없습니다. 아래 중 하나를 설치할 수 있습니다:

1. codex  — OpenAI Codex CLI (코드 구현에 탁월)
2. gemini — Google Gemini CLI (조사/분석에 탁월)
3. claude — Claude Code (범용)
4. 기타   — 직접 명령어 입력

어떤 AI를 설치할까요? (번호 또는 명령어)
```

**설치 방법 프리셋:**

| AI | 설치 확인 | 설치 명령 | 실행 명령 |
|----|----------|----------|----------|
| Codex | `which codex` | `npm install -g @openai/codex` | `codex` |
| Gemini | `which gemini` | `npm install -g @google/gemini-cli` | `gemini` |
| Claude | `which claude` | 이미 설치됨 (현재 사용 중) | `claude` |
| GLM | `which ccg2` | 별도 설치 필요 | `ccg2` |

**설치 플로우:**
```bash
# 1. 설치 여부 확인
if ! command -v codex &>/dev/null; then
  # 2. 사용자에게 설치 안내
  echo "codex가 설치되어 있지 않습니다. 설치할까요?"
  # 3. 승인 시 설치
  npm install -g @openai/codex
fi
# 4. 새 surface에서 실행
cmux new-split right
# → 새 surface 번호 기억
cmux send --surface surface:N "codex"
cmux send-key --surface surface:N enter
```

**새 surface 생성:**
```bash
# 빈 surface 추가
cmux new-split right  # 또는 down
# → surface:N 반환
# AI 실행
cmux send --surface surface:N "{start_cmd}"
cmux send-key --surface surface:N enter
```

### AI 명령어 프리셋 (사용자에게 물어보지 않음)

```json
{
  "codex":    { "start": "codex",    "quit": "/quit", "reset": "/new",   "model": "gpt-5.4",          "difficulty": "high" },
  "opencode": { "start": "cco",     "quit": "/quit", "reset": "/new",   "model": "gpt-5.4",          "difficulty": "high" },
  "gemini":   { "start": "gemini",  "quit": "/quit", "reset": "/clear", "model": "gemini-3.1-pro",   "difficulty": "low" },
  "glm":      { "start": "ccg2",    "quit": "/quit", "reset": "/new",   "model": "glm-4.7",          "difficulty": "low" },
  "claude":   { "start": "claude",  "quit": "/exit", "reset": "/clear", "model": "claude-opus",      "difficulty": "high" }
}
```

> **공통 종료**: `/quit` (모든 AI 동일)
> **컨텍스트 초기화**: Codex/OpenCode/GLM = `/new`, Gemini/Claude = `/clear`
> **반드시 초기화 후 작업 전송** — `/new` 또는 `/clear` → sleep 3 → 작업 send

**AI별 작업 배분 규칙 (MANDATORY — 위반 시 자가개선):**

| AI | 모델 | 번들 크기 | 작업 유형 | 특기 |
|----|------|----------|----------|------|
| **OpenCode** (oh-my-opencode) | GPT-5.4 | **3-5개** (가장 많이) | 고난이도 코드, 대규모 리팩토링, 복잡한 분석, 멀티파일 구현 | Sisyphus 에이전트 + 스킬 시스템으로 자율성 최고 |
| **MiniMax** | M2.5 | **2-3개** | 코드 구현, 분석, 데이터 정제 | GLM과 비슷한 분량 |
| **GLM** | glm-4.7 | **2-3개** | 코드 구현, 조사, 보조 분석 | 코딩플랜 무료 |
| **Gemini** | gemini-3.1-pro | **2개** (가벼운 것) | 가벼운 구현, **디자인 리뷰**, **UI/UX 평가**, 코드 스타일 리뷰 | 디자인 감각이 강점 |
| **Main** (Opus) | claude-opus | 직접 처리 | 계획, speckit 분해, 리뷰 판정, 커밋, 취합 | 절대 코딩 직접 안 함 |

**배분 원칙:**
1. **OpenCode에 가장 많은 양 + 가장 어려운 작업** — GPT-5.4 + oh-my-opencode 플러그인으로 자율적 완수 가능
2. **디자인/UI 관련은 Gemini 우선** — 디자인 코드 리뷰, CSS/스타일링, UI 컴포넌트 평가
3. **GLM/MiniMax는 중간 분량** — 조사, 보조 구현, 데이터 처리
4. **Main은 코딩 금지** — 계획 + 판단 + 취합 + 커밋만

### Step 2: 각 창에 AI 로그인 요청

```
각 창에 사용할 AI를 로그인해주세요.
현재 빈 창 목록:
  - surface:1 (pane:2)
  - surface:3 (pane:4)
  - surface:5 (pane:5)

로그인 후 스크린샷을 보내주시거나
"surface:1은 Codex, surface:3은 Gemini" 형태로 알려주세요.
(시작/종료 명령어는 프리셋으로 자동 적용됩니다)
```

### Step 3: 사용자 응답 파싱 + 설정 저장

사용자가 "surface:1은 Claude, surface:3은 Codex, surface:5는 Gemini"라고 하면:
→ 프리셋에서 자동으로 start/quit/reset 명령어 매칭

```json
// ${SKILL_DIR}/config/orchestra-config.json (자동 생성)
{
  "created_at": "2026-03-18T12:00:00Z",
  "surfaces": {
    "1": {
      "ai": "Claude Code",
      "start_cmd": "claude", "quit_cmd": "/exit", "reset_cmd": "/clear",
      "model": "claude-opus",
      "capabilities": ["coding", "review"]
    },
    "3": {
      "ai": "Codex",
      "start_cmd": "codex", "quit_cmd": "/quit", "reset_cmd": "/new",
      "model": "gpt-5.4",
      "capabilities": ["coding", "implementation"]
    },
    "5": {
      "ai": "Gemini",
      "start_cmd": "gemini", "quit_cmd": "/quit", "reset_cmd": "/clear",
      "model": "gemini-3.1-pro",
      "capabilities": ["research", "analysis"]
    }
  },
  "main_surface": "4",
  "main_ai": "Opus"
}
```

### Step 4: 설정 확인 + 온보딩 완료

```
오케스트레이션 설정 완료:
┌─────────┬──────────┬──────────┬──────────┐
│ Surface │ AI       │ 시작     │ 종료     │
├─────────┼──────────┼──────────┼──────────┤
│ 1       │ Claude   │ claude   │ /exit    │
│ 3       │ Codex    │ codex    │ /quit    │
│ 5       │ Gemini   │ gemini   │ Ctrl+C   │
│ 4 (Me)  │ Opus     │ -        │ -        │
└─────────┴──────────┴──────────┴──────────┘

이제부터 IDLE surface에 자동으로 작업을 분배합니다.
에러 발생 시 해당 AI의 종료→재시작 명령으로 자동 복구합니다.
```

## Phase -1 에러 복구 프로토콜

설정 파일의 `start_cmd`/`quit_cmd`를 활용한 자동 복구:

```bash
# 에러 감지 → 해당 surface의 AI 재시작
function_recover_surface() {
  local sid="$1"
  local config=$(cat ${SKILL_DIR}/config/orchestra-config.json)
  local quit_cmd=$(echo "$config" | python3 -c "import json,sys;print(json.load(sys.stdin)['surfaces']['$sid']['quit_cmd'])")
  local start_cmd=$(echo "$config" | python3 -c "import json,sys;print(json.load(sys.stdin)['surfaces']['$sid']['start_cmd'])")

  # 1. 종료
  cmux send --surface surface:$sid "$quit_cmd"
  cmux send-key --surface surface:$sid enter
  sleep 3

  # 2. 재시작
  cmux send --surface surface:$sid "$start_cmd"
  cmux send-key --surface surface:$sid enter
  sleep 5

  # 3. 복구 확인
  cmux log --level warning --source recovery "surface:$sid recovered ($quit_cmd → $start_cmd)"
}
```

## 새 창 동적 감지 + 자동 등록 (MANDATORY)

사용자가 세션 중 새 창을 켜면 Main이 자동으로 인지하고 작업 창으로 추가해야 함.

**감지 방법:**
```bash
# eagle_watcher가 새 surface를 자동 감지 (기존 config에 없는 surface 발견)
# 현재 등록: config/orchestra-config.json의 surfaces 키 목록
# eagle 스캔: cmux tree --all에서 감지된 surface 목록
# 차이 = 새 창

# Main이 확인:
cmux tree --all  # 전체 surface 확인
cat ${SKILL_DIR}/config/orchestra-config.json  # 기존 등록 목록
# → 새 surface 발견 시 아래 절차 실행
```

**새 창 등록 절차:**
1. `cmux read-screen --surface surface:N --lines 5`로 어떤 AI인지 판별
2. 프리셋 매칭 (codex/opencode/gemini/glm/claude/minimax)
3. `orchestra-config.json`에 해당 surface 추가
4. 즉시 작업 배정 (IDLE=0 원칙)

**AI 판별 키워드:**

| 화면 키워드 | AI | 프리셋 |
|------------|-----|--------|
| `gpt-5` / `codex` / `Implement` | Codex | codex |
| `Sisyphus` / `opencode` / `OpenAI` | OpenCode | opencode |
| `gemini` / `sandbox` | Gemini | gemini |
| `glm` / `z.ai` | GLM | glm |
| `claude` / `opus` / `sonnet` | Claude | claude |
| `MiniMax` / `minimax` | MiniMax | minimax (codex 프리셋 + 난이도 high) |

## 아키텍처 — Persistent Eagle Watcher

```
┌─────────────────────────────────────────────────────────────┐
│                    Opus (Main Orchestrator)                  │
│  역할: 코드리뷰, 설계판단, 작업큐관리, 커밋                 │
│  금지: 직접 코딩, 수동 폴링                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │   eagle_watcher.sh (bash)        │ ← 20초 자동 폴링     │
│  │   API 비용: 0원 (순수 bash)      │   /tmp/cmux-eagle-    │
│  │   모든 surface 상태 → JSON 파일   │   status.json        │
│  └──────────────────────────────────┘                       │
│           ↓ 읽기                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │cmuxeagle │  │cmuxreview│  │ cmuxgit  │                  │
│  │ (haiku)  │  │(Opus상속)│  │ (haiku)  │                  │
│  │ 판단+전달│  │ 코드리뷰 │  │ 커밋/푸시│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ surface:1│  │ surface:2│  │ surface:3│  │ surface:5│   │
│  │  Claude  │  │  Claude  │  │  Codex   │  │  Gemini  │   │
│  │  워커    │  │  워커    │  │  워커    │  │  워커    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 529 안전 분석 — Persistent Eagle가 안전한 이유

```
Haiku eagle 감시자 = bash(cmux read-screen) + Haiku 1회 판단
  ├── cmux read-screen × 4 surfaces = bash 명령 4회 (API 0원)
  ├── Haiku 에이전트 = Anthropic API 1회 (Haiku, 별도 rate limit)
  ├── Main Opus = API 1회 (eagle 결과 처리)
  └── 총: Haiku 1 + Opus 1 = 동시 API 2개 (529 임계치 이하)
```

## Persistent Eagle Watcher 패턴 (v4 핵심)

### Layer 1: eagle_watcher.sh (bash, API 비용 0원)

**역할**: 20초마다 모든 surface를 폴링, JSON 상태 파일에 기록.
**API 비용**: 0원 (순수 bash + cmux 명령)
**위치**: `skills/cmux-orchestrator/scripts/eagle_watcher.sh`

```bash
# 백그라운드 시작 (세션 시작 시 1회)
nohup bash ${SKILL_DIR}/scripts/eagle_watcher.sh &
EAGLE_PID=$!

# 상태 파일 위치
cat /tmp/cmux-eagle-status.json
# → {"timestamp":"...","surfaces":{"1":{"status":"IDLE",...},...},
#    "idle_surfaces":"1 3","error_surfaces":"","waiting_surfaces":"5",
#    "stats":{"total":4,"idle":2,"working":1,"waiting":1}}

# 상태 종류:
# WORKING  — 작업 실행 중 (spinner/Working 표시)
# IDLE     — 대기 중 (프롬프트 표시) → 즉시 작업 배정
# WAITING  — 질문/확인 대기 (Would you like/confirm/y/n) → Main이 즉시 답변
# ERROR    — 오류 발생 (529/Context exceed 등) → 복구 조치
# UNKNOWN  — 상태 판별 불가 → 수동 확인
```

**⚠️ WAITING 감지 시 즉시 대응 (MANDATORY):**
WAITING surface는 사용자 입력을 기다리는 중 — Main이 cmux send로 즉시 답변해야 함.
방치하면 해당 surface가 영원히 대기 → IDLE=0 원칙 위반.

```bash
# WAITING 대응 예시
cmux read-screen --surface surface:N --lines 10  # 무엇을 묻고 있는지 확인
cmux send --surface surface:N "yes"               # 또는 적절한 답변
cmux send-key --surface surface:N enter
```

### 능동적 확인 프로토콜 (MANDATORY — eagle만으로는 부족!)

> **핵심**: eagle_watcher는 20초 폴링이므로 실시간이 아님. Main이 **능동적으로** 확인해야 함.

**Main이 반드시 실행해야 하는 확인:**

```bash
# 1. 작업 디스패치 전 surface 상태 확인 (MANDATORY)
cmux read-screen --surface surface:N --lines 5
# → 프롬프트가 보이면 OK, 질문이 보이면 먼저 답변

# 2. 작업 디스패치 후 10초 뒤 시작 확인
sleep 10 && cmux read-screen --surface surface:N --lines 5
# → Working/spinner가 보이면 OK, 변화 없으면 재전송

# 3. cmux surface-health로 전체 상태 한눈에
cmux surface-health
# → type=terminal in_window=true 확인

# 4. cmux set-hook으로 이벤트 기반 감시 (선택적)
cmux set-hook after-send-keys "bash eagle_watcher.sh --once"
# → 키 전송 후 자동으로 상태 갱신
```

**멈춤 감지 체크리스트 (Main이 매번 확인):**
1. eagle_watcher JSON에서 `waiting_surfaces` 확인
2. IDLE 시간이 60초+ → `cmux read-screen`으로 원인 파악
3. 질문 대기 → 즉시 `cmux send`로 답변
4. 에러 → `cmux send --surface surface:N "{reset_cmd}"`로 복구
5. 정상 IDLE → 다음 작업 즉시 배정

**cmux 공식 모니터링 명령어:**

| 명령어 | 용도 | 사용 시점 |
|--------|------|----------|
| `cmux surface-health` | surface 건강 상태 | 세션 시작 시, 주기적 |
| `cmux read-screen --lines N` | 화면 내용 직접 확인 | 작업 전후, 멈춤 의심 시 |
| `cmux set-hook <event> <cmd>` | 이벤트 기반 훅 등록 | 세션 시작 시 1회 |
| `cmux claude-hook idle` | surface IDLE 신호 | Claude Code 연동 시 |
| `cmux claude-hook active` | surface 활성 신호 | Claude Code 연동 시 |
| `cmux trigger-flash` | 시각적 플래시 알림 | 주의 필요 시 |
| `cmux notify` | 알림 전송 | 작업 완료/에러 시 |

### Layer 2: cmuxeagle (haiku) — 판단 + 작업 전달

**역할**: eagle_watcher.sh가 감지한 IDLE surface에 메인이 준 작업을 cmux send로 전달.
**모델**: haiku (빠르고 저렴, 529 위험 없음)

```
Agent(subagent_type="general-purpose", model="haiku", name="cmuxeagle",
  run_in_background=true, prompt="""
  You are cmuxeagle — task dispatcher for IDLE surfaces.

  INPUT: work_queue (JSON), status_file path

  PROCEDURE:
  1. Read /tmp/cmux-eagle-status.json
  2. Find IDLE surfaces
  3. For each IDLE surface with pending work:
     a. cmux send --surface surface:N "TASK: {work_item}"
     b. cmux send-key --surface surface:N enter
     c. sleep 3 (cooldown between sends)
  4. Report dispatched tasks to main

  RULES:
  - NEVER send to WORKING surface (overwrites previous task)
  - NEVER send to ERROR surface (fix first)
  - 3 second gap between sends
  - Report: {"dispatched":[{"surface":"N","task_id":X}],"skipped_working":["N"]}
""")
```

### 메인의 역할 분리 (v4.2 핵심)

```
┌─────────────────────────────────────────────────────────────┐
│                 Main Opus 전용 업무 (직접 수행)               │
│                                                              │
│  1. 오케스트레이션: 작업 큐 관리, cmux send 작업 분배        │
│  2. 계획 수립: 태스크 분해, 난이도 판정, surface 배정         │
│  3. 에러 대응: 529/장애 감지 → 복구 → 재위임                │
│  4. 커밋 판단: 리뷰 결과 보고 읽고 커밋/거부 결정            │
│  5. eagle 상태 읽기: cat /tmp/cmux-eagle-status.json         │
│                                                              │
│  ❌ Main이 하면 안 되는 것:                                   │
│  - 직접 코딩 (cmux send로 위임)                              │
│  - 직접 코드리뷰 (cmuxreview 서브에이전트에 위임)            │
│  - 수동 폴링 (eagle_watcher.sh가 자동)                       │
├─────────────────────────────────────────────────────────────┤
│                 서브에이전트 업무 (위임)                       │
│                                                              │
│  cmuxeagle (haiku): 상태 판단 + cmux send 작업 전달          │
│  cmuxreview (Sonnet): 코드 리뷰 ← ⚠️ Opus 금지 (529 방지)  │
│  cmuxgit (haiku): 커밋/푸시 실행                             │
│  cmuxplanner (sonnet): 대규모 작업 분해                      │
│  cmuxdiagnostic (haiku): 테스트 실행                         │
├─────────────────────────────────────────────────────────────┤
│                 cmux 외부 AI (0 API)                          │
│                                                              │
│  surface:1-5 워커: 실제 코딩, 조사, 분석                     │
│  → cmux send로만 통신 (529 위험 0%)                          │
│  → 유일한 0-risk 작업 위임 방법                              │
└─────────────────────────────────────────────────────────────┘
```

**API 동시 실행 예산 (계정 통합 제한):**
```
Main(Opus) = 1 (항상 점유)
+ cmuxreview(Sonnet) = 1 (코드리뷰 시)
+ cmuxeagle(Haiku) = 1 (작업 전달 시)
= 최대 3개 동시 (안전 한계)
+ cmux 다른 Claude surface = 숨겨진 1-2개
= 실제 4-5개 가능 → ⚠️ 주의
```
```

### Persistent Watcher 운영 플로우

```
1. 세션 시작 → eagle_watcher.sh 백그라운드 실행
2. Main이 작업 큐 생성 (WORK_QUEUE JSON)
3. Main이 cmuxeagle(haiku) 디스패치:
   - "이 작업 큐를 IDLE surface들에 분배해"
   - eagle는 상태 파일 읽고 → cmux send로 전달
4. Main은 코드리뷰/설계 작업에 집중
5. 20초 후: eagle_watcher.sh가 상태 갱신
6. Main이 cat /tmp/cmux-eagle-status.json 읽기 (bash 1회)
7. IDLE surface 발견 → 새 cmuxeagle 디스패치 (작업 큐의 다음 항목)
8. 반복
```

### 529 방지가 보장되는 이유

| 컴포넌트 | API 종류 | 동시 수 | 529 위험 |
|---------|---------|---------|---------|
| eagle_watcher.sh | 없음 (bash) | 1 | 없음 |
| cmuxeagle | Haiku API | 1 | 없음 (별도 rate limit) |
| cmuxreview | Opus API | 1 | 낮음 (Main과 동시 최대 2) |
| Main | Opus API | 1 | 기본 |
| cmux send 대상 | 외부 AI | 4 | 없음 (Anthropic 아님) |
| **총 동시 API** | | **최대 3** | **안전** |

### 2. cmuxreview (Sonnet) — 코드 리뷰어

**역할**: cmux AI가 코드를 반환하면, git diff를 리뷰하고 이슈를 보고.
**모델**: **Sonnet** (⚠️ Opus 금지 — Main Opus와 동시 실행 시 529 위험)
**장착 스킬**: code-reviewer-pro (correctness→security→performance→maintainability)

> **왜 Sonnet?**: 계정 통합 rate limit이므로 Opus 2개(Main+Sub) 동시 = 529 위험.
> Sonnet은 코드리뷰에 충분한 품질이며 비용도 1/5.
> **참고**: `effortLevel: high`는 Main 세션 설정이며, Agent 도구에는 effort 파라미터 없음.
> 대신 code-reviewer-pro 프롬프트 자체가 체계적 리뷰를 보장.

```
Agent(subagent_type="code-reviewer-pro", model="sonnet", name="cmuxreview",
  run_in_background=true, prompt="""
  You are cmuxreview — code reviewer for cmux AI outputs.

  When reviewing:
  1. cd $CLAUDE_PLUGIN_ROOT  # 프로젝트 루트
  2. git diff -- {specified_path}
  3. Priority: Correctness > Security > Performance > Maintainability
  4. Check: edge cases, null checks, error handling, type safety
  5. Verdict: APPROVE (no critical issues) or REJECT ([file:line] issue → fix)

  Focus on issues only. No praise. No style nitpicks.
""")
```

### 3. cmuxgit (haiku) — 커밋/푸시 담당

**역할**: 메인이 커밋 지시하면 즉시 실행. 시크릿 보호 + 메시지 생성.
**모델**: haiku (빠른 실행, 판단 불필요)
**subagent_type**: `git-workflow-manager` (Claude Code 내장 — Git 전문: branching, conventional commits, conflict resolution)

```
Agent(subagent_type="git-workflow-manager", model="haiku", name="cmuxgit",
  run_in_background=true, prompt="""
  You are cmuxgit — git commit/push handler.

  When main sends a commit request with files and summary:
  1. cd $CLAUDE_PLUGIN_ROOT  # 프로젝트 루트
  2. git status --short (변경 확인)
  3. git add {specified_files} (절대 .env, secrets, credentials 포함 금지)
  4. git diff --cached --stat (커밋될 내용 확인)
  5. Generate commit message (conventional commits: feat/fix/chore)
  6. git commit -m "{message}\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
  7. git push origin main
  8. Report: "COMMITTED: {hash} — {1줄 요약}"

  시크릿 보호 규칙:
  - .env, credentials.json, secrets/ → 절대 커밋 금지
  - 발견 시 즉시 보고하고 커밋 중단
""")
```

### 4. cmuxplanner (sonnet) — 작업 큐 생성기

**역할**: 대규모 작업을 AI별 적정 크기로 분해하고 작업 큐를 생성.

```
Agent(subagent_type="general-purpose", model="sonnet", name="cmuxplanner",
  prompt="""
  You are cmuxplanner — work queue generator.

  Given a large task description and available surfaces:
  1. Break into 4-8 independent sub-tasks
  2. Each sub-task: minimum 10 minutes of work (no micro-tasks)
  3. Assign difficulty: Codex=hard, Gemini=medium+research, GLM=simple+files
  4. Ensure file scope isolation (no overlap)
  5. Output JSON: [{"id":1, "task":"...", "target":"codex|gemini|glm", "files":["..."], "estimated_minutes":15}]
""")
```

### 5. cmuxdiagnostic (haiku) — 코드 리뷰 전 사전 검사

**역할**: 커밋 전 빠른 검증 (테스트 실행, 구문 검사).

```
Agent(subagent_type="general-purpose", model="haiku", name="cmuxdiagnostic",
  run_in_background=true, prompt="""
  You are cmuxdiagnostic — pre-commit verification.

  You will receive a verify request with:
  - working_dir: <path>
  - test_commands: ["<cmd1>", "<cmd2>"]

  Execute each command in the specified directory and report results.
  If no test_commands specified, run: git diff --name-only HEAD | head -20
  Report: "TESTS: X/Y PASSED" or "TESTS: FAILED — {details}"
""")
```

## 전용 에이전트 요약

| 컴포넌트 | 종류 | 모델/비용 | 역할 | 상시/온디맨드 |
|---------|------|----------|------|-------------|
| **eagle_watcher.sh** | bash 스크립트 | **API 0원** | 20초 자동 폴링 → JSON 상태 파일 | **상시** (백그라운드) |
| **cmuxeagle** | 서브에이전트 | haiku | 상태 판단 + cmux send 작업 전달 | 온디맨드 |
| **cmuxreview** | 서브에이전트 | **Sonnet** | 코드 리뷰 (code-reviewer-pro) | 온디맨드 |
| **cmuxgit** | 서브에이전트 | haiku | 커밋/푸시 (git-workflow-manager) | 온디맨드 |
| **cmuxplanner** | 서브에이전트 | sonnet | 작업 큐 생성 (태스크 분해) | 온디맨드 |
| **cmuxdiagnostic** | 서브에이전트 | haiku | 사전 검증 (테스트 실행) | 온디맨드 |

### 상황별 추가 에이전트 (온디맨드, 529 예산 내)

필수 에이전트 외에 상황에 따라 추가 디스패치 가능 (단, 동시 2개 이하):

| 상황 | subagent_type (내장) | 모델 | 용도 |
|------|---------------------|------|------|
| 보안 민감 코드 수정 | `security-auditor` | sonnet | OWASP Top 10 + 취약점 검사 |
| 구현 완료 후 | `test-automator` | sonnet | 테스트 자동 생성 |
| surface ERROR 장애 | `debugger` | sonnet | 에러 근본 원인 분석 |
| 코드베이스 탐색 | `Explore` | haiku | 파일 구조 파악 (빠름) |
| API 설계 | `backend-architect` | sonnet | 아키텍처 설계 검증 |

> **모두 Claude Code 내장 subagent_type.** 별도 설치 불필요.
> 529 예산: Main(1) + 서브에이전트(최대 1) = 동시 2개. 순차 사용은 자유.

### 서브에이전트 스킬 주입 메커니즘

> **서브에이전트는 Skill() 도구를 호출할 수 없다. 대신 `skills` 프론트매터로 스킬 콘텐츠를 미리 주입받는다.**

**방법: `.claude/agents/` 에이전트 정의 파일에서 `skills:` 필드 사용**

```yaml
# ~/.claude/agents/my-code-reviewer.md
---
name: code-reviewer-pro
skills:
  - karpathy-guidelines      # 코딩 실수 방지
  - code-review              # 리뷰 프로세스
  - production-code-audit    # 프로덕션 품질
  - security-insecure-defaults # 보안 기본값
  - trinity                  # 코드 품질 평가
  - tob-differential-review  # 차이점 분석
  - tob-fp-check            # 오탐 제거
  - tob-sharp-edges         # 위험 API 감지
model: inherit
---
```

**현재 장착 스킬:**

| 에이전트 | subagent_type | 장착 스킬 수 | 주요 스킬 |
|---------|-------------|-----------|----------|
| cmuxreview | `code-reviewer` | **0개** | A/B 5회 테스트 결과: 0스킬이 4승1패로 최적. 지시 준수율↑, 버그 감지율 동등, 출력 10x 절약 |
| security-auditor | `security-auditor` | **15개** | tob-codeql, tob-semgrep, trivy, guardrails, tob-supply-chain-risk-auditor 등 |
| cmuxgit | `git-workflow-manager` | 기본 | Git 전문 (branching, conventional commits) |
| debugger | `debugger` | 기본 | 에러 근본 원인 분석 |
| test-automator | `test-automator` | 기본 | 테스트 자동 생성 |

> 스킬은 에이전트 시작 시 **컨텍스트에 자동 주입**됨. 런타임에 Skill() 호출이 아님.
> 에이전트 정의 파일은 `~/.claude/agents/`에 위치.

### 순차 파이프라인 (529 안전)

복합 작업 시 서브에이전트를 **순차 실행** (동시 1개만):

```
사용자 요청: "코드 구현 + 리뷰 + 보안 검사"

Phase 1: Main 구현 (또는 cmux send로 위임)
  ↓
Phase 2: cmuxreview (code-reviewer-pro + 11 skills)
  → Main이 결과 검증 → APPROVE/REJECT
  ↓
Phase 3: security-auditor (15 skills)
  → Main이 결과 검증 → 보안 이슈 수정
  ↓
Phase 4: test-automator
  → 테스트 자동 생성
  ↓
Phase 5: Main 커밋
```

**529 안전**: 각 Phase에서 서브에이전트 **1개만** 실행 → Main + Sub = 2개 (안전).
Phase 간 전환 시 이전 에이전트 완료 후 다음 실행.

### 지속 스킬 최적화 (실제 작업 중 자동)

> 단발 A/B 테스트가 아닌 **실제 작업하면서 지속적으로** 최적화.

**에이전트 스킬 최적화 현황:**

| 에이전트 | 스킬 | 테스트 방법 | 상태 |
|---------|------|-----------|------|
| cmux-reviewer | 5 | A/B 테스트 (11→5, 감지율 동일) | ✅ 최적화 완료 |
| cmux-git | 2 | A/B 테스트 (3→2, 핵심만) | ✅ 최적화 완료 |
| cmux-security | 4 | 번들 정의 (보안 전문 4개) | 실전 검증 필요 |
| debugger | 5 | 기존 정의 유지 | 실전 검증 필요 |
| test-automator | 7 | 기존 정의 유지 | 실전 검증 필요 |

**실전 최적화 프로토콜 (단발 A/B가 아닌 지속 관찰):**
```
매 서브에이전트 호출 시:
1. 결과에서 "사용한 스킬" 보고 요청 (프롬프트에 포함)
2. 실제 사용 스킬 기록
3. 3회 연속 미사용 스킬 → 제거 후보
4. 필요했으나 없던 스킬 → 추가 후보
5. 에이전트 정의 파일 업데이트
```

**Main의 계획 파이프라인:**
- speckit 라인 있으면: `speckit-specify → speckit-plan → speckit-tasks` 자동 체이닝
- 없으면: `writing-plans → executing-plans` 또는 Main 직접 계획

## "다음 라운드" 프로토콜 (MANDATORY)

> 사용자가 "다음 라운드 진행해"라고 하면 이 사이클을 반드시 실행.

```
Step 0: cmux 공식 기능 자동 활성화 (라운드 시작 시 1회)
  ├── cmux set-hook after-send-keys "bash ${SKILL_DIR}/scripts/eagle_watcher.sh --once > /dev/null 2>&1 &"
  ├── cmux surface-health  # 전 surface 건강 상태 확인
  ├── cmux display-message "Round N 시작"
  └── python3 ${SKILL_DIR}/scripts/speckit-tracker.py --init "Round N"  # 태스크 추적 초기화

Step 1: 조사 — 각 AI surface에 조사 주제 배포
  조사 방법 자동 선택 (환경에 따라):

  방법 A: search_executor.py 있는 경우 (우리 환경)
  ├── surface:N → "python3 search_executor.py --query '주제' --full --outdir /tmp/r{N}_topic"
  ├── 결과: /tmp/r{N}_topic/refined.json
  └── ⚠️ --outdir 사용 (--output 아님)

  방법 B: search_executor.py 없는 경우 (범용 — 다른 사용자)
  ├── 각 AI가 직접 웹 검색 + 조사
  ├── surface:N → "다음 주제를 조사해줘: {주제}. 웹 검색으로 최신 정보를 찾고 핵심 인사이트 5개를 정리해. 완료 후 DONE: 으로 알려줘."
  ├── AI가 WebSearch/MCP/내장 도구로 직접 조사
  └── 결과: surface 화면에 텍스트로 출력 (read-screen으로 수집)

  자동 감지 방법:
  ```bash
  if command -v python3 && python3 -c "import search_executor" 2>/dev/null; then
    # 방법 A: search_executor.py 사용
  else
    # 방법 B: AI 직접 조사
  fi
  ```

  공통 규칙:
  ├── 모든 IDLE surface에 각각 다른 주제 배정 (IDLE=0 원칙)
  ├── AI별 능력 맞춤 번들 (OpenCode 3-5개, Gemini 2개 등)
  └── 긴 프롬프트 → cmux set-buffer + paste-buffer 사용

Step 1.5: speckit 태스크 분해 — Skill("speckit-tasks") 호출 (MANDATORY)
  ├── 연구 결과 인사이트 → speckit 태스크 목록 변환
  ├── 태스크→큐 변환 프로토콜 적용 (난이도/파일스코프/Wave)
  └── 작업 큐 → cmux surface 배정 + 즉시 디스패치

Step 2: A/B 테스트 — 현재 구성 vs 개선안
  ├── Agent A: 현재 설정으로 동일 작업
  └── Agent B: 조사 결과 기반 개선 설정으로 동일 작업
  ↓ (결과 비교)

Step 3: 채택 — 더 나은 결과를 채택
  ├── A 승: 기존 유지
  └── B 승: 개선안으로 에이전트 정의/스킬/코드 업데이트
  ↓

Step 4: 리뷰 — 코드 완료 즉시 서브에이전트 코드리뷰 (MANDATORY)
  ├── Agent(subagent_type="code-reviewer", model="sonnet") 백그라운드 디스패치
  ├── APPROVE → Step 5로
  └── REJECT → 해당 surface에 수정 요청 재전송 → 재리뷰
  ↓

Step 5: 커밋 — Main이 판단 후 실행 (MANDATORY — 생략 금지!)
  ├── git status로 변경 파일 확인
  ├── 시크릿 파일(.env, credentials) 제외
  ├── 관련 변경만 선별 스테이징 (git add 파일명)
  └── 커밋 메시지 자동 생성 + Co-Authored-By 태그
  ↓

Step 6: 자가개선 — 리뷰 이슈 수정 + SKILL.md 업데이트
```

**핵심 규칙 (6-Step 전체 완주 MANDATORY — 단계 생략 금지!):**
1. 조사는 **반드시 cmux surface에 search_executor.py --outdir로 위임** (Main 직접 안 함)
2. **speckit 스킬을 실제로 호출**하여 태스크 분해 (수동 분해 금지)
3. A/B 테스트는 **같은 입력, 다른 구성**으로 비교
4. 채택 시 **기존보다 나은 경우에만** 변경 (baseline 보호)
5. **코드 완료 즉시** 서브에이전트 코드리뷰 디스패치 (대기 금지)
6. **리뷰 통과 후 반드시 커밋** — 커밋 없이 라운드 종료 금지
7. **IDLE surface = 0** — 모든 surface에 항상 작업 배정
- 멈추지 않음 — 5단계 전체 완주

## API 과부하 방지 (529 Error Prevention) v2 — CRITICAL

### 529 vs 429 차이

| 코드 | 의미 | 원인 | 해결 |
|------|------|------|------|
| **429** | Rate limit exceeded | 분당/일당 토큰 한도 초과 | 대기 후 재시도 (Retry-After 헤더) |
| **529** | Overloaded | Anthropic 서버 자체 과부하 | 동시 요청 줄이기 + 백오프 |

529는 **서버 과부하**이므로 단순 대기로 안 풀림. **동시 요청 수 자체를 줄여야** 함.

### 근본 원인
- 서브에이전트 3개+ 동시 → 메인 포함 4개+ Opus/Sonnet API 동시 요청
- 각 에이전트가 도구 호출할 때마다 API 요청 추가 발생
- cmux 워커(외부 AI)도 동시에 Anthropic API 사용 가능 (다른 Claude Code 인스턴스)
- **숨겨진 요인**: cmux의 다른 Claude surface도 동시 API 사용 → 계정 전체 rate limit 공유

### 방지 규칙 (v2 — Exponential Backoff + Circuit Breaker)

| 규칙 | 상세 |
|------|------|
| **서브에이전트 총합 2개 이하** | Main 포함 총 API 동시 3개 (계정 통합 제한) |
| **Haiku도 같은 풀** | Haiku가 별도 쿼터가 아님! 모든 모델 합산 |
| **Haiku 우선은 여전히 유효** | API 호출 횟수/비용이 적어 부하는 낮음 |
| **cmux send는 무료** | 외부 AI(Codex/Gemini/GLM) 전송은 API 부하 0 |
| **cmux surface의 다른 Claude도 계산** | surface:1,2가 Claude면 그것도 Opus API 사용 중! |

### Exponential Backoff + Jitter (MANDATORY)

529 발생 시 고정 대기가 아닌 **지수 백오프 + 랜덤 지터** 사용:

```python
import random, time

def retry_with_backoff(func, max_retries=5):
    """529/429 발생 시 지수 백오프 + 지터로 재시도."""
    for attempt in range(max_retries):
        try:
            return func()
        except OverloadedError:  # 529
            if attempt == max_retries - 1:
                raise
            base_delay = min(2 ** attempt, 60)  # 1, 2, 4, 8, 16... max 60초
            jitter = random.uniform(0, base_delay * 0.5)  # 0~50% 랜덤
            delay = base_delay + jitter
            print(f"529 detected, retry {attempt+1}/{max_retries} after {delay:.1f}s")
            time.sleep(delay)
```

### Circuit Breaker 패턴 (Half-Open State 포함)

연속 529 발생 시 3-상태 Circuit Breaker:

```
상태 전이:

  CLOSED (정상) ──529 2회──→ OPEN (차단)
       ↑                        │
       │                    60초 대기
       │                        ↓
       └──성공──→ HALF-OPEN (회복 중)
                    │
                    └──실패──→ OPEN + 120초 대기
```

```python
CIRCUIT = {
    "state": "CLOSED",      # CLOSED / OPEN / HALF_OPEN
    "failures": 0,
    "max_concurrent": 2,    # Main 제외
    "cooldown_until": 0,
    "half_open_test_sent": False,
}

def on_529_error():
    CIRCUIT["failures"] += 1
    if CIRCUIT["failures"] >= 2:
        CIRCUIT["state"] = "OPEN"
        CIRCUIT["max_concurrent"] = 0  # 서브에이전트 전면 중단
        CIRCUIT["cooldown_until"] = time.time() + 60
        print("🛑 OPEN: 서브에이전트 중단, cmux send만 사용 (60초)")

def check_circuit():
    if CIRCUIT["state"] == "OPEN":
        if time.time() > CIRCUIT["cooldown_until"]:
            CIRCUIT["state"] = "HALF_OPEN"
            CIRCUIT["half_open_test_sent"] = False
            print("🟡 HALF-OPEN: 테스트 요청 1개 허용")
    if CIRCUIT["state"] == "HALF_OPEN" and not CIRCUIT["half_open_test_sent"]:
        CIRCUIT["half_open_test_sent"] = True
        return True  # 1개 테스트 요청 허용
    return CIRCUIT["state"] == "CLOSED"

def on_success():
    if CIRCUIT["state"] == "HALF_OPEN":
        CIRCUIT["state"] = "CLOSED"
        CIRCUIT["failures"] = 0
        CIRCUIT["max_concurrent"] = 2
        print("✅ CLOSED: 정상 복구, 서브에이전트 2개 허용")
```

### 안전한 동시 실행 조합

```
✅ 최안전: cmux send 4개 (0 API) + 메인(Opus) = Opus 1개만
✅ 안전:   cmuxeagle(haiku) + 메인(Opus) = API 2개 (별도 model rate limit)
✅ 안전:   cmuxeagle(haiku) + cmuxgit(haiku) + 메인(Opus) = 3개 (haiku 별도)
⚠️ 주의:   cmuxreview(Sonnet) + 메인(Opus) = 2개 — surface Claude 수에 따라 주의
❌ 위험:   cmuxreview(Sonnet) + cmuxplanner(sonnet) + cmuxeagle(haiku) + 메인 = 4개
❌ 금지:   3개+ Opus/Sonnet 서브에이전트 동시
```

### 서브에이전트 vs cmux send 부하 비교

| 방식 | Anthropic API | 529 위험 | 비용 |
|------|-------------|---------|------|
| **cmux send** (외부 AI) | 0 | 없음 | 0원 |
| **cmuxeagle** (haiku) | Haiku 1회 | 없음 (별도 limit) | 최저 |
| **cmuxgit** (haiku) | Haiku 1회 | 없음 | 최저 |
| **cmuxreview** (Opus) | Opus 1회+ | **중간** | 높음 |
| **cmuxplanner** (sonnet) | Sonnet 1회+ | **중간** | 중간 |
| **impl-worker** (sonnet) | Sonnet 다수 | **높음** | 중간 |

### cmux send 쿨다운

cmux send 자체는 API 0이지만, 수신측이 Claude이면 그 Claude가 API 사용:

```bash
# ✅ cmux send는 API 무관 — 빠르게 연속 전송 OK
cmux send --surface surface:1 "task1" && cmux send-key --surface surface:1 enter
cmux send --surface surface:3 "task2" && cmux send-key --surface surface:3 enter  # Codex=무관
cmux send --surface surface:5 "task3" && cmux send-key --surface surface:5 enter  # Gemini=무관
# ⚠️ 단, surface:1,2가 다른 Claude Code면 그들이 동시 Opus API 사용
```

### 529 발생 시 행동 프로토콜 (v2)

```
1. 첫 529 → 5초 대기 → 재시도
2. 두번째 529 → 15초 대기 + 서브에이전트 1개로 축소 → 재시도
3. 세번째 529 → 60초 대기 + 서브에이전트 전면 중단 → cmux send만 사용
4. 5분 후 → 서브에이전트 1개 허용으로 복귀
5. 10분 후 → 정상 복귀 (최대 2개)
```

### 모델별 동시성 (⚠️ 계정 단위 통합 — 별도 아님!)

> **딥 리서치 결과 (2026-03-18, 신뢰도 95%)**:
> Haiku/Sonnet/Opus 모두 **계정 단위 통합 제한** 사용.
> 모델별 독립 쿼터 없음 (GitHub #32254, #33154 확인).
> → Haiku 서브에이전트도 Opus와 같은 풀에서 소비!

| 상황 | 총 동시 API | 529 위험 |
|------|-----------|---------|
| Main(Opus) 단독 | 1 | 없음 |
| Main + Haiku 1 | 2 | 낮음 |
| Main + Haiku 2 | 3 | **중간** |
| Main + Haiku 2 + cmux Claude 2 | **5** | **높음** |
| Main + Sonnet 1 + Haiku 1 | 3 | **중간** |

**핵심 변경**: Haiku도 별도가 아니므로, **서브에이전트 총합 2개 이하** (Main 포함 3개)가 안전.

**Model Fallback 패턴 (529 발생 시):**
```
529 on Opus subagent
  → 같은 작업을 Sonnet으로 재시도
  → 529 on Sonnet
    → Haiku로 다운그레이드 (판단 품질 감소 감수)
    → 529 on Haiku
      → Circuit Breaker OPEN (5분 대기)
```

### 프로덕션 재시도 설정 (OpenClaw #24321 기반)

```python
RETRY_CONFIG = {
    "max_attempts": 3,       # 최대 재시도
    "min_delay_ms": 2000,    # 초기 대기 2초
    "max_delay_ms": 30000,   # 최대 대기 30초
    "jitter": 0.1,           # 10% 지터 (thundering herd 방지)
    "timeout_ms": 60000,     # 전체 타임아웃 60초
}
```

### 커뮤니티 검증 인사이트 (2026-03 조사)

**출처**: GitHub Issues #661, #29099 / Reddit r/ClaudeAI / Anthropic 공식 문서

1. **529 ≠ 429**: 429는 quota 초과(대기하면 풀림), 529는 서버 과부하(동시 요청 줄여야 함)
2. **Claude Code 자동 재시도 버그**: 일부 버전에서 529 자동 재시도가 깨짐 → 수동 재시도 필수
3. **피크 시간 회피**: 09:00-17:00 PST (한국 시간 02:00-10:00) 회피
4. **529 클러스터**: 5-30분간 지속 → 첫 529 후 바로 재시도하면 악화
5. **지터 필수**: 고정 간격 재시도는 동시 재시도 충돌(thundering herd) → 랜덤 지터 추가
6. **컨텍스트 팽창 주의**: PDF/큰 파일이 보이지 않게 컨텍스트 소비 → 사용률 6%에서도 limit 발생 가능
7. **최대 재시도 10회, 최대 대기 60초**: Perplexity/Reddit 합의

**핵심 교훈 (딥 리서치 수정):**
1. cmux send(외부 AI)는 0 API — 이것이 가장 안전한 작업 위임 방법
2. **⚠️ Haiku도 Opus와 같은 계정 풀 공유** — 별도 쿼터 아님 (GitHub #32254)
3. 서브에이전트 총합 2개 이하 (Main 포함 3개) — 이것이 안전 한계
4. 다른 cmux surface의 Claude도 같은 계정의 API 사용 — 숨겨진 부하
5. **cmux send 우선 전략**: 서브에이전트보다 cmux send를 항상 먼저 고려 (529 0% 위험)
6. **Claude Code 자동 재시도 신뢰 금지** — Issue #661 미해결, 수동 구현 필수

## 메인 오케스트레이터 워크플로우

### Phase 0: 환경 파악 + 서브에이전트 부트 + Eagle Watcher

#### Step 0-1: cmux 환경 확인
```bash
cmux tree --all
cmux identify
```

#### Step 0-2: 필수 서브에이전트 자동 생성 (529 안전)

오케스트레이션에 필요한 서브에이전트를 **529 안전 범위 내에서** 자동 생성.

**필수 에이전트 목록:**

| 에이전트 | 모델 | subagent_type | 역할 | 설치 필요? |
|---------|------|-------------|------|----------|
| eagle_watcher.sh | bash (API 0) | — | surface 감시 | ❌ bash 스크립트 |
| cmuxreview | Sonnet | `code-reviewer-pro` | 코드 리뷰 | ❌ **Claude Code 내장** |
| cmuxgit | Haiku | `git-workflow-manager` | 커밋/푸시 | ❌ **Claude Code 내장** |

> **subagent_type은 `~/.claude/agents/` 에이전트 정의 파일로 구성.**
> 각 에이전트는 `skills:` 필드로 스킬을 미리 주입받음 (런타임 Skill() 호출 아님).
> `code-reviewer-pro`는 11개 스킬 장착 (karpathy-guidelines, code-review, production-code-audit 등).
> `security-auditor`는 15개 스킬 장착 (tob-codeql, tob-semgrep, trivy 등).
> 에이전트 정의 파일이 없으면 기본 동작, 있으면 스킬 강화 버전 사용.

**에이전트 설치 플로우:**
```
1. 번들 에이전트 설치 상태 확인
   bash scripts/install_agents.sh --check

2. 미설치 에이전트 발견 시 사용자에게 안내:
   "cmux 오케스트레이션에 최적화된 서브에이전트를 설치합니다:
    - cmux-reviewer (코드리뷰, Sonnet, 5개 스킬)
    - cmux-git (커밋, Haiku, 2개 스킬)
    - cmux-security (보안감사, Sonnet, 4개 스킬)
    설치할까요? (예/아니오)"

3. 예 → bash scripts/install_agents.sh --install
   아니오 → 기본 subagent_type 사용 (스킬 없이 동작)
```

**번들 에이전트 (이 스킬에 포함):**

| 에이전트 | 스킬 수 | 모델 | 용도 |
|---------|--------|------|------|
| cmux-reviewer | 5개 (A/B 최적화) | Sonnet | 코드리뷰 |
| cmux-git | 2개 | Haiku | 커밋/푸시 |
| cmux-security | 4개 | Sonnet | 보안감사 |

에이전트 정의 파일은 `skills/cmux-orchestrator/agents/`에 번들.
`--install` 시 `~/.claude/agents/`에 복사.
이미 설치된 에이전트는 스킵 (덮어쓰기 안 함).

**529 안전 에이전트 예산:**
```
총 동시 API 예산: 3개 (Main 포함)
├── Main (Opus): 1개 (항상 점유)
├── cmuxreview (Sonnet): 1개 (온디맨드)
└── eagle_watcher.sh: 0개 (bash, API 미사용)
= 최대 2개 동시 API (안전)
```

**서브에이전트 없이 운영 시 (사용자가 거부한 경우):**

| 역할 | 서브에이전트 모드 | Main 직접 모드 |
|------|-----------------|---------------|
| 감시 | eagle_watcher.sh (bash) | eagle_watcher.sh (bash) — 동일 |
| 코드 리뷰 | cmuxreview (Sonnet) | Main이 직접 git diff 읽고 리뷰 |
| 커밋 | cmuxgit (Haiku) | Main이 직접 git commit |

> **서브에이전트 = 편의 기능**. 없어도 오케스트레이션은 작동함.
> eagle_watcher.sh는 bash 스크립트라 항상 사용 가능.

#### Step 0-3: Eagle Watcher 시작
```bash
pkill -f eagle_watcher.sh 2>/dev/null
bash ${SKILL_DIR}/scripts/eagle_watcher.sh &
bash ${SKILL_DIR}/scripts/eagle_watcher.sh --once
# ⚠️ nohup 금지 — cmux 세션 내부에서만 작동
```

**⚠️ 백그라운드 모드 주의:**
- `bash eagle_watcher.sh &` (persistent) — bash 함수가 서브프로세스에서 유실될 수 있음
- 권장: `--once` 모드를 메인 루프에서 반복 호출 (더 안정적)
- 또는: 별도 cmux surface에서 `bash eagle_watcher.sh` 상시 실행

### Phase 1: 철저한 계획 수립 + 작업 큐 생성

> **Main의 가장 중요한 역할은 계획이다. 계획 없이 배포하면 실패한다.**

#### Step 1-0: 계획 파이프라인 자동 선택

시스템에 설치된 계획 스킬을 탐색하여 **가장 적합한 파이프라인**을 자동 선택:

```
탐색 순서 (우선순위):
1. speckit 라인 (specify→plan→tasks) — 가장 체계적
2. writing-plans + executing-plans — Superpowers 공식
3. brainstorming → writing-plans — Superpowers 기본
4. Main 직접 계획 — 스킬 없을 때 fallback
```

| 탐색 대상 | 확인 키워드 |
|----------|-----------|
| available_skills 목록 | `speckit`, `writing-plans`, `brainstorming`, `plan` |
| `~/.claude/skills/` | 디렉토리 존재 여부 |
| `~/.claude/plugins/` | 설치된 플러그인 |

**결과에 따른 자동 선택:**

| 발견된 스킬 | 파이프라인 | 흐름 |
|------------|----------|------|
| speckit-specify + speckit-plan + speckit-tasks | **Speckit Pipeline** | specify→plan→tasks→implement |
| writing-plans + executing-plans | **Superpowers Plan** | writing-plans→executing-plans |
| brainstorming만 | **Brainstorm→직접 계획** | brainstorming→Main 계획 |
| 아무것도 없음 | **Main 직접** | Main이 계획→작업큐 직접 생성 |

#### Step 1-1: 계획 수립 + 작업 분해

**복잡 작업 시 (3개+ 파일, 조사+구현):**

Speckit 라인이 있으면:
```
Skill("speckit-specify") → 요구사항 체계화
  ↓
Skill("speckit-plan") → 아키텍처 + 데이터 모델 + ADR
  ↓
Skill("speckit-tasks") → 의존성 기반 태스크 분해
  ↓
태스크 목록 → cmux 작업 큐로 변환 → surface 배정
```

### 태스크→큐 변환 프로토콜 (MANDATORY)

speckit-tasks가 생성한 태스크를 cmux 작업 큐로 변환하는 구체적 절차:

```
Step 1: 태스크 분류 — 난이도 + 파일 스코프 판정
  각 태스크에 대해:
  ├── 난이도: 상급/중상급 → Codex surface
  ├── 난이도: 중급/중하급 → GLM/Gemini surface (라운드로빈)
  └── 파일 스코프: 1 태스크 = 1 surface (파일 겹침 금지)

Step 2: 의존성 기반 Wave 분할
  ├── Wave 1: 독립 태스크들 (병렬 실행)
  ├── Wave 2: Wave 1 결과에 의존하는 태스크들
  └── Wave N: 통합/리뷰 태스크

Step 3: 컨텍스트 초기화 + cmux send 디스패치 (MANDATORY)
  각 surface에 작업 배정 전 반드시 초기화:
  1. cmux send --surface surface:N "{reset_cmd}"  # /new(Codex/GLM) 또는 /clear(Gemini)
  2. cmux send-key --surface surface:N enter
  3. sleep 3  # 초기화 대기
  4. cmux send --surface surface:N "다음 N가지 작업을 순서대로 수행해줘: (1) ... (2) ... 완료 후 DONE:"
  5. cmux send-key --surface surface:N enter

  ⚠️ 번들링 규칙:
  - 같은 파일/모듈 관련 태스크 2-3개를 한 surface에 번들 배정 가능
  - 다른 파일 태스크는 파일 스코프 원칙에 따라 다른 surface에
  - 번들 형식: "다음 N가지 작업을 순서대로 수행해줘: (1) ... (2) ... (3) ..."

  ⚠️ Gemini 특수 사항 (필수 — 2-Phase 전송):
  - Gemini는 /clear와 작업을 **같은 cmux send로 보내면 안 됨** (한 줄로 합쳐져서 실패)
  - **반드시 2-Phase**:
    Phase 1: cmux send --surface surface:N "/clear" → send-key enter → sleep 4
    Phase 2: cmux send --surface surface:N "작업 내용" → sleep 1 → send-key enter
  - send-key enter 미반영 시 → sleep 5 → read-screen으로 확인 → enter 재전송
  - **Gemini 프롬프트 식별**: "Type your message" 또는 " * " 또는 모델명 표시

  ⚠️ Codex 제약사항:
  - Codex sandbox 모드에서는 cmux CLI 직접 실행 불가 (소켓 접근 차단)
  - cmux 관련 작업은 Codex에 배정 금지 → Claude Code 또는 Gemini surface에 배정
  - Codex는 코드 구현 + 분석만 담당 (cmux read-screen/send/set-hook 등 실행 불가)

Step 4: 과업 완료 수집 — 체크리스트 기반 (MANDATORY — 빠뜨리면 안 됨!)

  ⚠️ 모든 surface의 결과를 Main이 반드시 수집해야 함. 수집 안 하면 코드리뷰 불가.

  4-1. 과업 체크리스트 생성 (디스패치 시점에 작성)
    ```
    TASK_CHECKLIST:
      S1:  [ ] 2개 번들 — cmux 검증 + hook 확인
      S3:  [ ] 4개 번들 — orchestrator + embedding + qa + 검증
      S5:  [ ] 2개 번들 — 디자인 리뷰 + 스타일 분석
      S10: [ ] 2개 번들 — publish_utils + 에러 핸들링
    ```

  4-2. 주기적 수집 루프 (모든 surface 완료까지 반복)
    ```bash
    # 30초마다 전 surface 스캔
    for sid in $(registered surface IDs); do
      STATUS=$(eagle_watcher → surface status)
      if STATUS == "IDLE" and CHECKLIST[$sid] == unchecked:
        RESULT=$(cmux read-screen --surface surface:$sid --lines 30)
        # "DONE:" 키워드 존재 확인
        if RESULT contains "DONE:":
          CHECKLIST[$sid] = ✅ (성공)
        elif RESULT contains "error|Error|ERROR|timeout|TIMEOUT|1008|429|529":
          CHECKLIST[$sid] = ❌ (에러) → 에러 분류 후 재배정 또는 스킵
        else:
          # IDLE이지만 DONE 없음 → 작업 미실행 또는 멈춤
          CHECKLIST[$sid] = ⚠️ (확인 필요) → read-screen으로 상세 확인
        fi
      fi
    done
    ```

  4-3. 에러 감지 시 즉시 대응 (MANDATORY)
    | 에러 유형 | 감지 키워드 | 대응 |
    |----------|-----------|------|
    | API 타임아웃 | `timeout`, `TIMEOUT`, `API_TIMEOUT_MS` | 작업 축소 후 재배정 |
    | 잔액 부족 | `1008`, `insufficient_balance` | 해당 AI 스킵, 다른 surface에 재배정 |
    | 권한 거부 | `Operation not permitted`, `sandbox` | 해당 AI에서 실행 불가 → Main 직접 처리 |
    | 컨텍스트 초과 | `context`, `exceed`, `too long` | /new 또는 /clear → 작업 분할 재배정 |
    | 완전 멈춤 | 60초+ IDLE but no DONE | read-screen → 원인 파악 → 재배정 |

  4-4. 전체 수집 완료 확인 (**HARD GATE 0** — 이 단계 통과 전 Step 5/결론/구현/종합 **절대 진행 금지**)

    **HARD BLOCK 규칙 (예외 없음):**
    - 디스패치한 모든 surface에서 `DONE:` 키워드가 확인되기 전까지 다음 단계 진행 불가
    - "이미 충분한 데이터" 합리화 금지 → 모든 surface 결과가 필요함
    - "나머지는 안 중요하다" 합리화 금지 → 디스패치했으면 수집해야 함

    **수집 절차:**
    ```
    dispatched = [surface:1, surface:2, ...]  # 디스패치한 surface 목록 유지
    CHECKLIST = {}
    for attempt in range(5):  # 최대 5회 polling (60초 간격)
        for sid in dispatched:
            screen = cmux read-screen --surface {sid} --scrollback --lines 80
            if "DONE:" in screen:
                CHECKLIST[sid] = "✅"
            elif ERROR_PATTERN in screen:
                CHECKLIST[sid] = "❌-error"
                → 다른 surface에 재배정 또는 Main 직접 처리
            else:
                CHECKLIST[sid] = "⏳-waiting"

        ALL_DONE = all(v != "⏳-waiting" for v in CHECKLIST.values())
        if ALL_DONE: break

        pending = [sid for sid, v in CHECKLIST.items() if v == "⏳-waiting"]
        log(f"⏳ {len(pending)}개 surface 대기 중: {pending}")
        sleep(60)

    # 5회 polling 후에도 미완료
    for sid, v in CHECKLIST.items():
        if v == "⏳-waiting":
            CHECKLIST[sid] = "⚠️-STALLED"
            → read-screen으로 원인 파악
            → 응답 없으면 다른 surface에 재배정
            → 또는 사용자에게 보고: "surface:N이 응답하지 않습니다"

    # 최종 검증
    assert all(v in ["✅", "❌-handled"] for v in CHECKLIST.values()), \
        "HARD GATE 0 위반: 미수집 surface 존재"
    ```

    **위반 방지 자가 체크:**
    - 결론/종합/분석 보고서 작성하기 전 → "모든 surface DONE 확인했나?" 자문
    - 구현 시작하기 전 → "수집 CHECKLIST 모두 ✅인가?" 자문
    - 위반 감지 시 → 즉시 중단 + "아직 N개 surface 결과 미수집" 보고

  4-5. 수집 완료 후 즉시 코드 리뷰
    성공(✅)인 surface 결과에 대해:
    - Agent(subagent_type="code-reviewer", model="sonnet") 백그라운드 디스패치
    - APPROVE → Step 5 (커밋)
    - REJECT → 해당 surface에 수정 요청 재전송

  **cmux 공식 기능 활용:**
  - `cmux wait-for <name> --timeout <sec>` — 동기화 토큰 대기 (surface가 신호 가능한 경우)
  - `cmux read-screen --lines N` — 화면 내용 직접 확인 (가장 확실한 방법)
  - `cmux surface-health` — surface 건강 상태 일괄 확인
  - eagle_watcher.sh — 20초 폴링 + WAITING/ERROR 감지
```

### 연구 결과→태스크 변환 예시

```
# 연구 JSON 수집 후 변환 흐름:

1. 연구 결과 읽기
   cat /tmp/search-s1/refined.json | python3 -m json.tool

2. 핵심 인사이트 추출
   - key_insights 필드 확인
   - deduped_sources에서 관련 논문/코드 확인

3. 인사이트 → 태스크 변환
   예: "ending_unique_ratio가 긴 텍스트에서 왜곡" 발견
   → Task: "humanization_engine.py ending_unique_ratio를 로그 스케일로 수정"
   → 난이도: 중급 → surface:2 (GLM)
   → 파일: scripts/humanization_engine.py

4. Skill("speckit-tasks")로 정형화 또는 직접 작업 큐 생성
```

Speckit 없으면:
```
Skill("writing-plans") → 단계별 계획서 (있으면)
  ↓ 없으면
Main이 직접:
  1. 작업 범위 파악
  2. 독립 태스크 분해
  3. 난이도별 surface 배정
  4. 작업 큐 생성
```

**단순 작업 (파일 1개 수정 등):** 파이프라인 스킵, 바로 작업 큐 생성

**작업 크기 최소 기준 (CRITICAL):**
- 함수 1개 같은 초소형 작업 금지 → **최소 파일 1개 전체 또는 기능 1개 완성**
- 각 AI에 **10분+ 분량** 배정 (1분짜리 작업 금지)
- 좋은 예: "이 스크립트 읽고 3가지 기능 전부 추가 + 테스트 작성해"
- 나쁜 예: "이 함수 하나만 추가해"
- Codex에게: 파일 분석 + 여러 함수 + 테스트를 한 묶음으로
- Gemini에게: 조사 + 레퍼런스 생성 + 분석 보고서를 한 묶음으로
- GLM에게: 독립 파일 생성 (레퍼런스, 설정, 스크립트) 한 묶음으로

전체 작업을 분해하고 **작업 큐**를 만든다:

```python
WORK_QUEUE = [
    {"id": 1, "task": "...", "target": "surface:1", "status": "pending"},
    {"id": 2, "task": "...", "target": "surface:2", "status": "pending"},
    {"id": 3, "task": "...", "target": "surface:3", "status": "pending"},
    {"id": 4, "task": "...", "target": "surface:5", "status": "pending"},
    {"id": 5, "task": "...", "target": "any", "status": "pending"},  # 다음 큐
    ...
]
```

### Phase 2: 초기 분배 (IDLE 확인 필수)

**⚠️ CRITICAL: 전송 전 반드시 IDLE 확인. WORKING 상태에서 전송하면 이전 작업이 날아감.**

```bash
# 1. IDLE 확인
screen=$(cmux read-screen --surface surface:1 --lines 3 2>&1)
# ❯, ›, > 가 보이면 IDLE → 전송 OK
# "Working", "thinking" 보이면 → 전송 금지, 대기

# 2. IDLE 확인 후에만 전송 (3초 간격)
cmux send --surface surface:1 "작업 1 프롬프트"
cmux send-key --surface surface:1 enter
sleep 3
cmux send --surface surface:2 "작업 2 프롬프트"
cmux send-key --surface surface:2 enter
# ...
```

**작업 큐 추적 (메모리 유지):**
- 전송한 작업은 큐에서 `in_progress`로 표시
- 날아간 작업(WORKING 중 덮어쓴 경우)은 `lost`로 표시 → 다음 IDLE 시 재위임
- 완료된 작업은 `done`으로 표시

### Phase 3: Persistent Watch + 즉시 재위임 루프

**메인의 20초 사이클 (eagle_watcher.sh 자동 갱신):**

```python
# 메인이 반복하는 루프 (20초 간격)
while work_queue_has_items:
    # 1. 상태 확인 (bash 1회, API 0원)
    status = bash("cat /tmp/cmux-eagle-status.json")

    # 2. IDLE surface 발견?
    idle_surfaces = status["idle_surfaces"]

    if idle_surfaces:
        # 3. git diff 확인 (이전 작업 결과물 있는지)
        for surface in idle_surfaces:
            diff = bash("git diff HEAD")
            if diff:
                # 4. cmuxreview에 리뷰 요청 (Opus 1회)
                review = Agent("code-reviewer-pro", "review git diff")
                if review == "APPROVE":
                    commit()
                else:
                    fix_issues()

        # 5. cmuxeagle(haiku)로 다음 작업 전달
        Agent(model="haiku", name="cmuxeagle", prompt=f"""
          Read /tmp/cmux-eagle-status.json.
          IDLE surfaces: {idle_surfaces}
          Send these tasks via cmux send:
          {next_tasks_from_queue}
        """)

    # 6. 메인은 코드리뷰/설계 작업 진행 (대기 X)
    do_code_review_or_planning()

    # 7. 20초 후 다시 상태 확인 (eagle_watcher.sh가 자동 갱신)
```

**핵심: 메인이 절대 "가만히 대기"하지 않음. 상태 확인 → 리뷰 → 전달 → 다른 작업 → 반복.**

### Phase 4: 장애 대응 (설정 파일 연동)

eagle가 ERROR 보고하면 `${SKILL_DIR}/config/orchestra-config.json`에서 해당 AI의 종료/시작 명령 조회:

| 에러 | 자동 해결 |
|------|----------|
| Context limit | config.quit_cmd → config.start_cmd → 작업 재위임 |
| Model not exist | `/model sonnet` 시도 → 실패 시 quit+restart |
| Rate limit | 큐에서 제외, 30분 후 재시도 |
| 무응답 1분+ | config.quit_cmd → config.start_cmd |
| 529 Overloaded | Circuit Breaker 발동 → cmux send만 사용 |

```bash
# 설정 파일 + 프리셋 기반 자동 복구
CONFIG="${SKILL_DIR}/config/orchestra-config.json"
SID="3"  # 에러 발생 surface

# 설정에서 명령어 조회
QUIT_CMD=$(python3 -c "import json;print(json.load(open('$CONFIG'))['surfaces']['$SID']['quit_cmd'])")
START_CMD=$(python3 -c "import json;print(json.load(open('$CONFIG'))['surfaces']['$SID']['start_cmd'])")
RESET_CMD=$(python3 -c "import json;print(json.load(open('$CONFIG'))['surfaces']['$SID']['reset_cmd'])")

# 상황별 복구:
# 컨텍스트 초과 → reset (세션 유지, 컨텍스트만 초기화)
cmux send --surface surface:$SID "$RESET_CMD"
cmux send-key --surface surface:$SID enter
sleep 3

# 완전 장애 → quit + restart (터미널 재시작)
cmux send --surface surface:$SID "$QUIT_CMD"
cmux send-key --surface surface:$SID enter
sleep 3
cmux send --surface surface:$SID "$START_CMD"
cmux send-key --surface surface:$SID enter
sleep 5
```

**복구 전략 선택:**

| 에러 | 사용 명령 | 이유 |
|------|----------|------|
| 컨텍스트 초과 | `reset_cmd` (/new, /clear) | 세션 유지, 컨텍스트만 초기화 |
| 모델 에러 | `reset_cmd` → 재시도 | 보통 일시적 |
| 완전 멈춤 | `quit_cmd` → `start_cmd` | 터미널 재시작 |
| 529/Rate limit | 대기 후 `reset_cmd` | 쿨다운 후 재시도 |

**에러 복구 순서:**
1. eagle 또는 idle-reminder가 ERROR 감지
2. `${SKILL_DIR}/config/orchestra-config.json`에서 quit_cmd/start_cmd 조회
3. 자동 종료 → 대기 → 재시작
4. 작업 큐에서 해당 surface의 미완료 작업 재위임

## cmux 명령어 전체 레퍼런스 (오케스트레이션 관련)

### 기본 명령 (필수)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux tree --all` | surface 구조 | 전체 구조 파악 |
| `cmux identify` | 현재 위치 | 내가 어느 surface인지 |
| `cmux send --surface surface:N "text"` | 텍스트 전송 | 작업 지시 |
| `cmux send-key --surface surface:N enter` | Enter 키 | 전송 확인 |
| `cmux read-screen --surface surface:N --lines N` | 화면 읽기 | 결과 확인 |
| `cmux capture-pane --surface surface:N --lines N` | tmux 호환 캡처 | read-screen 대체 |
| `cmux notify --title "t" --body "b"` | 알림 | 완료 알림 |

### 상태 관리 (v4.1 신규)

| 명령 | 용도 | 오케스트레이션 활용 |
|------|------|-------------------|
| `cmux surface-health` | surface 건강 상태 | eagle 감시에 통합 가능 |
| `cmux set-status "task" "building auth"` | 사이드바 상태 표시 | 현재 작업 표시 |
| `cmux clear-status "task"` | 상태 초기화 | 작업 완료 시 |
| `cmux list-status` | 현재 상태 목록 | 전체 진행 현황 |
| `cmux set-progress 0.75 --label "3/4 done"` | 프로그레스 바 | 작업 큐 진행률 |
| `cmux clear-progress` | 프로그레스 초기화 | 작업 완료 |

### 로깅 (v4.1 신규)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux log --level info --source eagle "IDLE: surface:3"` | 이벤트 기록 | 오케스트레이션 로그 |
| `cmux list-log --limit 20` | 최근 로그 | 작업 이력 확인 |
| `cmux clear-log` | 로그 초기화 | 세션 시작 시 |

### 동기화 (v4.1 신규)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux wait-for --signal "task-done" --timeout 60` | 시그널 대기 | surface 간 동기화 |
| `cmux wait-for -S "task-done"` | 시그널 발신 | 작업 완료 알림 |

### 복구 (v4.1 신규)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux respawn-pane --surface surface:N` | surface 재시작 | 크래시 복구 |
| `cmux close-surface --surface surface:N` | surface 종료 | 장애 surface 제거 |
| `cmux new-surface --pane pane:N` | 새 surface 생성 | 동적 워커 추가 |

### 검색 (v4.1 신규)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux find-window --content "DONE:"` | 내용 검색 | 완료 메시지 탐색 |
| `cmux find-window --select "error"` | 검색+포커스 | 에러 surface로 이동 |

### Claude 세션 감지 (v4.2 신규 — 핵심!)

| 명령 | 용도 | 오케스트레이션 활용 |
|------|------|-------------------|
| `echo '{}' \| cmux claude-hook session-start` | Claude 세션 시작 알림 | 워커 활성화 감지 |
| `echo '{}' \| cmux claude-hook stop` | Claude 세션 종료 알림 | **완료 감지 — eagle보다 정확** |
| `echo '{}' \| cmux claude-hook idle` | Claude IDLE 알림 | 유휴 감지 |
| `echo '{}' \| cmux claude-hook notification` | 알림 전달 | 에러/완료 이벤트 전달 |
| `echo '{}' \| cmux claude-hook prompt-submit` | 프롬프트 제출 | 작업 시작 감지 |

> **claude-hook은 Claude Code가 자동 호출하는 것이지 우리가 호출하는 것이 아님.**
> 우리는 `set-hook`으로 이 이벤트에 반응하는 핸들러를 등록할 수 있음.

### 이벤트 훅 (v4.2 신규)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux set-hook <event> <command>` | 이벤트 핸들러 등록 | 자동 완료 감지 |
| `cmux set-hook --list` | 등록된 훅 목록 | 현재 훅 확인 |
| `cmux set-hook --unset <event>` | 훅 제거 | 훅 해제 |

### 출력 파이프 (v4.2 신규 — 자동 로그 수집)

| 명령 | 용도 | 오케스트레이션 활용 |
|------|------|-------------------|
| `cmux pipe-pane --surface surface:N --command "tee /tmp/s1.log"` | surface 출력을 파일로 | **자동 로그 수집 (eagle 대체 가능)** |
| `cmux pipe-pane --surface surface:N --command "grep DONE:"` | 완료 메시지만 필터 | 완료 자동 감지 |

### 버퍼 (v4.2 신규 — 큰 텍스트 전송)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux set-buffer --name task1 "긴 프롬프트..."` | 버퍼에 텍스트 저장 | 200자+ 프롬프트 준비 |
| `cmux paste-buffer --name task1 --surface surface:N` | 버퍼 붙여넣기 | 긴 프롬프트 한 번에 전송 |
| `cmux list-buffers` | 버퍼 목록 | 준비된 작업 확인 |

### Panel 전송 (v4.2 신규)

| 명령 | 용도 | 예시 |
|------|------|------|
| `cmux send-panel --panel surface:N "text"` | panel에 텍스트 전송 | surface ref로 panel 지정 |
| `cmux send-key-panel --panel surface:N enter` | panel에 키 전송 | Enter 실행 |
| `cmux list-panels` | panel 목록 + 이름 | 현재 panel 확인 |

### Workspace/Pane 관리 (v4.2 신규)

| 명령 | 용도 | 오케스트레이션 활용 |
|------|------|-------------------|
| `cmux new-pane --type terminal` | 새 pane 생성 | 동적 워커 추가 |
| `cmux new-split right` | 오른쪽 분할 | 새 작업 영역 |
| `cmux new-workspace --command "claude"` | 새 workspace + 명령 실행 | 새 Claude 세션 시작 |
| `cmux close-workspace --workspace workspace:N` | workspace 종료 | 불필요 워커 제거 |
| `cmux select-workspace --workspace workspace:N` | workspace 전환 | 다른 workspace로 이동 |
| `cmux list-panes` | pane 목록 | 현재 레이아웃 확인 |
| `cmux list-workspaces` | workspace 목록 | 전체 환경 파악 |

### 연결/정보 (v4.2 신규)

| 명령 | 용도 |
|------|------|
| `cmux ping` | 소켓 연결 확인 |
| `cmux capabilities` | 지원 기능 JSON |
| `cmux version` | 버전 확인 |
| `cmux current-workspace` | 현재 workspace |
| `cmux sidebar-state` | 사이드바 상태 |
| `cmux display-message -p "text"` | 사용자에게 메시지 표시 |
| `cmux refresh-surfaces` | surface 상태 강제 갱신 |
| `cmux list-notifications` | 알림 목록 확인 |
| `cmux clear-notifications` | 알림 정리 |
| `cmux claude-teams` | Claude Teams 모드 연동 |

### 레이아웃 (참고)

| 명령 | 용도 |
|------|------|
| `cmux resize-pane --pane pane:N -R --amount 20` | pane 크기 조절 |
| `cmux swap-pane --pane pane:N --target-pane pane:M` | pane 교체 |
| `cmux break-pane --surface surface:N` | pane에서 분리 |
| `cmux join-pane --target-pane pane:N` | pane 합치기 |
| `cmux move-surface --surface surface:N --pane pane:M` | surface 이동 |
| `cmux rename-tab --surface surface:N "이름"` | 탭 이름 변경 |
| `cmux rename-workspace "이름"` | workspace 이름 변경 |

### 브라우저 (⚠️ --surface 필수, 테스트 검증 완료)

> 브라우저 명령은 `--surface surface:N` 지정 필수. `cmux browser open` 시 새 surface 생성됨.

```bash
# 사용 패턴
cmux browser open "https://example.com"                    # → surface:N 생성됨
cmux browser --surface surface:N snapshot                  # 접근성 트리 (DOM 구조)
cmux browser --surface surface:N get-url                   # 현재 URL
cmux browser --surface surface:N goto "https://github.com" # 네비게이션
cmux browser --surface surface:N screenshot --out /tmp/s.png  # 스크린샷
cmux browser --surface surface:N click "[ref=e1]"          # 요소 클릭 (snapshot의 ref 사용)
cmux browser --surface surface:N type "[ref=e5]" "text"    # 텍스트 입력
cmux browser --surface surface:N fill "[ref=e5]" "text"    # 필드 채우기
cmux browser --surface surface:N wait --selector "h1"      # 요소 대기
cmux close-surface --surface surface:N                     # 브라우저 닫기
```

| 명령 | 테스트 결과 | 주의사항 |
|------|-----------|---------|
| `browser open <url>` | ✅ 작동 | 새 surface 번호 반환 |
| `browser goto <url>` | ✅ 작동 | 이미 열린 브라우저에서 |
| `browser snapshot` | ✅ 작동 | 접근성 트리 반환 (`[ref=eN]`) |
| `browser screenshot` | ✅ 작동 | `--out` 필수 |
| `browser get-url` | ✅ 작동 | |
| `browser click` | ⚠️ 불안정 | 페이지 로드 후 snapshot 다시 해야 ref 유효 |
| `browser eval` | ⚠️ 문법 민감 | 에러 발생 빈번, snapshot+click 우선 |

**오케스트레이션 활용 예:**
```bash
# 1. 문서 조회 → 내용 추출
cmux browser open "https://docs.example.com/api"
# → surface:N 반환
cmux browser --surface surface:N snapshot  # DOM 읽기
cmux close-surface --surface surface:N     # 완료 후 닫기
```

---

<!-- LAZY: 아래는 오케스트레이션에서 직접 사용하지 않는 UI/시스템 명령어. 필요 시 참조. -->

### UI/시스템 명령어 (오케스트레이션 미사용 — 참조용)

| 명령 | 용도 |
|------|------|
| `cmux bind-key <key> <command>` | 키 바인딩 등록 |
| `cmux unbind-key <key>` | 키 바인딩 해제 |
| `cmux clear-history --surface surface:N` | 스크롤백 히스토리 삭제 |
| `cmux close-window --window window:N` | window 닫기 |
| `cmux current-window` | 현재 window 확인 |
| `cmux display-message [-p] "text"` | 상태 바 메시지 표시 |
| `cmux drag-surface-to-split --surface surface:N <방향>` | surface 드래그 분할 |
| `cmux feedback --body "text"` | cmux 피드백 전송 |
| `cmux focus-pane --pane pane:N` | pane 포커스 |
| `cmux focus-panel --panel surface:N` | panel 포커스 |
| `cmux focus-window --window window:N` | window 포커스 |
| `cmux help` | 도움말 |
| `cmux last-pane` | 마지막 pane으로 전환 |
| `cmux list-pane-surfaces --pane pane:N` | pane 내 surface 목록 |
| `cmux list-windows` | window 목록 |
| `cmux markdown <path>` | 마크다운 뷰어 열기 |
| `cmux move-workspace-to-window --workspace ws:N --window win:M` | workspace 이동 |
| `cmux move-surface --surface surface:N --pane pane:M` | surface 이동 |
| `cmux new-window` | 새 window 생성 |
| `cmux next-window` / `cmux previous-window` | window 전환 |
| `cmux popup` | 팝업 열기 |
| `cmux rename-window "name"` | window 이름 변경 |
| `cmux reorder-surface --surface surface:N --index N` | surface 순서 변경 |
| `cmux reorder-workspace --workspace ws:N --index N` | workspace 순서 변경 |
| `cmux set-app-focus <active\|inactive\|clear>` | 앱 포커스 상태 설정 |
| `cmux shortcuts` | 단축키 목록 표시 |
| `cmux simulate-app-active` | 앱 활성화 시뮬레이션 |
| `cmux tab-action --action <name> --tab tab:N` | 탭 액션 실행 |
| `cmux themes [list\|set\|clear]` | 테마 관리 |
| `cmux trigger-flash --surface surface:N` | 플래시 효과 |
| `cmux welcome` | 웰컴 메시지 표시 |
| `cmux workspace-action --action <name>` | workspace 액션 실행 |
| `cmux copy-mode` | 복사 모드 진입 |

## 완주 보장 사이클 (v6 핵심 — MANDATORY)

> **이 사이클이 cmux-orchestrator의 존재 이유다.**
> 조사만 하고 멈추면 cmux를 쓰는 의미가 없다.

### 전체 사이클

```
사용자 요청 수신
  ↓
Phase -1: 온보딩 (설정 파일 확인)
  ↓
Phase 0: eagle 부트 + surface 확인
  ↓
Phase 1: 작업 분해 + 작업 큐 생성
  ↓
Phase 2: cmux send로 각 surface에 배포
  ├── surface:1 → 조사 A (search_executor.py)
  ├── surface:3 → 조사 B
  └── surface:5 → 조사 C
  ↓ (eagle로 완료 감지)
Phase 3: 결과 수집 (cat /tmp/search-orchestration/refined.json)
  ↓
Phase 4: Main이 결과 취합 + 구현 계획
  ↓
Phase 5: 구현 (Main 직접 + 병렬 가능한 것은 cmux 위임)
  ├── Main: 핵심 로직 직접 구현
  ├── surface:3 → 보조 구현 (테스트 작성 등)
  └── surface:5 → 문서 업데이트
  ↓
Phase 6: 테스트 + 코드리뷰 (cmuxreview Sonnet)
  ↓
Phase 7: 커밋
  ↓
사용자에게 완료 보고
```

### 금지: 중간에 멈추는 행위

| 멈추는 지점 | 왜 안 되는가 |
|------------|------------|
| 조사 배포 후 | 결과 수집 + 구현까지 해야 완주 |
| 결과 취합 후 | 구현 계획 + 코드 작성까지 해야 완주 |
| 구현 후 | 테스트 + 커밋까지 해야 완주 |
| "별도 세션에서" | cmux가 있으므로 이유 없음 |

### 컨텍스트 부족 시 대응

**Main(Opus):**

| 상황 | 행동 |
|------|------|
| 컨텍스트 70%+ | /compact 실행 후 계속 |
| 컨텍스트 90%+ | 핸드오프 파일 생성 → smart-handoff 스킬 |

**cmux AI들 (맥락 불필요 — 매번 초기화해도 됨):**

| 상황 | 행동 |
|------|------|
| 작업 전 | reset_cmd로 컨텍스트 초기화 후 깨끗한 상태에서 작업 시작 |
| 컨텍스트 초과 | reset_cmd 실행 → 재위임 (이전 맥락 불필요) |
| 오래 사용한 surface | 주기적으로 /new 또는 /clear → 성능 유지 |

```bash
# cmux AI는 맥락 없이 작동 — 프롬프트 하나로 완결
cmux send --surface surface:3 "/new"  # Codex 컨텍스트 초기화
cmux send-key --surface surface:3 enter
sleep 2
cmux send --surface surface:3 "TASK: ~/path/file.py 읽고 함수 추가해. git commit 금지."
cmux send-key --surface surface:3 enter
```

> **핵심**: cmux AI들은 "부하"이므로 맥락 유지가 필요 없다.
> 매번 reset → 새 프롬프트 → 결과 수집. 이것이 가장 안정적.

## Hook 시스템 — 6개 자동 연동 (settings.json 등록 완료)

| Hook | 이벤트 | 스크립트 | 역할 |
|------|--------|---------|------|
| **SessionStart** | 세션 시작 | cmux-orchestra-enforcer.sh | 설정 파일 확인 → 온보딩 질문 |
| **SessionStart** | 세션 시작 | cmux-claude-bridge.sh session-start | cmux 사이드바 "Running" 표시 |
| **UserPromptSubmit** | 매 메시지 | cmux-idle-reminder.sh | IDLE surface 자동 알림 |
| **Stop** | 세션 종료 | cmux-claude-bridge.sh stop | cmux 사이드바 "Idle" 표시 |
| **PostToolUse** | 도구 사용 후 | cmux-claude-bridge.sh post-tool | Agent 완료 시 cmux 알림 |
| **Notification** | 알림 | cmux-claude-bridge.sh notification | cmux 알림 패널 전달 |

### 스크립트 위치

```
skills/cmux-orchestrator/
├── SKILL.md                    # 이 파일
├── config/
│   └── orchestra-config.json   # 영속 설정 (surface→AI 매핑, 프리셋)
└── scripts/
    ├── eagle_watcher.sh        # 20초 자동 폴링 (bash, API 0원)
    ├── cmux-claude-bridge.sh   # Claude Code ↔ cmux 브릿지
    └── detect_surfaces.py      # 동적 surface 감지

hooks/ (settings.json 등록):
├── cmux-orchestra-enforcer.sh  # SessionStart 온보딩
└── cmux-idle-reminder.sh       # UserPromptSubmit IDLE 알림
```

## 실전 패턴 (테스트 검증 완료)

### 병렬 검색 배포 (search_executor.py)

```bash
# search_executor.py CLI 인터페이스:
#   --query QUERY     검색 쿼리
#   --outdir OUTDIR   출력 디렉토리 (기본: /tmp/search-orchestration/)
#   --full            전체 파이프라인 (검색 + PKM + 추출 + 정제)
#   --refine-only     기존 combined_raw.json만 정제
#   --no-extract      URL 추출 건너뛰기
#   --no-refine       LLM 정제 건너뛰기
#   --refine-method {auto,llm,python}  정제 방법

# ⚠️ 병렬 실행 시 --outdir로 출력 경로를 분리해야 함!
# 같은 outdir 사용 시 마지막 surface의 결과만 남음

# surface:1 → 도서 출판 조사
cmux send --surface surface:1 "python3 50_AutomationCode/search/search_executor.py --query 'AI book authoring' --full --outdir /tmp/search-s1 2>&1 | tail -5"
cmux send-key --surface surface:1 enter

# surface:3 → 한국어 NLP 조사 (다른 출력 경로)
cmux send --surface surface:3 "python3 50_AutomationCode/search/search_executor.py --query 'Korean NLP spell check' --full --outdir /tmp/search-s3 2>&1 | tail -5"
cmux send-key --surface surface:3 enter

# 결과 수집: 각각 /tmp/search-s1/refined.json, /tmp/search-s3/refined.json
```

> **주의**: `--output` 플래그는 존재하지 않음. 반드시 `--outdir`을 사용.
> 상대 경로 `50_AutomationCode/search/search_executor.py` 사용 (작업 디렉토리가 $AI_ROOT/System 기준).

### 긴 프롬프트 전송 (200자+)
```bash
# send는 200자+ 시 불안정 → set-buffer + paste-buffer 사용
cmux set-buffer --name task1 -- "TASK: 이 파일을 읽고 함수 3개 추가해. ..."
cmux paste-buffer --name task1 --surface surface:N
cmux send-key --surface surface:N enter
```

### 자동 완료 감지 (pipe-pane)
```bash
# surface 출력에서 DONE: 패턴 감시 → 파일로 저장
cmux pipe-pane --surface surface:1 --command "grep -m1 DONE: > /tmp/surface1_done.txt"
# 나중에 확인
[ -s /tmp/surface1_done.txt ] && echo "완료!" || echo "진행중"
```

### 브라우저로 문서 조회
```bash
# 1. 브라우저 열기
cmux browser open "https://docs.example.com"
# → surface:N 반환 (기억)
# 2. 내용 읽기
cmux browser --surface surface:N snapshot
# 3. 필요한 정보 추출 후 닫기
cmux close-surface --surface surface:N
```

### 동적 워커 추가/제거
```bash
# 새 워커 추가
cmux new-split right
# → surface:N, pane:M 반환
# 새 Claude Code 실행
cmux send --surface surface:N "claude --name worker-1"
cmux send-key --surface surface:N enter
# 작업 완료 후 제거
cmux close-surface --surface surface:N
```

## 프롬프트 규칙 (cmux send 시)

1. **경로는 `~`로 시작** 또는 상대경로 (`/`는 슬래시 커맨드로 인식됨)
2. **GLM은 짧게** (200자 이내, 긴 파일 읽기 피하기)
3. **Codex/Gemini는 길어도 OK** (복합 작업 한 번에)
4. **`git commit 금지`** 항상 포함
5. **결과물 범위 명확히** (함수 추가, 파일 생성 등)
6. **LSP/플러그인 질문 방지**: 프롬프트 마지막에 "LSP 설치 질문 나오면 No 선택해" 추가

## 오케스트레이션 패턴 (외부 조사 반영)

### Fan-out/Fan-in 패턴
```
Main (Opus)
  ├── cmuxplanner: 태스크 분해 (fan-out 준비)
  ├── cmux send → surface:1 (GLM1)    ─┐
  ├── cmux send → surface:2 (GLM2)     │ fan-out
  ├── cmux send → surface:3 (Codex)    │ (병렬 실행)
  └── cmux send → surface:5 (Gemini)  ─┘
                                        │
  cmuxeagle: 완료 감지 ────────────────┘
                                        │
  cmuxreview: 코드 리뷰 (fan-in 전 검증)│
  cmuxdiagnostic: 테스트 실행           │
  cmuxgit: 커밋/푸시 (fan-in 완료)     ─┘
```

### 동적 라우팅 기준 (AI별 강점)
| AI | 최적 작업 | 비최적 작업 |
|----|----------|-----------|
| **Codex** | 복잡한 로직, 멀티파일, 테스트, 리뷰 | 단순 설정, 짧은 파일 |
| **Gemini** | 조사, 분석, 문서 생성, 긴 레퍼런스 | 복잡한 코딩 |
| **GLM** | 짧은 파일 수정, 설정, 간단한 함수 | 긴 파일 읽기, 복잡한 로직 |

### 상태 격리 원칙
- **1 파일 = 1 AI** (절대 충돌 금지)
- **git diff로 반드시 변경 확인** 후 커밋
- **LSP/플러그인 질문에 자동 No** (작업 멈춤 방지)

## cmux 설정 가이드 (공식 문서 기반)

### Automation Mode (⚠️ 필수 확인)

cmux Settings > Automation Mode:

| 모드 | 설명 | 우리 환경 |
|------|------|----------|
| `Off` | 소켓 비활성화, CLI 불가 | ❌ 사용 금지 |
| `cmux processes only` | **기본값**, cmux 내부 프로세스만 | ✅ 현재 설정 |
| `allowAll` | 모든 로컬 프로세스 허용 | 외부 스크립트 필요 시 |

> **⚠️ 기본값이 `cmux processes only`이므로:**
> - `nohup`으로 외부에서 실행한 스크립트는 cmux 명령 사용 불가
> - eagle_watcher.sh는 반드시 **cmux 내부 쉘**에서 실행
> - 환경변수 `CMUX_SOCKET_MODE=allowAll`로 외부 접근 허용 가능

### 공식 Claude Code 훅 설정

cmux 공식 문서의 Claude Code 연동 스크립트:

```bash
# ~/.claude/hooks/cmux-notify.sh (공식 권장)
#!/bin/bash
[ -S "$CMUX_SOCKET_PATH" ] || exit 0
EVENT=$(cat)
EVENT_TYPE=$(echo "$EVENT" | jq -r '.hook_event_name // "unknown"')
TOOL=$(echo "$EVENT" | jq -r '.tool_name // ""')

case "$EVENT_TYPE" in
  "Stop")
    cmux notify --title "Claude Code" --body "Session complete"
    ;;
  "PostToolUse")
    [ "$TOOL" = "Task" ] && cmux notify --title "Claude Code" --body "Agent finished"
    ;;
esac
```

### 자동 기능 (cmux가 자동 처리)

| 기능 | 방식 | 설정 필요 |
|------|------|----------|
| CWD 추적 | 쉘 통합 (`_cmux_precmd`) | ❌ 자동 |
| Git 브랜치/dirty 상태 | 쉘 통합 (HEAD 파일 감시) | ❌ 자동 |
| PR 상태 폴링 | `gh pr view` 45초 간격 | ❌ 자동 (gh 설치 시) |
| 포트 스캔 | `ports_kick` | ❌ 자동 |
| 세션 복원 | 레이아웃/CWD/스크롤백 | ❌ 자동 |
| 자동 업데이트 | Sparkle | ❌ 자동 |

### 수동 설정 필요

| 기능 | 설정 방법 |
|------|----------|
| Claude 세션 알림 | Claude Code hooks에 `cmux notify` 등록 (우리: cmux-claude-bridge.sh) |
| 사이드바 상태 | `cmux set-status` 호출 (우리: eagle_watcher.sh) |
| 프로그레스 바 | `cmux set-progress` 호출 (우리: eagle_watcher.sh) |
| 커스텀 알림음 | Settings > App > Notification Command에 `say` 또는 `afplay` 설정 |
| 출력 파이프 | `cmux pipe-pane` 명시적 호출 |

### 알림 단축키

| 단축키 | 기능 |
|--------|------|
| `⌘⇧I` | 알림 패널 열기 |
| `⌘⇧U` | 최근 읽지 않은 알림으로 점프 |
| `⌘N` | 새 workspace |
| `⌘D` | 오른쪽 분할 |
| `⌘⇧D` | 아래 분할 |
| `⌘B` | 사이드바 토글 |
| `⌘⇧L` | 브라우저 분할 열기 |

## Hook 강제성 (2-Layer 자동 감지)

### Layer 1: SessionStart — 초기 부트

세션 시작 시 cmux 환경 + surface 2개+ 감지 → 오케스트레이션 모드 활성화.

```bash
# cmux-orchestra-enforcer.sh (SessionStart)
# → [CMUX-ORCHESTRA] 메시지 주입
```

### Layer 2: UserPromptSubmit — 매 메시지 IDLE 알림 (v4.2 신규)

**사용자가 별도로 말하지 않아도** 매 메시지마다 IDLE surface 감지 → AI에게 알림.

```bash
# cmux-idle-reminder.sh (UserPromptSubmit)
# → eagle_watcher.sh --once 실행 (bash, API 0원)
# → IDLE surface 있으면: [CMUX-IDLE] 3개 surface IDLE 감지
# → AI가 자동으로 병렬 작업 위임 판단
```

**이것이 "별도 말하지 않아도 자동 작동"의 핵심:**
- 사용자가 "cmux 써" 안 해도 매번 IDLE 알림 받음
- AI가 현재 작업에서 병렬 가능한 부분 판단 → cmux send 위임
- API 비용 0원 (eagle_watcher.sh는 순수 bash)

## 금지사항

### 절대 금지 (위반 시 사용자 화남)
❌ **"별도 세션에서 진행"** — cmux가 있으므로 이유 없음. 즉시 완주.
❌ **"나중에 구현"** — 조사 결과 있으면 바로 구현.
❌ **놀고 있는 AI 방치** — eagle이 IDLE 감지하면 즉시 작업 전달.
❌ **"붙여넣어주세요"** — cmux send로 직접 전송.

### 기술적 금지
❌ Codex MCP 직접 호출 — cmux send로 Codex 창에 전송
❌ cmuxreview에 Opus 사용 — Sonnet만 (529 방지, 계정 통합 rate limit)
❌ 서브에이전트 3개+ 동시 — Circuit Breaker 발동
❌ 조사 요청 시 raw search-worker 직접 디스패치 — Skill("search-orchestration") 경유
❌ 장애 AI 방치 — 설정 파일의 quit_cmd/start_cmd로 즉시 복구
❌ 작업 큐 소진 후 멈춤 — 새 작업 큐 생성하고 계속

## 자동 트리거

1. `$CMUX_WORKSPACE_ID` 존재 + surface 2개+
2. 사용자가 "병렬", "동시에", "부하", "cmux" 키워드
3. Agent Team Forge 트리거 시 cmux도 동시 활용
4. SessionStart hook이 additionalContext 주입
