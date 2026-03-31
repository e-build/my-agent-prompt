#!/bin/bash
# eagle_watcher.sh — Persistent surface monitor (zero API cost)
# MUST run inside cmux session (cmux commands require session context)
#
# Usage (from within cmux surface):
#   bash eagle_watcher.sh &          # background within same shell
#   bash eagle_watcher.sh --once     # single poll (for subagent use)
#
# Output: /tmp/cmux-eagle-status.json (overwritten every cycle)

variable_status_file="${EAGLE_STATUS_FILE:-/tmp/cmux-eagle-status.json}"
variable_interval="${EAGLE_INTERVAL:-20}"
variable_once=false

# SKILL_DIR 동적 해석 (이식성: 하드코딩 경로 제거)
variable_script_dir="$(cd "$(dirname "$0")" && pwd)"  # $0 = 이 스크립트 경로
variable_skill_dir="${SKILL_DIR:-$(dirname "$variable_script_dir")}"  # scripts/ 상위 = 스킬 루트
variable_config_file="${variable_skill_dir}/config/orchestra-config.json"

# Parse args
[ "$1" = "--once" ] && variable_once=true

# Auto-detect surfaces from cmux tree
function_detect_surfaces() {
  cmux tree --all 2>/dev/null | grep -oE 'surface:[0-9]+' | sed 's/surface://' | sort -u | tr '\n' ' '
}

function_cleanup_buffers() {
  if ! cmux help 2>&1 | grep -q "delete-buffer"; then
    return
  fi

  local variable_now
  variable_now=$(date +%s)
  local variable_threshold=$((variable_now - 1800))

  cmux list-buffers 2>/dev/null | while read -r variable_bname variable_rest; do
    [ -z "$variable_bname" ] && continue
    local variable_target_time=""
    if [[ "$variable_bname" =~ ^[0-9]{10,}$ ]]; then
      variable_target_time="$variable_bname"
    else
      local variable_last_col
      variable_last_col=$(echo "$variable_rest" | awk '{print $NF}')
      if [[ "$variable_last_col" =~ ^[0-9]{10,}$ ]]; then
        variable_target_time="$variable_last_col"
      fi
    fi

    if [ -n "$variable_target_time" ] && [ "$variable_target_time" -lt "$variable_threshold" ]; then
      cmux delete-buffer --name "$variable_bname" >/dev/null 2>&1
    fi
  done
}

function_poll_once() {
  local variable_surfaces
  variable_surfaces=$(function_detect_surfaces)
  # Exclude self — 동적 감지 (하드코딩 금지)
  local variable_my_sid=""
  variable_my_sid=$(cmux identify 2>/dev/null | grep -oE 'surface:[0-9]+' | sed 's/surface://' | head -1)
  if [ -n "$variable_my_sid" ]; then
    variable_surfaces=$(echo "$variable_surfaces" | tr ' ' '\n' | grep -v "^${variable_my_sid}$" | tr '\n' ' ')
  fi

  local variable_timestamp
  variable_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local variable_json='{"timestamp":"'"$variable_timestamp"'","surfaces":{'
  local variable_first=true
  local variable_idle_list=""
  local variable_error_list=""
  local variable_waiting_list=""
  local variable_processed=0

  for variable_sid in $variable_surfaces; do
    [ -z "$variable_sid" ] && continue
    # surface ID 유효성 검증 (A/B 리뷰 R2 지적)
    [[ "$variable_sid" =~ ^[0-9]+$ ]] || continue
    local variable_screen
    variable_screen=$(cmux read-screen --surface "surface:${variable_sid}" --scrollback --lines 30 2>&1)

    # Priority 0: 접근 불가 surface 스킵 (다른 workspace 등)
    if echo "$variable_screen" | grep -q "invalid_params\|Failed to write"; then
      continue
    fi

    # 실제 처리된 surface 카운트 (invalid_params 스킵 후)
    variable_processed=$((variable_processed + 1))

    # Priority 1: WORKING — 실제 작업 중인 상태만 (spinner + Working 텍스트)
    local variable_st="UNKNOWN"
    if echo "$variable_screen" | grep -qE "Working.*interrupt|thinking|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|interrupt variants"; then
      variable_st="WORKING"
    # Priority 1.5: WAITING — 질문/확인 대기 (사용자 입력 필요)
    elif echo "$variable_screen" | grep -qiE "Would you like|would you prefer|Do you want|Shall I|confirm|y/n|\[Y/n\]|\[y/N\]|proceed\?|continue\?|install.*\?|create.*\?|overwrite.*\?|replace.*\?"; then
      variable_st="WAITING"
    # Priority 2: ERROR — API 오류, 잔액 부족, 타임아웃, 권한 거부, rate limit, OOM 포함
    elif echo "$variable_screen" | grep -qiE "model not exist|Context.*exceed|overloaded|529|crashed|insufficient.balance|1008|API_TIMEOUT|Operation not permitted|Settings Error|ECONNREFUSED|attempt.*[0-9]+/[0-9]+.*timeout|rate[._-]limit|RateLimitError|quota.exceeded|QuotaExceeded|502 Bad Gateway|503 Service|OOMKilled|SIGKILL|killed.*signal|unauthorized|authentication.failed|invalid.api.key|token.limit|MaxTokens.*exceed|\[Errno "; then
      variable_st="ERROR"
    # Priority 3: IDLE — 완료 표시 포함
    elif echo "$variable_screen" | grep -qE "^❯|❯ "; then
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qE "Brewed|Cooked"; then
      # Brewed/Cooked = 작업 완료 → IDLE (❯ 프롬프트가 화면 밖일 수 있음)
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qE "Find and fix|^› "; then
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -q "Type your message"; then
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qE "Ask anything|ctrl\+t variants|tab agents|ctrl\+p commands"; then
      # OpenCode (oh-my-opencode) TUI IDLE 프롬프트
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qE "MCP /status|Sisyphus"; then
      # OpenCode 하단 상태바 (MCP + 에이전트 표시)
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qiE "MiniMax|M2\.5|ccm.*>|minimax.*ready"; then
      # MiniMax (ccm) 프롬프트 — IDLE 대기
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qE "^\s*\*\s|YOLO|gemini.*pro"; then
      # Gemini 프롬프트: " * / " 또는 YOLO ctrl+y 또는 모델명 표시
      variable_st="IDLE"
    elif echo "$variable_screen" | grep -qE "\([0-9]+/[0-9]+\)|skills$|sandbox"; then
      # Gemini 하단: (1/37) 또는 "- 24 skills" 또는 "sandbox"
      variable_st="IDLE"
    fi

    local variable_snip
    variable_snip=$(echo "$variable_screen" | grep -vE "^$|^❯|^›|Type your message|bypass|auto-compact|shift.tab" | tail -1 \
      | tr -d '\000-\037' \
      | sed 's/\\/\\\\/g; s/"/\\"/g' \
      | cut -c1-80)

    # AI 이름 조회 (설정 파일에서 — 이식성: variable_config_file 사용)
    local variable_ai_name="unknown"
    if [ -f "$variable_config_file" ]; then
      variable_ai_name=$(python3 -c "import json;print(json.load(open('${variable_config_file}')).get('surfaces',{}).get('${variable_sid}',{}).get('ai','unknown'))" 2>/dev/null || echo "unknown")
    fi

    [ "$variable_first" = true ] && variable_first=false || variable_json+=","
    variable_json+='"'"${variable_sid}"'":{"status":"'"${variable_st}"'","ai":"'"${variable_ai_name}"'","snippet":"'"${variable_snip}"'"}'

    [ "$variable_st" = "IDLE" ] && variable_idle_list+="${variable_sid} "
    [ "$variable_st" = "ERROR" ] && variable_error_list+="${variable_sid} "
    [ "$variable_st" = "WAITING" ] && variable_waiting_list+="${variable_sid} "
  done

  # Count stats (variable_processed는 메인 루프에서 invalid_params 스킵 후 증가)
  local variable_idle_count=$(echo "${variable_idle_list}" | xargs | wc -w | tr -d ' ')
  local variable_error_count=$(echo "${variable_error_list}" | xargs | wc -w | tr -d ' ')
  local variable_waiting_count=$(echo "${variable_waiting_list}" | xargs | wc -w | tr -d ' ')
  local variable_total=$variable_processed
  local variable_working_count=$((variable_total - variable_idle_count - variable_error_count - variable_waiting_count))
  [ "$variable_working_count" -lt 0 ] && variable_working_count=0

  variable_json+='},"idle_surfaces":"'"${variable_idle_list% }"'","error_surfaces":"'"${variable_error_list% }"'","waiting_surfaces":"'"${variable_waiting_list% }"'"'
  variable_json+=',"stats":{"total":'"${variable_total}"',"idle":'"${variable_idle_count}"',"working":'"${variable_working_count}"',"waiting":'"${variable_waiting_count}"'}}'
  echo "$variable_json" > "$variable_status_file"

  # Update cmux progress bar (if available)
  if [ "$variable_total" -gt 0 ] 2>/dev/null; then
    local variable_progress
    variable_progress=$(python3 -c "print(round(${variable_idle_count}/${variable_total}, 2))" 2>/dev/null || echo "0.0")
    cmux set-progress "$variable_progress" --label "${variable_idle_count}/${variable_total} idle" > /dev/null 2>&1
  fi

  function_cleanup_buffers

  # cmux 공식 기능 총동원
  # 1. display-message: 상태 바에 현황 표시
  cmux display-message "I:${variable_idle_count} W:${variable_working_count} E:${variable_error_count} Q:${variable_waiting_count}" > /dev/null 2>&1

  # 2. surface-health: 전체 건강 확인
  cmux surface-health > /dev/null 2>&1

  # 3. trigger-flash: ERROR/WAITING surface에 시각적 경고
  for variable_alert_sid in $variable_error_list $variable_waiting_list; do
    [ -z "$variable_alert_sid" ] && continue
    cmux trigger-flash --surface "surface:${variable_alert_sid}" > /dev/null 2>&1
  done

  # 4. rename-tab: 각 surface 탭에 상태 표시
  for variable_sid in $variable_surfaces; do
    [ -z "$variable_sid" ] && continue
    [[ "$variable_sid" =~ ^[0-9]+$ ]] || continue
    local variable_tab_st=""
    variable_tab_st=$(python3 -c "import json;d=json.load(open('${variable_status_file}'));print(d.get('surfaces',{}).get('${variable_sid}',{}).get('status','?'))" 2>/dev/null || echo "?")
    local variable_tab_ai=""
    variable_tab_ai=$(python3 -c "import json;d=json.load(open('${variable_status_file}'));print(d.get('surfaces',{}).get('${variable_sid}',{}).get('ai','?')[:8])" 2>/dev/null || echo "?")
    cmux rename-tab --surface "surface:${variable_sid}" "${variable_tab_ai}:${variable_tab_st}" > /dev/null 2>&1
  done
}

# Main
if [ "$variable_once" = true ]; then
  function_poll_once 2>/dev/null
  cat "$variable_status_file"
else
  while true; do
    function_poll_once
    sleep "$variable_interval"
  done
fi
