---
description: experiments.jsonl을 분석하여 궤적 리포트를 출력한다. --update 옵션으로 아우터 루프 전략 업데이트를 수동으로 트리거한다.
agent: lab-orchestrator
---

# /lab-analyze $ARGUMENTS

실험 궤적을 분석한다. `--update` 포함 시 아우터 루프 전략 업데이트도 실행.

## 실행

```bash
python scripts/analyze.py --full-report
```

### `--update` 옵션 시

autoresearch 스킬의 **아우터 루프 프로토콜(3장)**을 추가 실행:
1. `python scripts/analyze.py --outer-analysis` → 궤적 JSON 읽기
2. 궤적 판단 (improving / plateauing / stuck)
3. 전략 업데이트 및 `workspace/state.json` 저장
4. `workspace/memory/outer_lessons.jsonl` 기록
