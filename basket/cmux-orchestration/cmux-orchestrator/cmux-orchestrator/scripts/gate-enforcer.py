#!/usr/bin/env python3
"""gate-enforcer.py — HARD GATE 강제 실행기

PostToolUse/UserPromptSubmit 훅에서 호출.
GATE 위반 감지 시 additionalContext로 ⛔ BLOCKED 메시지 주입.

Usage (hook):
  python3 gate-enforcer.py --check-surfaces    # WORKING surface 감지
  python3 gate-enforcer.py --check-all         # 전체 GATE 검증
"""

import json
import subprocess
import sys
import os
from pathlib import Path

EAGLE_STATUS = Path("/tmp/cmux-eagle-status.json")
SPECKIT_TRACKER = Path("/tmp/cmux-speckit-tracker.json")
DISPATCH_REGISTRY = Path("/tmp/cmux-dispatch-registry.json")
VIOLATIONS_LOG = Path("/tmp/cmux-gate-violations.log")


def run_cmd(cmd: str, timeout: int = 5) -> str:
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ""


def check_working_surfaces() -> list[str]:
    """eagle 상태에서 WORKING surface 목록 반환."""
    # 먼저 eagle 갱신
    eagle_script = Path(__file__).resolve().parent / "eagle_watcher.sh"
    if eagle_script.exists():
        run_cmd(f"bash {eagle_script} --once > /dev/null 2>&1", timeout=10)

    if not EAGLE_STATUS.exists():
        return []

    try:
        data = json.loads(EAGLE_STATUS.read_text())
        working = []
        for sid, info in data.get("surfaces", {}).items():
            if info.get("status") == "WORKING":
                working.append(f"surface:{sid} ({info.get('ai', 'unknown')})")
        return working
    except Exception:
        return []


def check_error_surfaces() -> list[str]:
    """eagle 상태에서 ERROR surface 목록 반환."""
    if not EAGLE_STATUS.exists():
        return []
    try:
        data = json.loads(EAGLE_STATUS.read_text())
        errors = []
        for sid, info in data.get("surfaces", {}).items():
            if info.get("status") == "ERROR":
                errors.append(f"surface:{sid} ({info.get('ai', 'unknown')})")
        return errors
    except Exception:
        return []


def check_waiting_surfaces() -> list[str]:
    """eagle 상태에서 WAITING surface 목록 반환."""
    if not EAGLE_STATUS.exists():
        return []
    try:
        data = json.loads(EAGLE_STATUS.read_text())
        waiting = []
        for sid, info in data.get("surfaces", {}).items():
            if info.get("status") == "WAITING":
                waiting.append(f"surface:{sid} ({info.get('ai', 'unknown')})")
        return waiting
    except Exception:
        return []


def auto_capture_surfaces():
    """모든 surface의 화면을 /tmp/cmux-capture-*.txt에 저장 (cmux capture-pane 활용)."""
    if not EAGLE_STATUS.exists():
        return
    try:
        data = json.loads(EAGLE_STATUS.read_text())
        for sid in data.get("surfaces", {}):
            output = run_cmd(f"cmux read-screen --surface surface:{sid} --scrollback --lines 30", timeout=5)
            if output:
                Path(f"/tmp/cmux-capture-s{sid}.txt").write_text(output)
    except Exception:
        pass


def register_dispatch(surfaces: list[str], task_label: str = ""):
    """디스패치된 surface 목록을 레지스트리에 등록."""
    data = {"dispatched": {}, "created_at": "", "task": task_label}
    if DISPATCH_REGISTRY.exists():
        try:
            data = json.loads(DISPATCH_REGISTRY.read_text())
        except Exception:
            pass

    from datetime import datetime
    now = datetime.now().isoformat()
    for sid in surfaces:
        if sid not in data.get("dispatched", {}):
            data.setdefault("dispatched", {})[sid] = {
                "status": "pending",
                "dispatched_at": now,
                "done_at": None,
            }
    data["created_at"] = data.get("created_at") or now
    data["task"] = task_label or data.get("task", "")
    DISPATCH_REGISTRY.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return data


def check_dispatch_collection() -> tuple[list[str], list[str], list[str]]:
    """디스패치 레지스트리에서 수집 상태 확인.

    Returns:
        (done_list, pending_list, stalled_list)
    """
    if not DISPATCH_REGISTRY.exists():
        return [], [], []

    try:
        data = json.loads(DISPATCH_REGISTRY.read_text())
    except Exception:
        return [], [], []

    dispatched = data.get("dispatched", {})
    if not dispatched:
        return [], [], []

    done_list = []
    pending_list = []
    stalled_list = []

    for sid, info in dispatched.items():
        if info.get("status") == "done":
            done_list.append(sid)
            continue

        # cmux read-screen으로 DONE 확인
        screen = run_cmd(
            f"cmux read-screen --surface {sid} --scrollback --lines 100 2>/dev/null",
            timeout=8,
        )
        if not screen:
            stalled_list.append(sid)
            continue

        # DONE: 키워드 확인 — 다양한 완료 패턴 지원
        DONE_MARKERS = [
            "DONE:", "DONE :", "✅ 조사 완료", "✅ 조사완료", "조사 완료",
            "✅ 구현 완료", "✅ 작업 완료", "✅ 완료",
            "DONE 요약", "최종 DONE", "TASK COMPLETE",
            "passed:", "PASSED", "finished",
            "12_Research 폴더에", "저장하시겠습니까",  # 조사 완료 후 저장 질문
        ]
        has_done = any(marker in screen for marker in DONE_MARKERS)
        if has_done:
            info["status"] = "done"
            from datetime import datetime
            info["done_at"] = datetime.now().isoformat()
            done_list.append(sid)
        else:
            # 타임아웃 체크: 등록 후 15분 이상 경과 시 STALLED
            from datetime import datetime
            dispatched_at = info.get("dispatched_at", "")
            if dispatched_at:
                try:
                    dt = datetime.fromisoformat(dispatched_at)
                    elapsed = (datetime.now() - dt).total_seconds()
                    if elapsed > 900:  # 15분
                        stalled_list.append(sid)
                        info["status"] = "stalled"
                        info["stalled_reason"] = f"No DONE after {int(elapsed)}s"
                        continue
                except Exception:
                    pass
            pending_list.append(sid)

    # 업데이트 저장
    DISPATCH_REGISTRY.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return done_list, pending_list, stalled_list


def clear_dispatch():
    """디스패치 레지스트리 초기화 (라운드 완료 후)."""
    if DISPATCH_REGISTRY.exists():
        DISPATCH_REGISTRY.unlink()


def check_gate0_violation() -> list[str]:
    """GATE 0: 미수집 surface가 있으면 경고 반환."""
    done, pending, stalled = check_dispatch_collection()
    warnings = []
    if pending or stalled:
        total = len(done) + len(pending) + len(stalled)
        warnings.append(
            f"⛔ HARD GATE 0: {len(pending)+len(stalled)}/{total} surface 미수집! "
            f"결론/구현/종합 진행 금지."
        )
        if pending:
            warnings.append(f"  ⏳ 대기 중: {', '.join(pending)}")
        if stalled:
            warnings.append(f"  ⚠️ 응답 없음: {', '.join(stalled)}")
        warnings.append("  → cmux read-screen으로 각 surface 확인 → 대기 또는 재배정 필수")
    return warnings


def check_speckit_incomplete() -> list[str]:
    """speckit tracker에서 미완료 태스크 목록 반환."""
    if not SPECKIT_TRACKER.exists():
        return []
    try:
        data = json.loads(SPECKIT_TRACKER.read_text())
        incomplete = []
        for task_id, info in data.get("tasks", {}).items():
            if info.get("status") != "done":
                incomplete.append(f"{task_id}: {info.get('description', '?')[:40]}")
        return incomplete
    except Exception:
        return []


def main():
    if len(sys.argv) < 2:
        sys.exit(0)

    mode = sys.argv[1]
    warnings = []

    # --- 디스패치 등록 CLI ---
    if mode == "--register":
        # python3 gate-enforcer.py --register surface:1 surface:2 surface:5 --task "조사"
        surfaces = []
        task_label = ""
        i = 2
        while i < len(sys.argv):
            if sys.argv[i] == "--task" and i + 1 < len(sys.argv):
                task_label = sys.argv[i + 1]
                i += 2
            else:
                surfaces.append(sys.argv[i])
                i += 1
        data = register_dispatch(surfaces, task_label)
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return

    if mode == "--clear-dispatch":
        clear_dispatch()
        print("✅ 디스패치 레지스트리 초기화 완료")
        return

    if mode == "--check-dispatch":
        done, pending, stalled = check_dispatch_collection()
        result = {
            "done": done, "pending": pending, "stalled": stalled,
            "all_collected": len(pending) == 0 and len(stalled) == 0,
            "total": len(done) + len(pending) + len(stalled),
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    # --- 기존 체크 모드 ---
    if mode in ("--check-surfaces", "--check-all"):
        auto_capture_surfaces()

        # GATE 0: 디스패치 수집 완료 확인
        gate0 = check_gate0_violation()
        if gate0:
            warnings.extend(gate0)

        working = check_working_surfaces()
        if working:
            warnings.append(f"⛔ GATE 1 경고: {len(working)}개 surface 아직 WORKING 중!")
            for w in working:
                warnings.append(f"  → {w}")
            warnings.append("  → 완료 대기 필수. 커밋/종료/직접코딩 금지.")

        errors = check_error_surfaces()
        if errors:
            warnings.append(f"⚠️ {len(errors)}개 surface ERROR 상태:")
            for e in errors:
                warnings.append(f"  → {e}")
            warnings.append("  → cmux read-screen으로 에러 원인 확인 필요.")

        waiting = check_waiting_surfaces()
        if waiting:
            warnings.append(f"⚠️ {len(waiting)}개 surface WAITING (질문 대기):")
            for w in waiting:
                warnings.append(f"  → {w}")
            warnings.append("  → cmux read-screen 후 cmux send로 답변 필요.")

    if mode == "--check-all":
        incomplete = check_speckit_incomplete()
        if incomplete:
            warnings.append(f"⛔ GATE 5 경고: {len(incomplete)}개 speckit 태스크 미완료!")
            for t in incomplete:
                warnings.append(f"  → {t}")
            warnings.append("  → 미완료 태스크 재배정 필수. 종료 금지.")

    if warnings:
        print("\n".join(warnings))
        # 위반 이력 로깅 (자가개선용)
        try:
            from datetime import datetime, timezone
            with open(str(VIOLATIONS_LOG), "a") as f:
                ts = datetime.now(timezone.utc).isoformat()
                for w in warnings:
                    if "⛔" in w:
                        f.write(f"{ts} GATE_VIOLATION: {w}\n")
        except Exception:
            pass


if __name__ == "__main__":
    main()
