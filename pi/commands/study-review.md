---
description: 챕터 복습 세션 — Verifier/Reinforcer/Curious Student/Scheduler 역할로 4단계 진행
argument-hint: "[챕터명] [단계]"
---
<!-- Args: $1 = [챕터명] (optional, e.g. "01-인덱스-기초"), $2 = [단계] (optional, "blank-recall"|"gap-fill"|"self-lecture"|"schedule") -->
# 챕터 복습 세션

복습은 **이미 배운 것(개념 학습 + 실습)을 굳히는 작업**이다.
현재 cwd에서 `study-{slug}` 프로젝트를 찾고, 지정 챕터의 `review/`에서 진행한다.

## 인자 동작

- 인자 없음: 가장 복습 시점이 지난 챕터를 찾는다 (`schedule.md`의 다음 회고일 기준).
- `$1` 지정 (`01` / `01-인덱스-기초`): 해당 챕터. 숫자만 오면 `ch-{숫자}-*` glob.
- `$2` 지정: 해당 복습 단계로 바로 점프. 가능한 값: `blank-recall`, `gap-fill`, `self-lecture`, `schedule`.

## ⚠️ 스코프 가드 (가장 중요)

복습의 모든 피드백은 **해당 챕터의 본 학습 범위**로 한정한다.
범위 = `ch-{slug}/README.md` + `diagnosis.md` + `lab/` 산출물에서 실제 다룬 내용.

빈틈을 두 종류로 **명시 분류**한다:

| 종류 | 의미 | 에이전트 대응 |
|------|------|--------------|
| **회상 누락 (recall gap)** | 배웠지만 기억 못함 | 복습 안에서 해결 → `gap-fill.md` |
| **학습 누락 (learning gap)** | 애초에 본 학습에서 안 다룸 | 복습 아님 → `learning-gaps.md`에 기록, "본 학습으로 돌아가야 합니다" 안내 |

→ 에이전트가 본 적 없는 사실을 "네가 까먹은 것"처럼 피드백하면 안 된다.
그건 복습이 아니라 환각이 학습자 약점으로 둔갑하는 것이다. 의심되면 무조건 `learning-gaps.md`로.

## 복습 단계별 에이전트 역할

### 1. blank-recall — Agent = 검증자 (Verifier)
- 학습자가 챕터를 덮고 핵심 개념을 백지에 적는다. 에이전트가 대신 적지 않는다.
- 에이전트는 `concept`/`lab` 원본과 대조해 **기대 목록(expected list)**을 제시한다.
- 누락/오개념을 마킹한다. 이때 범위 밖이면 `learning-gaps.md`로 보낸다.
- 결과를 `blank-recall.md`에 기록: 적은 것 vs 기대 목록 vs 차이.

### 2. gap-fill — Agent = 보강자 (Reinforcer)
- `blank-recall.md`의 **회상 누락(recall gap)만** 타겟. 전체 재독 금지.
- 누락 항목별로 미니 설명 1개 + 연습문제 1~2개를 생성한다.
- 학습 누락(learning gap)은 여기서 다루지 않는다 → `learning-gaps.md` 유지.
- 결과를 `gap-fill.md`에 기록.

### 3. self-lecture — Agent = 호기심 많은 학생 (Curious Student) ★ 핵심
- 학습자가 설명한다. 에이전트는 **초보 학생 역할**로 "왜요?", "그러면 이 경우엔 어떻게 되나요?" 위성 질문을 던진다.
- 손웨이빙(대충 넘기기), 오개념, 논리 비약을 잡아낸다.
- 질문은 **본 학습 범위 내에서만**. 범위 밖을 묻지 않는다. (벗어나면 `learning-gaps.md`)
- 막힌 지점이 진짜 빈틈 → `gap-fill.md`로 회귀 루프.
- 대화 요약을 `self-lecture.md`에 기록: 어디서 막혔는지, 어떤 질문이 빈틈을 드러냈는지.

### 4. schedule — Agent = 스케줄러 (Scheduler)
- 분산 반복 일정을 `schedule.md`에 기록: 3일 / 1주 / 2주 뒤 회고.
- **매 회고마다 새 질문(FRESH)을 생성**한다. 같은 문제를 반복하지 않는다 — 문제를 외우면 복습 효과가 사라진다.
- 직전 회고 성과에 따라 간격을 조정: 약하면 간격을 줄이고, 강하면 늘린다.
- 다음 회고일을 안내하고 종료한다.

## 종료 조건

- 4단계 완료 → "이번 회고 완료, 다음 회고일: YYYY-MM-DD" 안내.
- `learning-gaps.md`에 항목이 생겼으면 → "**이건 복습이 아니라 본 학습 누락입니다. `/study-chapter {slug}`로 돌아가 해당 개념을 먼저 배우세요.**" 명시.
