#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Run one read-only CloudWatch Logs Insights query and wait for completion.

Usage:
  run-insights-query.sh \
    --log-group <CloudWatch log group> \
    --start-time <unix seconds> \
    --end-time <unix seconds> \
    (--query <query string> | --query-file <path>) \
    [--region <AWS region>] [--timeout <seconds>]

Defaults:
  --region   ap-northeast-2 (or AWS_REGION/AWS_DEFAULT_REGION when set)
  --timeout  120 seconds
EOF
}

region="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-2}}"
log_group=""
start_time=""
end_time=""
query=""
query_file=""
timeout_seconds=120

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)
      region="$2"
      shift 2
      ;;
    --log-group)
      log_group="$2"
      shift 2
      ;;
    --start-time)
      start_time="$2"
      shift 2
      ;;
    --end-time)
      end_time="$2"
      shift 2
      ;;
    --query)
      query="$2"
      shift 2
      ;;
    --query-file)
      query_file="$2"
      shift 2
      ;;
    --timeout)
      timeout_seconds="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required." >&2
  exit 127
fi

if [[ -z "$log_group" || -z "$start_time" || -z "$end_time" ]]; then
  echo "--log-group, --start-time, and --end-time are required." >&2
  usage >&2
  exit 2
fi

if ! [[ "$start_time" =~ ^[0-9]+$ && "$end_time" =~ ^[0-9]+$ ]]; then
  echo "--start-time and --end-time must be Unix seconds." >&2
  exit 2
fi

if [[ -n "$query" && -n "$query_file" ]]; then
  echo "Use only one of --query or --query-file." >&2
  exit 2
fi

if [[ -n "$query_file" ]]; then
  if [[ ! -r "$query_file" ]]; then
    echo "Query file is not readable: $query_file" >&2
    exit 2
  fi
  query="$(<"$query_file")"
fi

if [[ -z "$query" ]]; then
  echo "Provide --query or --query-file." >&2
  exit 2
fi

query_id="$(aws logs start-query \
  --region "$region" \
  --log-group-name "$log_group" \
  --start-time "$start_time" \
  --end-time "$end_time" \
  --query-string "$query" \
  --query queryId \
  --output text)"

if [[ -z "$query_id" ]]; then
  echo "CloudWatch Logs Insights did not return a query ID." >&2
  exit 1
fi

deadline=$(( $(date +%s) + timeout_seconds ))
while :; do
  result="$(aws logs get-query-results \
    --region "$region" \
    --query-id "$query_id" \
    --output text)"
  status="$(printf '%s\n' "$result" | awk -F': ' '$1 == "Status" { print $2; exit }')"

  case "$status" in
    Complete)
      printf '%s\n' "$result"
      exit 0
      ;;
    Failed|Cancelled|Timeout|Unknown)
      printf '%s\n' "$result" >&2
      exit 1
      ;;
    Running|Scheduled)
      ;;
    *)
      echo "Unexpected Logs Insights status: ${status:-<empty>}" >&2
      printf '%s\n' "$result" >&2
      exit 1
      ;;
  esac

  if (( $(date +%s) >= deadline )); then
    echo "Timed out waiting for Logs Insights query: $query_id" >&2
    exit 124
  fi

  sleep 1
done
