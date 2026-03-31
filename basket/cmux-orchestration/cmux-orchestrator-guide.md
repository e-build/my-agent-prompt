# cmux-orchestrator — 멀티 AI 오케스트레이션 스킬

> **버전**: v6.1 (2026-03-18)
> **호환**: Claude Code v2.1+ / cmux CLI
> **파일 수**: 16개 (스킬 + 에이전트 + 스크립트 + Hook)

---

## 이게 뭐하는 건가요?

**cmux 터미널에서 여러 AI를 동시에 부려먹는** 오케스트레이션 스킬입니다.

- Claude (Opus)가 **지휘관**, 다른 AI(Codex, Gemini, GLM, MiniMax 등)가 **워커**
- 조사, 코딩, 리뷰를 병렬로 분배하고 결과를 수집
- GATE 시스템으로 **물리적 강제** — 미완료 상태에서 커밋 차단, 결과 수집 전 결론 금지

---

## 설치 (1분)

```bash
# zip 압축 해제 후
bash install.sh
```

설치 스크립트가 대화형으로:
1. cmux / python3 / Claude Code 전제 조건 확인
2. `~/.claude/skills/cmux-orchestrator/`에 16개 파일 복사
3. `~/.claude/agents/`에 에이전트 3개 설치
4. `~/.claude/settings.json`에 Hook 4개 자동 등록
5. 전체 설치 검증

### 설치 경로

| 대상 | 기본 경로 | 변경 가능 |
|------|----------|----------|
| 스킬 | `~/.claude/skills/cmux-orchestrator/` | 설치 시 질문 |
| 에이전트 | `~/.claude/agents/` | 고정 |
| Hook 설정 | `~/.claude/settings.json` | 자동 |

---

## 사용법

### 기본 명령어

```
/cmux              — 전체 surface 상태 확인
/cmux 조사 [주제]  — 모든 AI에 조사 분배
/cmux 배정 [작업]  — AI별 태스크 분해 + 배정
/cmux 수집         — 결과 수집 (GATE 0 검증)
/cmux 리뷰         — 코드 리뷰 (서브에이전트 자동)
/cmux 커밋         — 안전 커밋 (GATE 1-5 통과 필수)
```

### HARD GATE 시스템

| GATE | 규칙 | 강제 수단 |
|------|------|----------|
| **GATE 0** | 수집 완료 전 결론/구현 금지 | gate-enforcer.py 디스패치 레지스트리 |
| **GATE 1** | WORKING surface 있으면 커밋 금지 | gate-blocker.sh PreToolUse block |
| **GATE 2** | Main 직접 코드리뷰 금지 | 서브에이전트 강제 |
| **GATE 5** | 미완료 태스크 스킵 금지 | speckit-tracker.py |

### Eagle Watcher (자동 감시)

```bash
# 수동 실행
bash scripts/eagle_watcher.sh --once

# Hook으로 자동 실행 (설치 시 등록됨)
# SessionStart → cmux-orchestra-enforcer.sh
# PostToolUse → gate-enforcer.py
# PreToolUse → gate-blocker.sh (git commit 시)
```

---

## 포함된 파일 (16개)

### 에이전트 (3개)
| 파일 | 모델 | 역할 |
|------|------|------|
| `cmux-git.md` | Haiku | Git 커밋/푸시 담당 |
| `cmux-reviewer.md` | Sonnet | 코드 리뷰어 |
| `cmux-security.md` | Sonnet | 보안 감사 |

### 스크립트 (9개)
| 파일 | 용도 |
|------|------|
| `gate-blocker.sh` | PreToolUse — git commit 물리적 차단 |
| `gate-enforcer.py` | PostToolUse — GATE 위반 감지 + 로깅 |
| `eagle_watcher.sh` | surface 상태 자동 감시 (WORKING/IDLE/ERROR) |
| `speckit-tracker.py` | 태스크 등록/완료/재배정 추적 |
| `install_agents.sh` | 에이전트 설치 + Hook 등록 |
| `detect_surfaces.py` | cmux surface 자동 감지 |
| `cmux-orchestra-enforcer.sh` | SessionStart — cmux 환경 자동 감지 |
| `cmux-idle-reminder.sh` | UserPromptSubmit — 놀고 있는 AI 알림 |
| `cmux-claude-bridge.sh` | PostToolUse — 상태 브릿지 |

### 기타 (4개)
| 파일 | 용도 |
|------|------|
| `SKILL.md` | 전체 오케스트레이션 명세 |
| `README.md` | 스킬 설명 |
| `commands/cmux.md` | `/cmux` 명령어 라우팅 정의 |
| `config/orchestra-config.json` | AI 프리셋 설정 |

---

## 전제 조건

| 소프트웨어 | 최소 버전 | 확인 명령어 |
|-----------|----------|------------|
| **cmux** | 최신 | `cmux --version` |
| **Claude Code** | v2.1+ | `claude --version` |
| **Python 3** | 3.6+ | `python3 --version` |
| **Bash** | 4.0+ | `bash --version` |

---

## 문제 해결

### "gate-blocker.sh permission denied"
```bash
chmod +x ~/.claude/skills/cmux-orchestrator/scripts/*.sh
```

### Hook이 작동하지 않음
```bash
# settings.json에 등록 확인
grep "gate-blocker\|gate-enforcer" ~/.claude/settings.json
```

### "cmux: command not found"
cmux CLI를 먼저 설치하세요: https://openclaw.ai

### 설치 재실행
```bash
bash install.sh  # 기존 설정 자동 백업 후 재설치
```

---

*마지막 업데이트: 2026-03-18*
