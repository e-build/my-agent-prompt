---
description: 챕터 학습 이어가기 — 현재 단계 파악 후 안 한 단계부터 진행
argument-hint: "[챕터명] [단계]"
---
<!-- Args: $1 = [챕터명] (optional, e.g. "01-인덱스-기초" or "02"), $2 = [단계] (optional, "diagnosis"|"lab"|"test"|"review") -->
# 챕터 학습 세션

현재 cwd에서 `study-{slug}` 프로젝트를 찾고, 챕터 상태를 확인한 뒤
안 한 단계부터 이어서 진행한다.

## 인자 동작

- 인자 없음: 현재 프로젝트의 챕터 중 가장 덜 진행된 것을 찾아 이어간다.
- `$1` 지정 (예: `02` / `01-인덱스-기초`): 해당 챕터를 대상으로 한다. 숫자만 오면 `ch-{숫자}-*` glob으로 찾는다.
- `$2` 지정: 해당 단계로 바로 점프한다. 가능한 값: `diagnosis`, `lab`, `test`, `review`.

## 단계별 상태 감지 규칙

1. **diagnosis**: `ch-{slug}/diagnosis.md`가 없거나 비어있으면 → 사전평가부터
2. **개념 학습**: diagnosis.md에 결과 기록이 있으면 → 사전평가 완료. 개념 학습 시작
3. **lab**: `ch-{slug}/lab/`에 산출물이 있으면 → 실습 완료
4. **test**: `ch-{slug}/test.md`에 채점 기록이 없으면 → 테스트 진행
5. **review**: `ch-{slug}/review/schedule.md`에 최근 반복 기록이 없으면 → 복습 시작

## 진행 단계별 지시

### diagnosis (사전평가)
- `diagnosis.md`가 없으면 생성한다.
- `project_root/diagnosis-template.html` 템플릿을 기준으로 인터랙티브 사전평가 HTML(`ch-{slug}/diagnosis.html`)을 생성한다.
  - 템플릿은 JS 기반 렌더러로, 문항 데이터를 JSON으로 주입하면 자동 렌더링.
  - 템플릿 변수: `{{CHAPTER_SLUG}}`, `{{CHAPTER_TITLE}}`, `{{PHASE}}`, `{{QUESTIONS_JSON}}`.
- **점수 배분 (변경 가능)**:
  - 객관식(MCQ): 3점 × 문항수 = 30~40점 (다중 정답 가능 시 체크박스)
  - SQL 주관식: 20~25점 × 2문항 = 40~50점
  - 서술형: 15~25점 × 1문항
  - 총합 = 100점. **서술형이 가장 높은 점수**를 받도록 한다.
- **AI 제출 방식**: 생성된 HTML의 "AI에게 제출" 버튼이 답안을 구조화 텍스트로 패키징 → 학습자가 채팅에 붙여넣으면 AI가 채점한다.
- 채점 결과를 `diagnosis.md` 하단에 기록: 점수, 오답 항목, 약점 분야, 권장 학습 깊이.
- 사전평가 결과가 나쁘면 개념 학습을 더 천천히, 좋으면 빠르게 진행한다.
- HTML 재생성이 필요하면 템플릿 + diagnosis.md 기준으로 다시 생성한다.

### 개념 학습
- diagnosis.md의 약점을 우선 커버한다.
- 개념 설명은 최소한으로. 실행 가능한 예제와 함께 제시한다.

### lab (실습)
- `lab/` 디렉토리에 실습 과제 파일을 생성한다(확장자는 도메인에 맞게).
- 학습자가 직접 실행한 결과/로그/실행계획을 lab/에 첨부하도록 안내한다.
- 완료 후 실행 결과를 확인하고, 틀린 부분이 있으면 피드백한다.

### test (테스트)
- `test.md`에 학습 완료 확인 문제를 출제한다.
- diagnosis보다 한 단계 높은 난이도로 구성한다.
- 통과 기준을 명시하고, 미달 시 부족한 개념만 다시 학습하도록 안내한다.
- 결과를 `test.md`에 기록한다.

### review (복습)
- 복습은 `/study-review` 커맨드로 위임한다. 에이전트는 Verifier/Reinforcer/Curious Student/Scheduler 역할로 4단계(blank-recall → gap-fill → self-lecture → schedule)를 진행한다.
- `review/` 디렉토리가 없으면 생성한다.
- 피드백은 본 학습 범위(concept/lab)로 한정. 벗어나면 `review/learning-gaps.md`에 분류.

## 종료 조건

- 모든 단계를 완료했으면 "이 챕터 완료" 메시지와 함께 다음 챕터 번호를 안내한다.
- 중간에 끝낼 경우 "다음에 /study-chapter 로 이어서 시작" 메시지를 남긴다.
