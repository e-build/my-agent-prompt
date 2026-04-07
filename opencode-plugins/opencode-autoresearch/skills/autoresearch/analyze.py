#!/usr/bin/env python3
"""
analyze.py — Bilevel Autoresearch 실험 분석 도구

사용법:
  python scripts/analyze.py --tail 10          # 최근 N개 실험 출력
  python scripts/analyze.py --summary          # 요약 통계
  python scripts/analyze.py --full-report      # 전체 분석 리포트
  python scripts/analyze.py --outer-analysis   # 아우터 루프용 궤적 분석 (JSON)
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

EXPERIMENTS_FILE = Path("workspace/experiments.jsonl")
STATE_FILE = Path("workspace/state.json")
CONFIG_FILE = Path("autoresearch.yaml")


def load_experiments() -> list[dict]:
    if not EXPERIMENTS_FILE.exists():
        return []
    experiments = []
    with EXPERIMENTS_FILE.open() as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    experiments.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"[warn] JSON parse error: {e}", file=sys.stderr)
    return experiments


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    with STATE_FILE.open() as f:
        return json.load(f)


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {}
    try:
        import yaml  # type: ignore
        with CONFIG_FILE.open() as f:
            return yaml.safe_load(f) or {}
    except ImportError:
        return {}


def sparkline(values: list[float], width: int = 20) -> str:
    if not values:
        return ""
    chars = "▁▂▃▄▅▆▇█"
    min_v, max_v = min(values), max(values)
    if min_v == max_v:
        return chars[3] * min(len(values), width)
    normalized = [(v - min_v) / (max_v - min_v) for v in values[-width:]]
    return "".join(chars[int(n * (len(chars) - 1))] for n in normalized)


def fmt(value: Any) -> str:
    return f"{value:.2f}" if isinstance(value, float) else str(value)


def get_primary(config: dict) -> str:
    return config.get("metrics", {}).get("primary", {}).get("name", "primary_metric")


def get_direction(config: dict) -> str:
    return config.get("metrics", {}).get("primary", {}).get("optimize", "minimize")


def print_tail(experiments: list, n: int, config: dict) -> None:
    primary = get_primary(config)
    recent = experiments[-n:]
    print(f"\n최근 {len(recent)}개 실험:\n")
    print(f"{'ID':>4}  {'사이클':>6}  {'상태':>12}  {primary:>18}  설명")
    print("─" * 72)
    labels = {"keep": "✓ keep", "discard": "✗ discard", "error": "! error", "baseline": "○ baseline"}
    for exp in recent:
        val = fmt(exp.get("metrics", {}).get(primary, "N/A"))
        status = labels.get(exp.get("status", "?"), exp.get("status", "?"))
        print(f"{exp.get('id', '?'):>4}  {exp.get('inner_cycle', '?'):>6}  {status:>12}  {val:>18}  {exp.get('description', '')[:35]}")
    print()


def print_summary(experiments: list, config: dict) -> None:
    if not experiments:
        print("실험 데이터 없음")
        return
    primary = get_primary(config)
    direction = get_direction(config)
    non_bl = [e for e in experiments if e.get("status") != "baseline"]
    keeps = [e for e in non_bl if e.get("status") == "keep"]
    discards = [e for e in non_bl if e.get("status") == "discard"]
    errors = [e for e in non_bl if e.get("status") == "error"]
    total = len(non_bl)
    print("\n요약 통계")
    print("─" * 40)
    print(f"  총 사이클   : {total}")
    if total:
        print(f"  keep        : {len(keeps)} ({len(keeps)/total*100:.1f}%)")
        print(f"  discard     : {len(discards)} ({len(discards)/total*100:.1f}%)")
    print(f"  error       : {len(errors)}")
    keep_metrics = [e["metrics"][primary] for e in keeps if e.get("metrics", {}).get(primary) is not None]
    if keep_metrics:
        best = min(keep_metrics) if direction == "minimize" else max(keep_metrics)
        bl = next((e.get("metrics", {}).get(primary) for e in experiments if e.get("status") == "baseline"), None)
        if bl:
            pct = (bl - best) / bl * 100 if direction == "minimize" else (best - bl) / bl * 100
            print(f"  베스트 {primary}: {best:.2f} (baseline 대비 {pct:+.1f}%)")
        else:
            print(f"  베스트 {primary}: {best:.2f}")
    print()


def print_full_report(experiments: list, state: dict, config: dict) -> None:
    primary = get_primary(config)
    direction = get_direction(config)
    print("\n" + "━" * 50)
    print(" lab autoresearch — 전체 분석 리포트")
    print("━" * 50)
    print_summary(experiments, config)
    non_bl = [e for e in experiments if e.get("status") not in ("baseline",)]
    vals = [e["metrics"][primary] for e in non_bl if e.get("metrics", {}).get(primary) is not None]
    if vals:
        print(f"  {primary} 추세: {sparkline(vals)}")
        print(f"  (시작: {vals[0]:.2f} → 현재: {vals[-1]:.2f})\n")
    # 전략별 성과
    strategies: dict[str, dict] = {}
    for exp in non_bl:
        s = exp.get("strategy", "unknown")
        strategies.setdefault(s, {"keep": 0, "total": 0})
        strategies[s]["total"] += 1
        if exp.get("status") == "keep":
            strategies[s]["keep"] += 1
    if strategies:
        print("  전략별 성과:")
        for s, st in strategies.items():
            rate = st["keep"] / st["total"] * 100 if st["total"] else 0
            print(f"    {s:25s}: keep {st['keep']:3d}/{st['total']:3d} ({rate:.0f}%)")
        print()
    # Top 5 개선
    keeps = sorted(
        [e for e in experiments if e.get("status") == "keep" and e.get("metrics", {}).get(primary) is not None],
        key=lambda e: e["metrics"][primary], reverse=(direction == "maximize")
    )[:5]
    if keeps:
        print(f"  효과적 변경 Top 5 ({primary}):")
        for i, exp in enumerate(keeps, 1):
            print(f"    {i}. [{exp['metrics'][primary]:.2f}] {exp.get('description', '')[:50]}")
        print()
    tabu = state.get("tabu_list", [])
    if tabu:
        print(f"  타부 리스트 ({len(tabu)}개):")
        for item in tabu:
            print(f"    - {item}")
        print()
    print("━" * 50)


def print_outer_analysis(experiments: list, state: dict, config: dict) -> None:
    cfg = load_config()
    window = cfg.get("outer_loop", {}).get("convergence_window", 5)
    non_bl = [e for e in experiments if e.get("status") not in ("baseline",)]
    recent = non_bl[-window:]
    if not recent:
        print(json.dumps({"trajectory": "unknown", "keep_rate": 0.0, "window": 0}))
        return
    keep_count = sum(1 for e in recent if e.get("status") == "keep")
    keep_rate = keep_count / len(recent)
    trajectory = "improving" if keep_rate >= 0.3 else ("plateauing" if keep_rate >= 0.1 else "stuck")
    primary = get_primary(config)
    recent_metrics = [e["metrics"][primary] for e in recent if e.get("metrics", {}).get(primary) is not None]
    print(json.dumps({
        "trajectory": trajectory,
        "keep_rate": round(keep_rate, 3),
        "window": len(recent),
        "keep_count": keep_count,
        "inner_cycle": state.get("inner_cycle", 0),
        "outer_cycle": state.get("outer_cycle", 0),
        "current_strategy": state.get("strategy", "unknown"),
        "recent_primary_metrics": recent_metrics,
        "tabu_count": len(state.get("tabu_list", [])),
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Autoresearch 실험 분석 도구")
    parser.add_argument("--tail", type=int, metavar="N")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--full-report", action="store_true")
    parser.add_argument("--outer-analysis", action="store_true")
    args = parser.parse_args()

    experiments = load_experiments()
    state = load_state()
    config = load_config()

    if args.outer_analysis:
        print_outer_analysis(experiments, state, config)
        return
    if args.full_report:
        print_full_report(experiments, state, config)
        return
    if args.tail:
        print_tail(experiments, args.tail, config)
    if args.summary:
        print_summary(experiments, config)
    if not any([args.tail, args.summary, args.full_report, args.outer_analysis]):
        print_tail(experiments, 10, config)
        print_summary(experiments, config)


if __name__ == "__main__":
    main()
