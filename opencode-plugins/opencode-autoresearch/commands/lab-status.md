---
description: 현재 autoresearch 실험 상태를 요약하여 출력한다
---

# /lab-status

현재 실험 상태를 빠르게 확인한다.

## 실행

```bash
python scripts/analyze.py --tail 10 --summary
```

`workspace/state.json`에서 아래 정보를 함께 출력:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 lab autoresearch — 현재 상태
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 이너 사이클  : <N>
 아우터 사이클 : <N>
 현재 전략    : <strategy>
 궤적        : <improving | plateauing | stuck>

 베스트 결과
   <primary_metric>: <value>  (baseline 대비 <N>%)
   커밋: <hash>  설명: <description>

 최근 10 사이클
   keep: <N>  discard: <N>  error: <N>  (keep율 <N>%)

 타부 리스트 (<N>개)
   - <항목>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

`workspace/state.json`이 없으면: "실험이 시작되지 않았습니다. `/lab-init` 후 `/lab-run`을 실행하세요."
