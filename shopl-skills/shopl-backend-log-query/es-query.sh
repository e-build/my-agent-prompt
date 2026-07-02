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

# --- 인증 ---
AUTH=()
if [ -n "${ES_USER:-}" ] && [ -n "${ES_PASS:-}" ]; then
  AUTH+=(-u "${ES_USER}:${ES_PASS}")
elif [ -n "${ES_API_KEY:-}" ]; then
  AUTH+=(-H "Authorization: ApiKey ${ES_API_KEY}")
else
  echo "ERROR: ES_USER/ES_PASS 또는 ES_API_KEY 필요 ($CONFIG)" >&2; exit 1
fi

# --- 모드 파싱 (COUNT=1|true|yes 모두 허용) ---
case "${COUNT:-0}" in
  1|true|TRUE|yes|YES) IS_COUNT=1 ;;
  *) IS_COUNT=0 ;;
esac

# --- 쿼리 로드 (파일 or stdin) ---
if [ $# -ge 1 ] && [ -f "$1" ]; then
  QUERY=$(cat "$1")
elif [ ! -t 0 ]; then
  QUERY=$(cat)
else
  echo "Usage: es-query.sh <query.json>   또는   cat query.json | es-query.sh" >&2
  echo "       COUNT=1 es-query.sh query.json   (카운트 전용)" >&2
  exit 2
fi

# --- JSON 유효성 먼저 검증 (range 가드와 분리) ---
if ! printf '%s' "$QUERY" | jq -e . >/dev/null 2>&1; then
  echo "ERROR: invalid JSON — 쿼리 문법을 확인할 것" >&2; exit 2
fi

# --- size 추출 (여러 곳에서 사용) ---
QSIZE=$(printf '%s' "$QUERY" | jq -r '.size // 0')

# --- @timestamp range 가드 (ES 부하 방지) ---
# ponytail: 광범위 쿼리로 소규모 ES 보호. 단 rId(term/terms)는 샤드 룩업이라
# 매우 빠르므로 range 생략 허용. 나머지는 range 필수.
if ! printf '%s' "$QUERY" | jq -e '
  [ .. | objects | (
      (has("range") and (.range | has("@timestamp")))
      or (has("term") and (.term | has("rId")))
      or (has("terms") and (.terms | has("rId")))
  ) ] | any
' >/dev/null 2>&1; then
  echo "REFUSED: @timestamp range 없음 — 전체 스캔으로 ES 부하 위험." >&2
  echo "         range 추가하거나, rId 검색이라면 term/terms 의 rId 를 사용할 것." >&2
  echo "         기간 프리셋: 1h(기본) / 1d / 3d / 2w" >&2
  exit 3
fi

# --- size cap (대량 히트 방어, aggregation size:0 은 허용) ---
# 우회 필요 시 ALLOW_LARGE=1
if [ "$IS_COUNT" = "0" ]; then
  if [ "$QSIZE" -gt 200 ] 2>/dev/null && [ "${ALLOW_LARGE:-0}" != "1" ]; then
    echo "REFUSED: size $QSIZE > 200 — 대량 히트로 ES/네트워크 부하. 집계(size:0) 전환 권장. 우회: ALLOW_LARGE=1" >&2
    exit 3
  fi
fi

# --- _source 자동 삽입 (ES/네트워크 부하 절감) ---
# ponytail: 쿼리가 _source 를 안 정했고 size>0 이면 기본 필드만 요청.
# 이미 큰 payload 를 받아온 뒤 jq 로 자르는 것보다 ES 단에서 줄이는 게 효율적.
if [ "$IS_COUNT" = "0" ]; then
  HAS_SOURCE=$(printf '%s' "$QUERY" | jq -r 'has("_source")')
  if [ "$HAS_SOURCE" = "false" ] && [ "$QSIZE" -gt 0 ] 2>/dev/null; then
    QUERY=$(printf '%s' "$QUERY" | jq -c '. + {_source: [
      "@timestamp","level","env","service_type","message_type","requestURI",
      "logger_name","rId","cId","uId","ctxtId","message_data","message","stack_trace"
    ]}')
  fi
fi

# --- count 모드 정리 ---
# _count 엔드포인트는 sort/size/_source 등을 지원하지 않는다.
if [ "$IS_COUNT" = "1" ]; then
  QUERY=$(printf '%s' "$QUERY" | jq -c 'del(.sort, .size, ._source, .track_total_hits)')
fi

# --- 엔드포인트 ---
if [ "$IS_COUNT" = "1" ]; then
  URL="${ES_ENDPOINT%/}/${ES_INDEX_PATTERN}/_count"
else
  URL="${ES_ENDPOINT%/}/${ES_INDEX_PATTERN}/_search"
fi

# --- 실행 ---
RESP=$(curl -sS --max-time "${ES_TIMEOUT:-30}" "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  ${ES_INSECURE:-} \
  -X POST "$URL" -d "$QUERY") || { echo "ERROR: curl 실패 ($URL)" >&2; exit 1; }

# --- 결과 정제: count ---
if [ "$IS_COUNT" = "1" ]; then
  echo "$RESP" | jq -r '"count: \(.count)"'
  exit 0
fi

# --- 결과 정제: search ---
# total relation 표시: gte 면 "+" (10000+), eq 면 생략
# aggregation 있으면 보존 (size:0 집계 쿼리 대응)
printf '%s' "$RESP" | jq --argjson cap "${TEXT_CAP:-2000}" '
  if .error then
    "ES ERROR: \(.error.type // "") — \(.error.reason // "")" | halt_error(1)
  else
    "total: \(.hits.total.value)\(if (.hits.total.relation // "eq") == "gte" then "+" else "" end)  (took \(.took)ms, timed_out: \(.timed_out))",
    ( if .aggregations then
        "aggregations: " + (.aggregations | tostring)
      else empty end ),
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
