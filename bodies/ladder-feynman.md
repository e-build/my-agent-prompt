# ladder-feynman

방금 읽은/배운 주제를 **파인만 4단계 루프**로 20분 안에 굳히는 학습 세션.
기존 ladder-* 패밀리의 메커니즘을 **참조(reference)로 재사용**하고,
Feynman만의 4개 디테일(STRONG/WEAK/WRONG·모범답안 선공개·재학습 1순위·비유한계 명시)을 얹는다.

> ladder-debug-me의 오류 분류, ladder-quiz-me의 인과질문, ladder-explain의 제1원리 해설,
> ladder-summarize의 압축 원칙을 재발명하지 않고 위에 쌓는다.

```
/ladder-feynman <주제>
```

---

## [A] 핵심 원칙

1. **학습자 생산 강제**: AI 먼저 모범 → 학습자가 직접 자기 말로 타이핑 → AI 채점. 생산 전엔 next phase 금지.
2. **12세 기준**: 모든 설명 일상어. jargon 그 자리에서 분해.
3. **5개 하중받침**: 주제의 50개 사실 중 5개만 뽑는다.
4. **ladder-debug-me 오류 분류 기반 + STRONG/WEAK/WRONG + 재학습 1순위**
5. **스코프 가드**: 첨부 소스(@파일) 또는 표준 정설 범위로 채점 한정. 범위 밖은 `[범위 밖]`으로 표시.

---

## [B] 4페이즈 루프

### Phase 1 — 개념 지도 (Concept Map)
Read `bodies/ladder-explain.md`의 원칙을 따르되 **6층 바텀업 금지**.
주제에서 5개 하중받침 아이디어만 선별. 각각: 일상어 정의 1문장 · 왜 중요한가 · 이해 확인 질문 1개.

### Phase 2 — 12세 테스트 (12-Year-Old Test)
ladder-quiz-me의 문제-답변 방식과 달리, **AI가 먼저 모범답안 제시** (12세 말 + 일상예시).
그 뒤 학습자에게 "직접 5개를 타이핑하세요" → 🛑 정지. Phase 3으로 넘어가지 않는다.
> "모범답안 읽기만 하면 80% 잃는다. 직접 치는 순간이 학습이다."

### Phase 3 — 빈틈 찾기 (Gap Finder)
Read `bodies/ladder-debug-me.md`의 분석 원칙(오류 분류 5가지·인과체인 교정)을 따르되

**Feynman 추가**:
1. 각 아이디어: **STRONG / WEAK / WRONG** 판정
2. WEAK·WRONG: 정확히 무엇을 헷갈렸는지 구체적으로 (정중하게 넘기지 않음)
3. 정정: 12세 말, **이전과 다른 비유**로
4. 확인 질문 1개
5. 마무리: **"가장 먼저 재학습할 1개 아이디어"** (최고 레버리지)

> ⏸ 2분 재학습 후 "계속" → Phase 4.

### Phase 4 — 비유 잠금 (Analogy Lock)
Read `bodies/ladder-summarize.md`의 압축 원칙을 따르되 **다른 출력 구조**:

각 아이디어마다 비유 2개 (일상생활 + 성인경험).
각 비유: 작동하는 지점 + **무너지는 지점** (★ 비유의 한계를 명시하는 게 핵심).

마무리: **"내일 아침 다시 읽을 한 문장 요약 5개"** — 아이디어당 1문장.

---

## [C] 금지 사항

- Phase 2 생산 없이 Phase 3 진입 금지
- 채점 얼버무림 금지 (WEAK/WRONG = 구체적으로)
- 같은 비유를 Phase 2 모범답안과 Phase 3 정정에 재사용 금지
- 비유 한계 생략 금지
- 스코프 가드 위반 (소스 밖을 학습자 약점으로 둔갑 금지)

---

## [D] Next Steps

| 다음 행동 | 커맨드 |
|---|---|
| 한 아이디어를 제1원리부터 깊이 파고 싶다 | `/ladder-explain` |
| 더 많은 인과/반사실 질문으로 테스트 | `/ladder-quiz-me` |
| 압축·비교·코드 | `/ladder-summarize` / `/ladder-compare` / `/ladder-show-code` |
| 선행 개념 진단 | `/ladder-find-gaps` |
