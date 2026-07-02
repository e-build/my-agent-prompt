#!/usr/bin/env bash
# es-query.sh — Shopl ES 로그 조회 래퍼 (read-only, 결과 정제)
# SKILL.md 의 recipe/안티패턴을 준수하는 Query DSL 을 전달할 것.
set -euo pipefail

# --- config ---
CONFIG="${ES_CONFIG:-$HOME/.config/es-skill/config.env}"
[ -f "$CONFIG" ] || { echo "ERROR: config 없음: $CONFIG (config.env.example 참조)" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"
: "${ES_ENDPOINT:?ES_ENDPOINT 미설정 ($CONFIG)}"
: "${ES_INDEX_PATTERN:=shopl-backend-log*}"

# --- 쿼리 로드 (파일 or stdin) ---
if [ $# -ge 1 ] && [ -f "$1" ]; then
  QUERY=$(cat "$1")
elif [ ! -t 0 ]; then
  QUERY=$(cat)
else
  echo "Usage: es-query.sh <query.json>   또는   cat query.json | es-query.sh   (COUNT=1 로 카운트 전용)" >&2
  exit 2
fi

# --- @timestamp range 가드 (ES 부하 방지) ---
# ponytail: 광범위 쿼리로 소규모 ES 보호. 단 rId term 쿼리는 샤드 룩업이라
# 매우 빠르므로 range 생략을 허용한다. 나머지는 range 필수.
# 통과 조건: (A) @timestamp range 있음  OR  (B) term.rId 있음
if ! echo "$QUERY" | jq -e '
  [ .. | objects | (
      (has("range") and (.range | has("@timestamp")))
      or (has("term") and (.term | has("rId")))
  ) ] | any
' >/dev/null 2>&1; then
  echo "REFUSED: @timestamp range 없음 — 전체 스캔으로 ES 부하 위험." >&2
  echo "         range 추가하거나, 단일 rId 검색이라면 term.rId 를 사용할 것." >&2
  echo "         기간 프리셋: 1h(기본) / 1d / 3d / 2w" >&2
  exit 3
fi

# --- 엔드포인트 결정 (search | count) ---
if [ "${COUNT:-0}" = "1" ]; then
  URL="${ES_ENDPOINT%/}/${ES_INDEX_PATTERN}/_count"
else
  URL="${ES_ENDPOINT%/}/${ES_INDEX_PATTERN}/_search"
fi

# --- 인증 헤더 ---
AUTH=()
if [ -n "${ES_USER:-}" ] && [ -n "${ES_PASS:-}" ]; then
  AUTH+=(-u "${ES_USER}:${ES_PASS}")
elif [ -n "${ES_API_KEY:-}" ]; then
  AUTH+=(-H "Authorization: ApiKey ${ES_API_KEY}")
fi

# --- 실행 ---
RESP=$(curl -sS --max-time "${ES_TIMEOUT:-30}" "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  ${ES_INSECURE:-} \
  -X POST "$URL" -d "$QUERY") || { echo "ERROR: curl 실패 ($URL)" >&2; exit 1; }

# --- 결과 정제 ---
if [ "${COUNT:-0}" = "1" ]; then
  echo "$RESP" | jq -r '"count: \(.count)"'
  exit 0
fi

# ponytail: 정제는 쿼리의 _source 가 이미 필요 필드만 골랐다는 가정 하에,
# 긴 텍스트 필드만 cap 하고 한 줄 JSON 으로 출력하여 컨텍스트 절약.
echo "$RESP" | jq --argjson cap "${TEXT_CAP:-2000}" '
  if .error then
    "ES ERROR: \(.error.type // "") — \(.error.reason // "")" | halt_error(1)
  else
    "total: \(.hits.total.value)  (took \(.took)ms, timed_out: \(.timed_out))",
    (.hits.hits[]._source
      | {
          "@timestamp", level, message_type, logger_name,
          rId, cId, uId, ctxtId, requestURI, env, service_type,
          message:     ((.message // "")[0:$cap]),
          stack_trace: ((.stack_trace // "")[0:$cap]),
          message_data
        }
      | tostring)
  end
'
