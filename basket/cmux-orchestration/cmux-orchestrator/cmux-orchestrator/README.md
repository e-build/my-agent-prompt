# cmux Multi-AI Orchestrator

> cmux 터미널 멀티플렉서를 활용한 멀티 AI 오케스트레이션 스킬.
> 여러 AI(Claude, OpenCode/GPT, Gemini, GLM, MiniMax)를 동시에 운영하여 작업을 병렬 처리합니다.

## 한줄 요약

Main(Opus)이 지휘관, 다른 AI 창들이 부하. 조사→분해→배정→수집→리뷰→커밋을 자동화합니다.

## 설치

```bash
# 원클릭 설치 (에이전트 + 훅 + 권한)
bash cmux-orchestrator/scripts/install_agents.sh --setup
```

설치 후 cmux에서 AI 창을 여러 개 열고, `/cmux` 명령어로 시작합니다.

## 사용법

### `/cmux` 슬래시 커맨드 (단일 진입점)

| 명령어 | 동작 |
|--------|------|
| `/cmux` | 전 surface 상태 확인 |
| `/cmux 다음 라운드` | 6-Step 프로토콜 자동 실행 |
| `/cmux 조사 한국어 NLP` | 전 AI에 조사 디스패치 |
| `/cmux 수집` | 결과 수집 + GATE 검증 |
| `/cmux 리뷰` | 서브에이전트 코드리뷰 |
| `/cmux 커밋` | GATE 통과 후 커밋 |
| `/cmux 초기화` | 설치 + 활성화 |
| `/cmux surface 3` | 특정 AI 화면 확인 |
| `/cmux gate` | 태스크 완결성 검증 |
| `/cmux 에러` | ERROR AI 감지 + 재배정 |

### 다음 라운드 프로토콜 (6-Step)

```
Step 0: cmux 기능 자동 활성화 (set-hook, surface-health, display-message)
Step 1: 조사 — 각 AI에 search_executor.py 디스패치
Step 1.5: speckit 태스크 분해 — Skill("speckit-tasks") 호출
Step 3: 배정 — AI별 능력 맞춤 번들 (OpenCode 3-5개, Gemini 2개 등)
Step 4: 수집 — GATE 1-5 검증 (WORKING 대기, DONE 확인)
Step 5: 커밋 — gate-blocker가 GATE 미통과 시 물리적 차단
Step 6: 자가개선 — 발견된 문제점 SKILL.md 반영
```

## AI별 역할

| AI | 모델 | 번들 크기 | 특기 |
|----|------|----------|------|
| **OpenCode** | GPT-5.4 | 3-5개 | 고난이도 코드, 대규모 구현 |
| **MiniMax** | M2.5 | 2-3개 | 코드 구현, 데이터 정제 |
| **GLM** | glm-4.7 | 2-3개 | 보조 구현, 조사 |
| **Gemini** | 3.1-pro | 2개 | 디자인 리뷰, UI/UX |
| **Main(Opus)** | claude-opus | - | 계획, 판단, 커밋 (코딩 금지) |

## 4중 강제 체계

| 계층 | 수단 | 강제력 |
|------|------|--------|
| **L0** | `gate-blocker.sh` (PreToolUse) | ⛔ git commit 물리적 차단 |
| **L1** | `eagle_watcher.sh` (cmux set-hook) | 자동 상태 감시 |
| **L2** | `gate-enforcer.py` (PostToolUse) | WORKING/ERROR 경고 |
| **L3** | SKILL.md 5-GATE | 텍스트 규칙 |

### 5-GATE 시스템

| GATE | 규칙 |
|------|------|
| GATE 1 | 모든 AI DONE 확인 전 종료 금지 (IDLE≠완료) |
| GATE 2 | Main 직접 코드리뷰 금지 → 서브에이전트 필수 |
| GATE 3 | Main은 계획+판단+커밋만 (코딩 위임) |
| GATE 5 | speckit 태스크 전체 완료 (미완료 → 재배정) |
| GATE 4 | GATE 1-5 통과 확인 체크리스트 |

## 파일 구조

```
cmux-orchestrator/
├── SKILL.md                      # 오케스트레이션 지침 (96KB)
├── README.md                     # 이 파일
├── commands/
│   └── cmux.md                   # /cmux 슬래시 커맨드
├── agents/
│   ├── cmux-reviewer.md          # 코드 리뷰 (Sonnet, 0스킬)
│   ├── cmux-git.md               # Git 작업 (haiku)
│   └── cmux-security.md          # 보안 검사 (Sonnet, 4스킬)
├── scripts/
│   ├── install_agents.sh         # --setup 원클릭 설치
│   ├── eagle_watcher.sh          # 4상태 감시 (WORKING/IDLE/WAITING/ERROR)
│   ├── gate-blocker.sh           # L0 물리적 차단 (PreToolUse)
│   ├── gate-enforcer.py          # L2 상태 경고 (PostToolUse)
│   ├── speckit-tracker.py        # 태스크 완결성 추적
│   ├── cmux-claude-bridge.sh     # Claude Code ↔ cmux 브릿지
│   ├── cmux-idle-reminder.sh     # IDLE surface 알림
│   ├── cmux-orchestra-enforcer.sh # 세션 시작 자동 활성화
│   └── detect_surfaces.py        # surface 자동 감지
└── config/
    └── orchestra-config.json     # AI 프리셋 + difficulty
```

## 전제 조건

- **cmux** 터미널 멀티플렉서 (cmux.dev)
- **Claude Code** CLI
- AI 터미널 창 2개 이상 (Codex, Gemini, OpenCode 등)

## cmux 공식 기능 활용

| 기능 | 자동 발동 시점 |
|------|--------------|
| `read-screen --scrollback` | 결과 수집, 에러 확인 |
| `surface-health` | 세션 시작, eagle |
| `trigger-flash` | ERROR/WAITING 감지 |
| `rename-tab` | 상태 갱신 |
| `display-message` | 라운드 시작/상태 |
| `set-hook after-send-keys` | eagle 자동 갱신 |
| `set-buffer + paste-buffer` | 긴 프롬프트 전송 |
| `send + send-key` | AI에 명령 전달 |
| `wait-for` | 동기화 토큰 |

## 이식성

- 하드코딩 경로: **0건** (`${SKILL_DIR}` 변수 사용)
- 다른 환경에서 `install_agents.sh --setup`으로 즉시 사용 가능
- settings.json 훅 자동 등록 포함
