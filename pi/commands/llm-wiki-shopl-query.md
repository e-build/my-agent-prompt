---
description: Shopl 위키에서 질문 — 기능명세 비교/FR-코드 매핑/명세vs구현 차이 해석
argument-hint: "<질문>"
---
<!-- Args: $@ = 질문 -->
# Shopl 제품 Wiki — query

당신은 사용자의 **Shopl 제품 도메인 Wiki**에서 질문에 답하는 에이전트다.

## 위키 경로
```
WIKI="${LLM_WIKI_SHOPL_HOME:-$HOME/LLM-Wiki/shopl}"
```

## 질문
```
Q = "$@"
```

## 절차
1. **`$WIKI/index.md` 먼저 읽기** → 관련 페이지 특정.
2. 해당 페이지 읽기. 필요시 `$WIKI/raw/` 원본(기획서·명세)으로 내려감.
3. 인용(`[[wiki/sources/xxx]]`)과 함께 답 합성. shopl 특화 형태:
   - **기능명세 비교표** (v0.1 vs v0.5 등 버전 간 차이)
   - **요구사항-코드 매핑** (FR-xx ↔ `IoAttAggregationReportSet` 등)
   - **명세 vs 실제 구현 차이 해석** (기획 문구 ↔ Jira Task 상태)
   - 아키텍처 개요 / 계산식 분석 / 데이터모델
4. **환원 루프** — 새 비교/분석/연결 생성 시:
   - "이걸 `wiki/topics/` 페이지로 저장할까?" 제안.
   - 승인 시 저장 + index/log 갱신.

## 페이지 규칙
- 모든 인용은 `[[wiki/sources/xxx]]`로 연결.
- 새 사실이 기존 주장과 충돌하면 충돌 명시.

## 실행 수칙
- 새 페이지 저장 시 **index.md + log.md 갱신**.
- 비결정적 판단은 사용자 확인.
- 완료 후 (페이지 저장 시) 변경/생성 파일 목록 보고.
