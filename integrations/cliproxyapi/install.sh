#!/usr/bin/env bash
# CLI Proxy API 서버 구성 설치 스크립트
#
# 저장소(cliproxyapi/)에 보관된 구성 소스(템플릿 + docker-compose)를
# 어느 머신에서든 동일하게 설치한다.
#
# 동작(설치 모드):
#   1. 대상 디렉토리(기본 $HOME/cliproxyapi)에 docker-compose.yml 복사
#   2. config.yaml 이 없으면 config.template.yaml 에서 생성하고,
#      환경변수(CLIPROXY_SECRET_KEY/ZAI/DEEPSEEK)로 키를 주입.
#      --from <기존config> 가 있으면 템플릿 생성 대신 그 파일을 통째로 복사.
#   3. docker compose up -d 후 /v1/models 응답을 재시도로 검증
#
# 동작(동기화 모드):
#   bash integrations/cliproxyapi/install.sh --sync-from <실제config.yaml>
#     → 실제 config에서 키만 빨간색(플레이스홀더) 처리해
#       integrations/cliproxyapi/config.template.yaml 을 갱신한다. (드리프트 방지)
#
# 사용법:
#   bash integrations/cliproxyapi/install.sh                                     # 기본 $HOME/cliproxyapi
#   CLIPROXY_DIR=/opt/cpa bash integrations/cliproxyapi/install.sh               # 대상 디렉토리 변경
#   CLIPROXY_SECRET_KEY=... CLIPROXY_ZAI_API_KEY=... \
#     CLIPROXY_DEEPSEEK_API_KEY=... bash integrations/cliproxyapi/install.sh     # 키 주입(bash 네이티브, 의존성 없음)
#   bash integrations/cliproxyapi/install.sh --from ~/cliproxyapi/config.yaml    # 기존 config 통째로 복사
#   bash integrations/cliproxyapi/install.sh --sync-from ~/cliproxyapi/config.yaml  # 실제→템플릿 갱신
#   bash integrations/cliproxyapi/install.sh --no-compose                        # compose 실행 없이 설치만
#
# 주의: config.yaml에는 실제 API 키가 들어간다.
#   저장소가 public이므로 config.yaml / 키를 git에 커밋하지 말 것.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/cliproxyapi"
DEST="${CLIPROXY_DIR:-$HOME/cliproxyapi}"
FROM=""
SYNC_FROM=""
NO_COMPOSE=0

usage() {
  sed -n '2,31p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'EOF'
옵션:
  --dir <path>        설치 대상 디렉토리 (기본: $HOME/cliproxyapi, env CLIPROXY_DIR 우선)
  --from <file>       기존 config.yaml을 통째로 복사 (템플릿+주입 대신)
  --sync-from <file>  실제 config.yaml → config.template.yaml 갱신(키 빨간색). 설치 아님
  --no-compose        docker compose up 을 실행하지 않음
  -h, --help          도움말
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)        DEST="$2"; shift 2 ;;
    --from)       FROM="$2"; shift 2 ;;
    --sync-from)  SYNC_FROM="$2"; shift 2 ;;
    --no-compose) NO_COMPOSE=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

# ── 동기화 모드: 실제 config → 템플릿 갱신 ────────────────────────────────────
if [[ -n "$SYNC_FROM" ]]; then
  [[ -f "$SYNC_FROM" ]] || { echo "error: 없음: $SYNC_FROM" >&2; exit 1; }
  echo "==> 템플릿 갱신: $SYNC_FROM → $SRC/config.template.yaml (키는 플레이스홀더화)"
  {
    cat <<'HDR'
# CLI Proxy API 서버 구성 템플릿
#
# 실제 키(secret)는 `__CLIPROXY_*__` 플레이스홀더로 남겨두고,
# `install.sh`가 환경변수 또는 기존 config에서 값을 주입해 config.yaml을 생성한다.
# 플레이스홀더를 실제 값으로 바꿔 직접 커밋하지 말 것 (저장소는 public).

HDR
    awk '
      BEGIN { in_rm=0; prov="" }
      /^[^[:space:]#]/ { in_rm=($0 ~ /^remote-management:/) }
      /^[[:space:]]*- name:/ {
        n=$0; sub(/^[[:space:]]*- name:[[:space:]]*/,"",n); gsub(/["'\''][:space:].*/,"",n); gsub(/["'\'']/,"",n); prov=tolower(n)
      }
      in_rm && /^[[:space:]]+secret-key:/ {
        sub(/:[[:space:]].*$/, ": \"__CLIPROXY_SECRET_KEY__\"  # bcrypt 해시. install.sh가 주입"); print; next
      }
      /^[[:space:]]*-?[[:space:]]*api-key:/ && (prov=="zai"||prov=="deepseek") {
        ph = (prov=="zai") ? "__CLIPROXY_ZAI_API_KEY__" : "__CLIPROXY_DEEPSEEK_API_KEY__"
        sub(/api-key:[[:space:]].*$/, "api-key: \"" ph "\""); print; next
      }
      { print }
    ' "$SYNC_FROM"
  } > "$SRC/config.template.yaml"
  echo "==> 완료. 변경분 확인 후 커밋: git diff integrations/cliproxyapi/config.template.yaml"
  exit 0
fi

# ── 설치 모드 ──────────────────────────────────────────────────────────────────
echo "==> 대상 디렉토리: $DEST"
mkdir -p "$DEST"
cp -f "$SRC/docker-compose.yml" "$DEST/docker-compose.yml"

if [[ -f "$DEST/config.yaml" ]]; then
  echo "==> $DEST/config.yaml 이 이미 존재합니다. 기존 구성을 유지합니다."
elif [[ -n "$FROM" ]]; then
  [[ -f "$FROM" ]] || { echo "error: --from 파일 없음: $FROM" >&2; exit 1; }
  cp -f "$FROM" "$DEST/config.yaml"
  echo "==> --from 에서 config.yaml 복사: $FROM"
else
  echo "==> config.template.yaml 로부터 config.yaml 생성 (키 주입)"
  content=$(cat "$SRC/config.template.yaml")
  S="${CLIPROXY_SECRET_KEY:-}"; Z="${CLIPROXY_ZAI_API_KEY:-}"; D="${CLIPROXY_DEEPSEEK_API_KEY:-}"
  filled=(); missing=()
  if [[ -n "$S" ]]; then content=${content//__CLIPROXY_SECRET_KEY__/$S};     filled+=("CLIPROXY_SECRET_KEY");     else missing+=("__CLIPROXY_SECRET_KEY__");     fi
  if [[ -n "$Z" ]]; then content=${content//__CLIPROXY_ZAI_API_KEY__/$Z};    filled+=("CLIPROXY_ZAI_API_KEY");    else missing+=("__CLIPROXY_ZAI_API_KEY__");    fi
  if [[ -n "$D" ]]; then content=${content//__CLIPROXY_DEEPSEEK_API_KEY__/$D}; filled+=("CLIPROXY_DEEPSEEK_API_KEY"); else missing+=("__CLIPROXY_DEEPSEEK_API_KEY__"); fi
  printf '%s\n' "$content" > "$DEST/config.yaml"
  [[ ${#filled[@]}  -gt 0 ]] && echo "    주입됨: ${filled[*]}"
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "    ! 남은 플레이스홀더(수동 입력 필요): ${missing[*]}" >&2
    echo "      ex) sed -i.bak 's|${missing[0]}|실제값|' $DEST/config.yaml" >&2
  fi
fi

# ── docker compose 시작 (재시도 검증) ──────────────────────────────────────────
if [[ "$NO_COMPOSE" == "1" ]]; then
  echo "==> --no-compose 지정. 직접 실행: docker compose -f $DEST/docker-compose.yml up -d"
else
  echo "==> docker compose up -d"
  docker compose -f "$DEST/docker-compose.yml" up -d
  echo "==> /v1/models 응답 대기 (최대 30s)"
  ok=0
  for _ in $(seq 1 15); do
    if curl -sf http://localhost:8317/v1/models -o /dev/null; then ok=1; break; fi
    sleep 2
  done
  docker ps --filter name=cli-proxy-api --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
  if [[ "$ok" == "1" ]]; then
    echo "==> OK: http://localhost:8317/v1/models 응답 정상"
  else
    echo "!! http://localhost:8317/v1/models 응답 없음 (docker logs cli-proxy-api 확인)" >&2
  fi
fi
