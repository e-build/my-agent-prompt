#!/bin/bash
# cmux-orchestra-enforcer.sh — SessionStart hook (v5)
# cmux 환경이고 surface 2개 이상이면 cmux-orchestrator 온보딩 시작

[ -n "$CMUX_WORKSPACE_ID" ] || exit 0

variable_surface_count=$(cmux tree --all 2>/dev/null | grep -c "surface:" || echo 0)
[ "$variable_surface_count" -ge 2 ] || exit 0

# SKILL_DIR 동적 해석 (이식성: 하드코딩 경로 제거)
variable_script_dir="$(cd "$(dirname "$0")" && pwd)"
variable_skill_dir="${SKILL_DIR:-$(dirname "$variable_script_dir")}"
variable_config="${variable_skill_dir}/config/orchestra-config.json"

if [ -f "$variable_config" ]; then
  # 기존 설정 발견
  variable_surfaces=$(python3 -c "
import json
with open('$variable_config') as f:
    d = json.load(f)
for sid, info in d.get('surfaces', {}).items():
    print(f'  surface:{sid} = {info[\"ai\"]} (시작: {info[\"start_cmd\"]}, 종료: {info[\"quit_cmd\"]})')
" 2>/dev/null)

  cat << EOF
{"additionalContext":"[CMUX-ORCHESTRA v5] cmux ${variable_surface_count}개 surface 감지 + 기존 설정 발견.\n\n이전 오케스트레이션 설정:\n${variable_surfaces}\n\n사용자에게 질문: '이전 cmux 오케스트레이션 설정이 있습니다. 이전 세팅대로 진행할까요?'\n- 예 → 바로 오케스트레이션 시작\n- 아니오 → 스크린샷 요청 → 새로 설정"}
EOF
else
  # 설정 없음 → 온보딩 시작
  cat << EOF
{"additionalContext":"[CMUX-ORCHESTRA v5] cmux ${variable_surface_count}개 surface 감지. 오케스트레이션 설정 없음.\n\n사용자에게 질문: 'cmux에 ${variable_surface_count}개 창이 감지되었습니다. 멀티 AI 오케스트레이션을 활성화할까요?'\n- 예 → 각 창에 AI 로그인 요청 → 스크린샷/설명 받기 → 시작/종료 명령어 수집 → 설정 저장\n- 아니오 → 오케스트레이션 비활성"}
EOF
fi
