#!/bin/bash
# cmux-orchestrator 설치 스크립트 — 대화형
# 다른 AI 또는 사용자가 실행하면 자동으로 설정 완료
set -euo pipefail

echo "======================================"
echo "  cmux-orchestrator 설치 마법사 v1.0"
echo "======================================"
echo ""

# --- Step 1: 전제 조건 확인 ---
echo "[1/5] 전제 조건 확인..."

# cmux 확인
if ! command -v cmux &>/dev/null; then
  echo "  ❌ cmux CLI가 설치되어 있지 않습니다."
  echo "     cmux를 먼저 설치하세요: https://openclaw.ai"
  echo "     설치 후 이 스크립트를 다시 실행하세요."
  exit 1
fi
echo "  ✅ cmux: $(cmux --version 2>/dev/null || echo 'installed')"

# python3 확인
if ! command -v python3 &>/dev/null; then
  echo "  ❌ python3가 필요합니다."
  exit 1
fi
echo "  ✅ python3: $(python3 --version 2>/dev/null)"

# Claude Code 확인
if [ ! -d "$HOME/.claude" ]; then
  echo "  ❌ Claude Code가 설치되어 있지 않습니다 (~/.claude 없음)."
  exit 1
fi
echo "  ✅ Claude Code: ~/.claude 존재"

echo ""

# --- Step 2: 설치 경로 결정 ---
echo "[2/5] 설치 경로 설정..."

variable_skill_dir="$HOME/.claude/skills/cmux-orchestrator"
variable_agents_dir="$HOME/.claude/agents"

echo "  스킬 설치 경로: $variable_skill_dir"
echo "  에이전트 설치 경로: $variable_agents_dir"
echo ""
read -p "  이 경로에 설치하시겠습니까? (Y/n): " variable_confirm
variable_confirm=${variable_confirm:-Y}
if [[ ! "$variable_confirm" =~ ^[Yy] ]]; then
  read -p "  커스텀 스킬 경로를 입력하세요: " variable_skill_dir
fi

# --- Step 3: 파일 복사 ---
echo ""
echo "[3/5] 파일 설치 중..."

# 스킬 디렉토리 생성
mkdir -p "$variable_skill_dir"/{scripts,agents,commands,config}
mkdir -p "$variable_agents_dir"

# 스크립트 위치 (install.sh와 같은 디렉토리)
variable_src_dir="$(cd "$(dirname "$0")" && pwd)/cmux-orchestrator"

if [ ! -d "$variable_src_dir" ]; then
  echo "  ❌ cmux-orchestrator 디렉토리를 찾을 수 없습니다."
  echo "     이 스크립트를 zip 압축 해제한 폴더에서 실행하세요."
  exit 1
fi

# 파일 복사
cp "$variable_src_dir/SKILL.md" "$variable_skill_dir/"
cp "$variable_src_dir/README.md" "$variable_skill_dir/" 2>/dev/null || true
cp "$variable_src_dir/scripts/"* "$variable_skill_dir/scripts/"
cp "$variable_src_dir/agents/"* "$variable_skill_dir/agents/"
cp "$variable_src_dir/commands/"* "$variable_skill_dir/commands/"
cp "$variable_src_dir/config/"* "$variable_skill_dir/config/" 2>/dev/null || true

# 실행 권한
chmod +x "$variable_skill_dir/scripts/"*.sh
chmod +x "$variable_skill_dir/scripts/"*.py

# 에이전트를 ~/.claude/agents/에 복사
for agent_file in "$variable_skill_dir/agents/"*.md; do
  variable_agent_name=$(basename "$agent_file")
  cp "$agent_file" "$variable_agents_dir/$variable_agent_name"
  echo "  ✅ 에이전트 설치: $variable_agent_name"
done

echo "  ✅ 16개 파일 설치 완료"
echo ""

# --- Step 4: Hook 등록 ---
echo "[4/5] Hook 등록..."

variable_settings="$HOME/.claude/settings.json"

# settings.json 백업
if [ -f "$variable_settings" ]; then
  cp "$variable_settings" "${variable_settings}.bak.$(date +%Y%m%d%H%M%S)"
  echo "  📋 기존 settings.json 백업 완료"
fi

# Python으로 settings.json에 Hook 추가
python3 -c "
import json
from pathlib import Path

settings_path = Path('$variable_settings')
if settings_path.exists():
    s = json.loads(settings_path.read_text())
else:
    s = {}

hooks = s.setdefault('hooks', {})
skill_dir = '$variable_skill_dir'

# PreToolUse: gate-blocker (git commit 차단)
pre = hooks.setdefault('PreToolUse', [])
gate_cmd = f'bash {skill_dir}/scripts/gate-blocker.sh'
if not any(gate_cmd in json.dumps(entry) for entry in pre):
    pre.append({
        'matcher': 'Bash',
        'hooks': [{'type': 'command', 'command': gate_cmd, 'timeout': 5000}]
    })
    print('  ✅ PreToolUse: gate-blocker.sh 등록')
else:
    print('  ⏭️  PreToolUse: gate-blocker.sh 이미 등록됨')

# PostToolUse: gate-enforcer (GATE 위반 감지)
post = hooks.setdefault('PostToolUse', [])
enforcer_cmd = f'python3 {skill_dir}/scripts/gate-enforcer.py --check-surfaces'
if not any('gate-enforcer' in json.dumps(entry) for entry in post):
    post.append({
        'matcher': '',
        'hooks': [{'type': 'command', 'command': enforcer_cmd, 'timeout': 10000}]
    })
    print('  ✅ PostToolUse: gate-enforcer.py 등록')
else:
    print('  ⏭️  PostToolUse: gate-enforcer.py 이미 등록됨')

# SessionStart: orchestra-enforcer (cmux 환경 감지)
session = hooks.setdefault('SessionStart', [])
orch_cmd = f'bash {skill_dir}/scripts/cmux-orchestra-enforcer.sh'
if not any('orchestra-enforcer' in json.dumps(entry) for entry in session):
    session.append({
        'matcher': '',
        'hooks': [{'type': 'command', 'command': orch_cmd, 'timeout': 10000}]
    })
    print('  ✅ SessionStart: cmux-orchestra-enforcer.sh 등록')
else:
    print('  ⏭️  SessionStart: cmux-orchestra-enforcer.sh 이미 등록됨')

# UserPromptSubmit: idle-reminder (IDLE surface 알림)
upsub = hooks.setdefault('UserPromptSubmit', [])
idle_cmd = f'bash {skill_dir}/scripts/cmux-idle-reminder.sh'
if not any('idle-reminder' in json.dumps(entry) for entry in upsub):
    upsub.append({
        'matcher': '',
        'hooks': [{'type': 'command', 'command': idle_cmd, 'timeout': 5000}]
    })
    print('  ✅ UserPromptSubmit: cmux-idle-reminder.sh 등록')
else:
    print('  ⏭️  UserPromptSubmit: cmux-idle-reminder.sh 이미 등록됨')

settings_path.write_text(json.dumps(s, indent=2, ensure_ascii=False))
print('  ✅ settings.json 저장 완료')
"

echo ""

# --- Step 5: 검증 ---
echo "[5/5] 설치 검증..."

# 파일 존재 확인
variable_missing=0
for f in SKILL.md scripts/gate-blocker.sh scripts/gate-enforcer.py scripts/eagle_watcher.sh scripts/speckit-tracker.py scripts/install_agents.sh; do
  if [ ! -f "$variable_skill_dir/$f" ]; then
    echo "  ❌ 누락: $f"
    variable_missing=$((variable_missing + 1))
  fi
done

# 에이전트 확인
for agent in cmux-git.md cmux-reviewer.md cmux-security.md; do
  if [ ! -f "$variable_agents_dir/$agent" ]; then
    echo "  ❌ 에이전트 누락: $agent"
    variable_missing=$((variable_missing + 1))
  fi
done

# Hook 등록 확인
if grep -q "gate-blocker" "$variable_settings" 2>/dev/null; then
  echo "  ✅ Hook: gate-blocker.sh 등록 확인"
else
  echo "  ❌ Hook: gate-blocker.sh 미등록"
  variable_missing=$((variable_missing + 1))
fi

if grep -q "gate-enforcer" "$variable_settings" 2>/dev/null; then
  echo "  ✅ Hook: gate-enforcer.py 등록 확인"
else
  echo "  ❌ Hook: gate-enforcer.py 미등록"
  variable_missing=$((variable_missing + 1))
fi

echo ""
if [ "$variable_missing" -eq 0 ]; then
  echo "======================================"
  echo "  ✅ 설치 완료! 모든 검증 통과"
  echo "======================================"
  echo ""
  echo "  사용법:"
  echo "    1. Claude Code를 실행합니다"
  echo "    2. cmux에서 여러 AI 창을 엽니다"
  echo "    3. /cmux 명령어로 오케스트레이션 시작"
  echo ""
  echo "  주요 명령어:"
  echo "    /cmux             — 전체 상태 확인"
  echo "    /cmux 조사 [주제] — 멀티AI 조사"
  echo "    /cmux 배정 [작업] — 작업 분배"
  echo "    /cmux 수집        — 결과 수집"
  echo "    /cmux 커밋        — 안전 커밋"
else
  echo "======================================"
  echo "  ⚠️ 설치 완료 (경고 ${variable_missing}개)"
  echo "======================================"
  echo "  누락된 항목을 확인하고 수동으로 복구하세요."
fi
