# /cmux — cmux 멀티 AI 오케스트레이션 통합 명령어

입력: `$ARGUMENTS`

이 명령어는 cmux orchestrator의 **단일 진입점**입니다. 입력을 분석하여 적절한 cmux 기능을 자동 발동합니다.

---

## 라우팅 (입력 분석 → 자동 실행)

### 빈 입력 또는 `status`
```
cmux tree --all
bash ${SKILL_DIR:=$HOME/.claude/skills/cmux-orchestrator}/scripts/eagle_watcher.sh --once | python3 -m json.tool
```
→ 전 surface 상태 + 건강 확인

### `다음 라운드` / `next` / `round`
→ Skill("cmux-orchestrator") 활성화 + 다음 라운드 프로토콜 6-Step 자동 실행

### `조사` / `research` / `검색` + 주제
```
1. 전 surface 초기화 (/new, /clear)
2. AI별 능력 맞춤 번들 배정
3. 조사 디스패치:
   - search_executor.py 있으면 → py 스크립트로 멀티API 조사
   - 없으면 → 각 AI에 직접 "조사해줘" 프롬프트 전송 (WebSearch/내장 도구)
4. 결과 수집 GATE
```

### `배정` / `assign` / `작업` + 내용
```
1. speckit-tracker.py --init
2. AI별 태스크 분해 + 번들 배정
3. cmux send로 디스패치
4. speckit-tracker.py --add
```

### `수집` / `collect` / `결과`
```
1. eagle_watcher.sh --once (상태 확인)
2. 각 surface cmux read-screen --scrollback --lines 50
3. DONE 키워드 확인
4. speckit-tracker.py --done (완료 마킹)
5. GATE 5 검증: speckit-tracker.py --gate
```

### `리뷰` / `review`
```
→ Agent(subagent_type="code-reviewer", model="sonnet") 디스패치
→ Main 직접 리뷰 금지 (GATE 2)
```

### `커밋` / `commit`
```
1. GATE 1: eagle — WORKING surface 없는지
2. GATE 5: speckit-tracker --gate — 미완료 없는지
3. gate-blocker.sh가 PreToolUse에서 자동 검증
4. 통과 시 git commit
```

### `초기화` / `init` / `setup`
```
bash ${SKILL_DIR}/scripts/install_agents.sh --setup
cmux set-hook after-send-keys "bash ${SKILL_DIR}/scripts/eagle_watcher.sh --once > /dev/null 2>&1 &"
cmux surface-health
cmux display-message "cmux orchestrator active"
```

### `감시` / `eagle` / `watch`
```
bash ${SKILL_DIR}/scripts/eagle_watcher.sh --once | python3 -m json.tool
```

### `gate` / `검증`
```
python3 ${SKILL_DIR}/scripts/speckit-tracker.py --status
python3 ${SKILL_DIR}/scripts/speckit-tracker.py --gate
python3 ${SKILL_DIR}/scripts/gate-enforcer.py --check-all
```

### `surface` / `화면` + surface 번호
```
cmux read-screen --surface surface:N --scrollback --lines 50
```
→ 해당 surface 화면 직접 확인

### `에러` / `error` / `복구`
```
1. eagle에서 ERROR surface 탐지
2. cmux read-screen으로 에러 원인 확인
3. 에러 surface 작업을 다른 surface에 재배정
4. speckit-tracker.py --fail + --reassign
```

### `flash` / `알림`
```
cmux trigger-flash --surface surface:N
cmux notify --title "제목" --body "내용"
```

### `프리셋` / `preset`
→ orchestra-config.json의 AI 프리셋 목록 출력

### 기타 (위 패턴 미매칭)
→ Skill("cmux-orchestrator") 활성화 후 입력 전달

---

## 강제 규칙 (모든 라우트에 적용)

1. **WORKING surface 있으면 커밋/종료 금지** (gate-blocker.sh가 물리적 차단)
2. **코드리뷰는 서브에이전트 필수** (Main 직접 금지)
3. **surface 확인은 cmux read-screen 직접** (재질문 금지)
4. **speckit 미완료 태스크 → 재배정 필수** (단순 스킵 금지)
5. **작업 전 /new /clear 초기화 필수**
6. **GATE 0 (수집 완료 GATE) — 조사 디스패치 후 결론/구현 진행 절대 금지** (**HARD BLOCK**)
   - 모든 디스패치된 surface에서 `DONE:` 키워드가 확인되기 전까지 다음 단계 진행 불가
   - 수집 절차:
     1. 디스패치한 surface 목록을 메모리에 유지 (예: `dispatched = [surface:1, surface:2, surface:3, surface:5, surface:10]`)
     2. 각 surface에 대해 `cmux read-screen --surface surface:N --scrollback --lines 80`으로 DONE: 확인
     3. DONE: 미확인 surface가 있으면 → 60초 대기 후 재확인 (최대 5회 polling)
     4. 5회 후에도 DONE 없으면 → **해당 surface를 STALLED로 마킹** → 다른 surface에 재배정 또는 사용자에게 보고
     5. **모든 surface DONE 확인 후에만** 종합/결론/구현 단계 진행 허용
   - 위반 시: "아직 N개 surface에서 결과를 받지 못했습니다. 수집 완료 후 진행합니다." 메시지 출력 후 polling 재개
   - **예외 없음**: "이미 충분한 데이터" 합리화 금지. 모든 surface 결과가 필요함

## cmux 공식 기능 자동 활용

| 기능 | 자동 발동 시점 |
|------|--------------|
| `set-hook after-send-keys` | /cmux init |
| `surface-health` | /cmux status, eagle |
| `trigger-flash` | ERROR/WAITING 감지 시 |
| `rename-tab` | eagle 상태 갱신 시 |
| `display-message` | 라운드 시작/상태 변경 |
| `set-progress` | eagle 진행률 |
| `read-screen --scrollback` | 결과 수집 시 |
| `set-buffer + paste-buffer` | 200자+ 프롬프트 |
| `wait-for` | 동기화 토큰 |
