#!/usr/bin/env bash
# install-local.sh — opencode-autoresearch 로컬 설치 스크립트
#
# plugin package 내부 자산을 OpenCode 글로벌 config 디렉토리에 심링크한다.
# npm 배포 전 로컬에서 빠르게 검증할 때 사용한다.
#
# 사용법:
#   bash opencode-plugins/opencode-autoresearch/install-local.sh
#   bash opencode-plugins/opencode-autoresearch/install-local.sh --uninstall

set -e

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_DIR="${HOME}/.config/opencode"

COMMANDS_DIR="${OC_DIR}/commands"
AGENTS_DIR="${OC_DIR}/agents"
SKILLS_DIR="${OC_DIR}/skills"
PLUGINS_DIR="${OC_DIR}/plugins"

# ─────────────────────────────────────────────
# 제거 모드
# ─────────────────────────────────────────────
if [[ "$1" == "--uninstall" ]]; then
  echo "opencode-autoresearch 제거 중..."
  rm -f "${COMMANDS_DIR}/lab-init.md"
  rm -f "${COMMANDS_DIR}/lab-run.md"
  rm -f "${COMMANDS_DIR}/lab-status.md"
  rm -f "${COMMANDS_DIR}/lab-analyze.md"
  rm -f "${AGENTS_DIR}/lab-orchestrator.md"
  rm -rf "${SKILLS_DIR}/autoresearch"
  rm -f "${PLUGINS_DIR}/opencode-autoresearch.js"
  echo "✓ 제거 완료"
  exit 0
fi

# ─────────────────────────────────────────────
# 설치
# ─────────────────────────────────────────────
echo "opencode-autoresearch 로컬 설치 중..."
echo "  소스: ${PACKAGE_DIR}"
echo "  대상: ${OC_DIR}"
echo ""

# 디렉토리 생성
mkdir -p "${COMMANDS_DIR}" "${AGENTS_DIR}" "${SKILLS_DIR}" "${PLUGINS_DIR}"

# Commands 심링크
for cmd in lab-init lab-run lab-status lab-analyze; do
  SRC="${PACKAGE_DIR}/commands/${cmd}.md"
  DST="${COMMANDS_DIR}/${cmd}.md"
  if [[ -L "${DST}" ]]; then
    echo "  (업데이트) /${cmd}"
    ln -sf "${SRC}" "${DST}"
  elif [[ -e "${DST}" ]]; then
    echo "  (경고) ${DST} 이미 존재 (심링크 아님). 건너뜀."
  else
    ln -s "${SRC}" "${DST}"
    echo "  ✓ /${cmd}"
  fi
done

# Agent 심링크
SRC="${PACKAGE_DIR}/agents/lab-orchestrator.md"
DST="${AGENTS_DIR}/lab-orchestrator.md"
if [[ -L "${DST}" ]]; then
  echo "  (업데이트) lab-orchestrator agent"
  ln -sf "${SRC}" "${DST}"
elif [[ -e "${DST}" ]]; then
  echo "  (경고) ${DST} 이미 존재. 건너뜀."
else
  ln -s "${SRC}" "${DST}"
  echo "  ✓ lab-orchestrator agent"
fi

# Skill 심링크 (디렉토리 단위)
SRC="${PACKAGE_DIR}/skills/autoresearch"
DST="${SKILLS_DIR}/autoresearch"
if [[ -L "${DST}" ]]; then
  echo "  (업데이트) autoresearch skill"
  ln -sf "${SRC}" "${DST}"
elif [[ -d "${DST}" ]]; then
  echo "  (경고) ${DST} 이미 존재. 건너뜀."
else
  ln -s "${SRC}" "${DST}"
  echo "  ✓ autoresearch skill"
fi

# Plugin entry 심링크
SRC="${PACKAGE_DIR}/index.js"
DST="${PLUGINS_DIR}/opencode-autoresearch.js"
if [[ -L "${DST}" ]]; then
  echo "  (업데이트) opencode-autoresearch plugin"
  ln -sf "${SRC}" "${DST}"
elif [[ -e "${DST}" ]]; then
  echo "  (경고) ${DST} 이미 존재. 건너뜀."
else
  ln -s "${SRC}" "${DST}"
  echo "  ✓ opencode-autoresearch plugin"
fi

echo ""
echo "✓ 설치 완료!"
echo ""
echo "사용법:"
echo "  /lab-init     — 현재 프로젝트에 autoresearch 초기화"
echo "  /lab-run      — 이너 루프 시작"
echo "  /lab-status   — 실험 상태 확인"
echo "  /lab-analyze  — 궤적 분석 (/lab-analyze --update 로 전략 업데이트)"
echo ""
echo "Codex CLI 설치 (없으면):"
echo "  npm install -g @openai/codex"
