#!/bin/bash
# gate-blocker.sh — PreToolUse hook: WORKING surface 있을 때 커밋 차단
#
# Claude Code PreToolUse hook에서 실행.
# git commit 시도 시 WORKING surface가 있으면 block decision 반환.
#
# stdin: {"tool_name":"Bash","tool_input":{"command":"git commit ..."}}
# stdout: {"decision":"block","reason":"..."} 또는 빈 출력 (허용)

# cmux 소켓 없으면 무시
[ -S "${CMUX_SOCKET_PATH:-$HOME/Library/Application Support/cmux/cmux.sock}" ] || exit 0

# stdin에서 tool_input 읽기 (타임아웃 + 에러 로깅)
variable_input=$(timeout 3 cat 2>/dev/null || echo "")
variable_command=$(echo "$variable_input" | timeout 2 python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('tool_input',{}).get('command',''))
except json.JSONDecodeError as e:
    print('', file=sys.stderr)
    print('')
except Exception:
    print('')
" 2>/dev/null || echo "")

# git commit만 감지 — 다른 모든 명령은 즉시 통과
echo "$variable_command" | grep -qE "^git commit|&&\s*git commit" || exit 0

# === GATE 0: 디스패치 미수집 시 커밋 차단 ===
variable_dispatch_file="/tmp/cmux-dispatch-registry.json"
if [ -f "$variable_dispatch_file" ]; then
    variable_gate0_result=$(python3 -c "
import json
d = json.load(open('$variable_dispatch_file'))
dispatched = d.get('dispatched', {})
pending = [sid for sid, info in dispatched.items() if info.get('status') != 'done']
if pending:
    print('|'.join(pending))
" 2>/dev/null)

    if [ -n "$variable_gate0_result" ]; then
        echo "{\"decision\":\"block\",\"reason\":\"⛔ HARD GATE 0: 미수집 surface 있음 — $variable_gate0_result. 모든 디스패치 결과 수집 전 커밋 금지.\"}"
        exit 0
    fi
fi

# eagle 상태 확인 (WORKING + ERROR + WAITING 모두 차단)
variable_eagle_file="/tmp/cmux-eagle-status.json"
if [ -f "$variable_eagle_file" ]; then
    variable_blocking=$(timeout 2 python3 -c "
import json
try:
    d = json.load(open('$variable_eagle_file'))
    blocking = []
    for k, v in d.get('surfaces', {}).items():
        st = v.get('status', '')
        if st in ('WORKING', 'ERROR', 'WAITING'):
            blocking.append(f'surface:{k}({st})')
    if blocking:
        print('|'.join(blocking))
except Exception:
    pass
" 2>/dev/null)

    if [ -n "$variable_blocking" ]; then
        echo "{\"decision\":\"block\",\"reason\":\"⛔ GATE 1: 활성 surface 있음 — $variable_blocking. 커밋 전에 모든 surface 완료/처리 필수.\"}"
        exit 0
    fi
fi

# speckit tracker 확인
variable_tracker="/tmp/cmux-speckit-tracker.json"
if [ -f "$variable_tracker" ]; then
    variable_incomplete=$(python3 -c "
import json
d = json.load(open('$variable_tracker'))
inc = [tid for tid, info in d.get('tasks', {}).items() if info.get('status') not in ('done',)]
if inc:
    print(','.join(inc))
" 2>/dev/null)

    if [ -n "$variable_incomplete" ]; then
        echo "{\"decision\":\"block\",\"reason\":\"⛔ GATE 5: speckit 미완료 태스크 $variable_incomplete. 재배정 후 완료해야 커밋 가능.\"}"
        exit 0
    fi
fi

# 통과
exit 0
