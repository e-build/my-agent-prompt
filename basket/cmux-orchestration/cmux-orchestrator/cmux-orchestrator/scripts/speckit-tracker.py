#!/usr/bin/env python3
"""speckit-tracker.py — Speckit 태스크 추적기

디스패치 시 태스크 등록, 수집 시 완료 마킹.
gate-enforcer.py가 이 파일을 읽어 미완료 태스크를 감지.

Usage:
  python3 speckit-tracker.py --init "Round 12"           # 라운드 초기화
  python3 speckit-tracker.py --add T1 S3 "epub_export"   # 태스크 등록
  python3 speckit-tracker.py --done T1                    # 완료 마킹
  python3 speckit-tracker.py --fail T1 "sandbox 제약"     # 실패 마킹
  python3 speckit-tracker.py --reassign T1 S1             # 재배정
  python3 speckit-tracker.py --status                     # 상태 출력
  python3 speckit-tracker.py --gate                       # GATE 5 검증
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

TRACKER_FILE = Path("/tmp/cmux-speckit-tracker.json")


def load() -> dict:
    if TRACKER_FILE.exists():
        return json.loads(TRACKER_FILE.read_text())
    return {"round": "", "tasks": {}, "created_at": ""}


def save(data: dict):
    """Atomic write: temp 파일에 쓰고 rename (POSIX atomic)."""
    import tempfile, shutil
    content = json.dumps(data, ensure_ascii=False, indent=2)
    with tempfile.NamedTemporaryFile(
        mode='w', dir=TRACKER_FILE.parent, delete=False, suffix='.tmp'
    ) as f:
        f.write(content)
        tmp_path = f.name
    shutil.move(tmp_path, str(TRACKER_FILE))


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    if len(sys.argv) < 2:
        print("Usage: speckit-tracker.py --init|--add|--done|--fail|--reassign|--status|--gate")
        return

    cmd = sys.argv[1]
    data = load()

    if cmd == "--init":
        round_name = sys.argv[2] if len(sys.argv) > 2 else "unknown"
        data = {"round": round_name, "tasks": {}, "created_at": now_iso()}
        save(data)
        print(f"Tracker initialized: {round_name}")

    elif cmd == "--add":
        if len(sys.argv) < 5:
            print("Usage: --add TASK_ID SURFACE_ID DESCRIPTION")
            return
        tid, sid, desc = sys.argv[2], sys.argv[3], sys.argv[4]
        # 유효성 검증
        import re
        if not tid or len(tid) > 30:
            print(f"❌ Invalid TASK_ID: '{tid}' (1-30 chars)")
            return
        if tid in data.get("tasks", {}):
            print(f"⚠️ TASK_ID '{tid}' already exists — use --fail + --reassign for rework")
            return
        if not re.match(r'^surface:\d+$', sid):
            print(f"❌ Invalid SURFACE_ID: '{sid}' (must be 'surface:N')")
            return
        if not desc:
            print("❌ DESCRIPTION cannot be empty")
            return
        data["tasks"][tid] = {
            "surface": sid,
            "description": desc[:200],
            "status": "pending",
            "assigned_at": now_iso(),
        }
        save(data)
        print(f"Added: {tid} → {sid}: {desc[:50]}")

    elif cmd == "--done":
        tid = sys.argv[2] if len(sys.argv) > 2 else ""
        if tid in data["tasks"]:
            data["tasks"][tid]["status"] = "done"
            data["tasks"][tid]["completed_at"] = now_iso()
            save(data)
            print(f"Done: {tid}")
        else:
            print(f"Task not found: {tid}")

    elif cmd == "--fail":
        tid = sys.argv[2] if len(sys.argv) > 2 else ""
        reason = sys.argv[3] if len(sys.argv) > 3 else "unknown"
        if tid in data["tasks"]:
            data["tasks"][tid]["status"] = "failed"
            data["tasks"][tid]["reason"] = reason
            save(data)
            print(f"Failed: {tid} — {reason}")

    elif cmd == "--reassign":
        tid = sys.argv[2] if len(sys.argv) > 2 else ""
        new_surface = sys.argv[3] if len(sys.argv) > 3 else ""
        if tid in data["tasks"]:
            old = data["tasks"][tid]["surface"]
            data["tasks"][tid]["surface"] = new_surface
            data["tasks"][tid]["status"] = "reassigned"
            data["tasks"][tid]["reassigned_at"] = now_iso()
            save(data)
            print(f"Reassigned: {tid} {old} → {new_surface}")

    elif cmd == "--status":
        total = len(data.get("tasks", {}))
        done = sum(1 for t in data.get("tasks", {}).values() if t["status"] == "done")
        failed = sum(1 for t in data.get("tasks", {}).values() if t["status"] == "failed")
        pending = total - done - failed
        print(f"Round: {data.get('round', '?')}")
        print(f"Tasks: {total} (done:{done} failed:{failed} pending:{pending})")
        for tid, info in data.get("tasks", {}).items():
            mark = "✅" if info["status"] == "done" else "❌" if info["status"] == "failed" else "⏳"
            print(f"  {mark} {tid} [{info['surface']}] {info['description'][:40]}")

    elif cmd == "--gate":
        incomplete = [
            tid for tid, info in data.get("tasks", {}).items()
            if info["status"] not in ("done",)
        ]
        if incomplete:
            print(f"⛔ GATE 5 BLOCKED: {len(incomplete)} 미완료 태스크")
            for tid in incomplete:
                info = data["tasks"][tid]
                print(f"  → {tid} [{info['surface']}] {info['status']}: {info['description'][:40]}")
            sys.exit(1)
        else:
            total = len(data.get("tasks", {}))
            print(f"✅ GATE 5 PASSED: {total}/{total} 태스크 완료")
            sys.exit(0)


if __name__ == "__main__":
    main()
