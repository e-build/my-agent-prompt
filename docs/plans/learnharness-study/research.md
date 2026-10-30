# LearnHarness → study 조사 및 브레인스토밍

## 목차

- [조사 범위](#조사-범위)
- [영상 근거](#영상-근거)
- [핵심 개념](#핵심-개념)
- [현재 study와의 차이](#현재-study와의-차이)
- [적용 대안](#적용-대안)
- [추천 구조](#추천-구조)
- [주의점과 검증](#주의점과-검증)
- [확인할 결정](#확인할-결정)
- [코드 근거](#코드-근거)

## 조사 범위

- 상태: **초기 조사·제안 기록. 이후 사용자 결정은 [결정과 미결 사항](decisions.md) 우선. 구현 설계 미확정**
- 조사일: 2026-10-28
- 현재 저장소 기준 커밋: `8b77667`
- LearnHarness: `/Users/jimmylee/IdeaProjects/opensources/learnharness`, 커밋 `3dd5211`
- 영상: [Agent Harness for Learning Things — Eero Alvar](https://www.youtube.com/watch?v=nfTDljFG2g0), 약 22분 39초
- 확보 자료: [영어 타임스탬프 자막](sources/video-transcript-en.md), [한국어 타임스탬프 자막](sources/video-transcript-ko.md). 중복되는 원시 JSON은 저장소에서 제외
- 자막 출처: YouTube 자동 생성 트랙. 작성자 원고 아님. 오인식·더빙/번역 가능성에 유의하며 영어 트랙으로 내용 분석
- 조사 방식: 로컬 README·프롬프트·타입·실제 도구 구현과 영상 자막 비교. 앱 실행 검증이나 학습 효과 실험은 수행하지 않음
- 기본 영상 fetch와 웹 검색은 환경 설정 문제로 실패. `youtube-transcript-api`를 통한 공개 자막 조회로 확보

## 영상 근거

| 구간 | 영상의 주장·시연 | study 적용 시사점 |
|---|---|---|
| [00:24–01:16](https://www.youtube.com/watch?v=nfTDljFG2g0&t=24s) | 정신적 노력 대비 이해를 높이되 사고 자체를 외주화하지 않기 | 에이전트는 준비·기록 부담을 줄이고 학습자의 예측·설명·실행은 남기기 |
| [01:18–02:42](https://www.youtube.com/watch?v=nfTDljFG2g0&t=78s) | 설명을 따라가는 이해와 상황에서 지식을 떠올리는 능력 구분 | concept 이해 확인, 전이 연습, 지연 회상을 별개 근거로 기록 |
| [03:11–04:02](https://www.youtube.com/watch?v=nfTDljFG2g0&t=191s) | 정오답뿐 아니라 학습자의 추론 과정 수집 | 선택 이유·헷갈린 지점·자신감 입력 |
| [04:17–05:42](https://www.youtube.com/watch?v=nfTDljFG2g0&t=257s) | probe → 최소 의존성 계획 → predict/teach/check | 고정 문항 대신 적응형 진단, 작은 추론 단위 수업 |
| [06:02–07:32](https://www.youtube.com/watch?v=nfTDljFG2g0&t=362s) | 단서의 거리와 결합할 아이디어 수로 연습 조절, 최소 힌트 | 개념명을 알려주지 않는 상황 문제, 단계별 힌트 |
| [07:44–08:35](https://www.youtube.com/watch?v=nfTDljFG2g0&t=464s) | 명제와 추론 사슬로 세션 간 지식 압축 | 단순 키워드 연결이 아닌 전제 묶음 → 결론과 출처 저장 |
| [12:00–12:19](https://www.youtube.com/watch?v=nfTDljFG2g0&t=720s) | 정답일 확률에 대한 자기보고 confidence | 정답+낮은 확신과 오답+높은 확신 구별. 숙련도 수치로 간주 금지 |
| [14:18–14:27](https://www.youtube.com/watch?v=nfTDljFG2g0&t=858s) | 수식 조작으로 정답을 맞혀도 대상 개념은 모를 수 있음 | 정답만으로 개념 이해 판정 금지 |
| [15:57–17:38](https://www.youtube.com/watch?v=nfTDljFG2g0&t=957s) | 읽는 동안의 생각 입력, 짧은 상호작용으로 지속 관측 | 설명 길이 제한 자체보다 적절한 피드백 시점이 핵심 |
| [19:17–19:56](https://www.youtube.com/watch?v=nfTDljFG2g0&t=1157s) | 그래프는 다룬 지식이며 이해 수준은 아직 표시하지 않음 | covered와 demonstrated를 분리. 숙련도 그래프라고 소개 금지 |

## 핵심 개념

1. **Probe: 이미 아는 경계 찾기**
   - 선행 지식 갈래별로 확인된 하한, 아직 못 푸는 상한, 오개념, 시작 지점 파악
   - 질문 하나 → 답변·확신·추론 → 다음 질문 선택
   - 코드상 `ProbeAssessment`는 `strands[{strand, assessment}]`와 선택적 summary. floor/ceiling은 별도 타입 필드가 아닌 자연어 평가 안에 포함
2. **Plan: 목차가 아니라 목표까지의 의존성 지도**
   - 아는 토대에서 목표까지 필요한 경로를 구성하고 실제 답변에 따라 수정
   - 계획도의 `requires`와 영속 그래프의 논리적 추론 관계는 서로 다른 의미
3. **Teach: 예측 → 설명 → 적용 확인 → 필요한 보완**
   - 예측은 아직 배우지 않은 다음 단계를 시도하는 학습 활동. 실패를 숙련도 하락으로 처리하면 안 됨
   - 확인 질문은 배운 내용으로 추론 가능하되 방금 설명한 문장을 복사하는 문제는 피함
4. **Practice: 정답 평가와 구별되는 사용 능력 강화**
   - recall / discrimination / composition
   - 힌트 R0 주의 환기 → R1 패턴 표현 → R2 후보군 → R3 개념명 → R4 풀이 방향 → R5 풀이 단계
   - 힌트 없이 해결한 경우와 개념명을 받은 뒤 해결한 경우는 다른 근거
   - 출제 전 모범 풀이 확정, 대상 개념 없이 우회 가능한 문제인지 확인
5. **Knowledge: 명제와 추론 사슬의 영속 기록**
   - 명제는 '트랜잭션' 같은 이름만이 아니라 조건을 포함하는 주장
   - `A ∧ B ⇒ C`와 `D ⇒ C`는 다른 논증. 화살표를 합쳐 `A ∧ B ∧ D ⇒ C`로 만들면 의미 훼손
   - 원 세션·메시지/문서 출처를 보존하고 그래프 그림은 저장된 구조에서 파생

## 현재 study와의 차이

| 영역 | 현재 확인된 구현 | 적용 후보 |
|---|---|---|
| 진단 | 최소 10문항, 70/20/10 비율을 지침과 `assessment-core.ts` 양쪽에서 강제 | 적응형 probe를 별도 계약으로 추가. 프롬프트만 바꿔서는 불가 |
| 제출 | 문항 답변·rubric 중심. 공통 제출 payload에 confidence/thinking 전용 필드 없음 | 답, 선택 이유, 확신, 힌트 여부, 미응답/모름 구분 |
| 개념 학습 | diagnosis 약점과 README 범위 중심, 설명 우선 요청 존중 | 의미 있는 추론 단위의 예측/확인과 현재 위치 기록 |
| 계획 | 프로젝트 커리큘럼 preview, README 개념 의존성/관계도, 챕터 phase | 기존 지도 재사용 + 챕터 내부 적응형 경로. 전체 커리큘럼과 분리 |
| 대화 | `study-dialogue`가 이미 한 질문씩 확인, 작은 힌트, 설명 요청 존중, 도움 수준 기록 지원 | 새 대화 스킬을 중복 생성하기보다 공통 증거 계약과 연습 문제 선택 연결 |
| 연습 | lab 실행 검증, test, 고정 회차 review | 시험과 실습을 대체하지 않는 대화형 전이 연습 |
| 근거 | checkpoint의 answer_verified/self_reported/explained 등, 실제 lab 관찰 | 기존 구분 유지 + 적용 상황·도움 수준·지연 여부 연결 |
| 영속 지식 | README 교재, checkpoint, assessment, lab/review 기록 | 기존 원본에 연결되는 명제·추론 인덱스. 교재 복제 금지 |
| 복습 | 고정 일정, 원 답변 보존, 독립 회상/힌트 후/교정 직후 구분 | 일정은 유지하고 회차 내 상황 변형·교차 연습 강화 |

## 적용 대안

### A. 교수법만 도입

- concept/review 지침에 예측·적용 확인·최소 힌트 추가
- 장점: 변화량 작고 빠른 체감 가능
- 단점: 적응형 질문·증거 연결을 프롬프트 준수에 의존. 세션 간 일관성 제한

### B. 기존 study 안에 적응형 학습 기능 추가 — 추천

- 챕터·README·lab·시험·복습 계약 유지
- 적응형 probe, 학습자 관찰 기록, 추론 경로, 전이 연습을 순차 도입
- 기존 `study-dialogue`와 역할을 공유하고, 최소 명제·추론 인덱스로 챕터 간 재사용. 그래프 UI는 나중에 추가
- 장점: 현재 강점과 LearnHarness의 교육 상호작용 결합
- 단점: 제출·상태·재개·정답 공개 시점 계약 설계 필요

### C. 그래프 중심 시스템으로 전환

- 지식 그래프를 진입점으로 재구성하고 챕터는 선택 뷰로 전환
- 장점: 자유 탐색과 챕터 간 연결에 유리
- 단점: 현재 학습 프로젝트·상태 마이그레이션과 UI 재설계 범위 큼

## 추천 구조

> 아래는 초기 제안. 이후 사용자가 **공통 지식을 중앙에서 관리하고 프로젝트가 참조하는 방향**을 선택했으므로, 프로젝트 교재를 유일한 지식 정본으로 두는 인덱스 방식은 현재 선택안이 아님. [현재 결정](decisions.md)과 [그래프 제안](knowledge-graph.html) 참고.

**진도 / 지식 내용 / 학습자 증거를 분리**하는 방향의 제안. 파일명·도구명은 미확정.

- 진행 상태: 기존 `.study/state.json`. 챕터·phase·완료 조건 유지
- 지식 내용: 조건과 출처를 가진 명제, 전제 묶음과 결론. '다뤘음'이지 '숙련됨'이 아님
- 학습자 증거: 실제 원 답변, 자기보고 확신, 힌트 수준, 즉시/지연/다른 상황, 평가 근거
- 다음 행동: 위 자료에서 선택한 계획. 변경 가능한 가설이며 영구 능력 등급이 아님

권장 도입 순서:

1. 학습자 응답·근거 계약과 concept의 작은 학습 루프
2. bounded adaptive probe: 질문 수/시간 상한과 중단·설명 우선 경로를 갖춘 적응형 진단
3. 전이 연습 모드: 시험의 합격 판정과 분리, 기존 phase에 무조건 새 필수 단계를 추가하지 않기
4. 명제·추론·출처 인덱스와 챕터 간 조회
5. 필요가 확인되면 그래프 탐색 UI·자동 추출·멀티에이전트 도입

예시 — 캐시 학습:

- 토대: DB와 캐시는 별도 저장소이며 한쪽 쓰기가 다른 쪽에 자동 반영되지 않음
- 예측: DB만 변경했을 때 기존 캐시를 읽으면 어떤 결과가 생기는가?
- 확인: 주어진 읽기/쓰기 순서에서 오래된 값이 다시 캐시에 들어갈 수 있는지 설명
- 연습: 'cache-aside'를 제목에 쓰지 않고 가격 변경 직후 옛 가격이 다시 나타나는 로그 제시
- 기록: 무힌트로 문제를 식별했는지, 개념명 힌트를 받은 뒤 실행 순서만 설명했는지 분리
- lab: 실제 재현·테스트 증거는 기존 `study_lab_verify` 계약대로 별도 확인

## 주의점과 검증

- **교수법 주장과 입증 사실 구분:** '어떤 교수법보다 우수', '85%가 최적', '무조건적 진실이 즉시 각인' 등은 저자의 지침/가설. 이번 조사에서 학습과학 근거 검증 없음
- **조건을 지우지 않기:** 백엔드 학습은 버전·격리 수준·구현·장애 가정 의존성이 큼. 이해하기 쉽게 만들기 위해 보편 명제로 왜곡 금지
- **무한 진단 금지:** 원문의 '모든 갈래에서 실패 경계까지'를 그대로 강제하지 않기. 이미 아는 내용 반복 비용과 학습자 피로 고려
- **설명 요청 존중:** 모든 문장마다 예측/퀴즈 강제 금지. 명시적 해설 요청, 건너뛰기, 중단 허용
- **자신감은 자기보고:** 높은 자신감의 오답만으로 오개념 확정 금지. 문항 모호성·실수도 확인
- **정답 사전 확정:** 출제 시 답안·채점 기준을 먼저 보존하되 공개 질문 데이터와 분리. 현재 브라우저는 rubric을 보여주므로 정답 포함 rubric을 그대로 넣으면 누출 가능
- **기록 분리:** 교사가 설명한 내용은 covered, 자기보고는 self_reported, 실제 응답은 그 상황의 evidence. 하나로 합쳐 mastered 처리 금지
- **세션 재사용:** 그래프에 존재한다는 이유만으로 진단 면제 금지. 최근 독립 수행 증거와 맥락을 함께 보기
- **기존 안전장치 유지:** 사용자 관찰 없는 lab 완료 금지, checkpoint만으로 phase 완료 금지, 날짜만으로 복습 완료 금지
- **문서 최신성:** LearnHarness `docs/architecture.md`에는 구형 problem-set 설명이 남아 있으나 현재 practice agent/tool은 문제 스트림과 `problem/conclude`를 사용. 실제 코드·현재 프롬프트 우선
- **라이선스:** LearnHarness는 AGPL-3.0. 아이디어를 독자 설계에 반영하는 것과 코드·프롬프트를 복사하는 것은 구분. 복사/파생·배포 시 의무 별도 검토
- **검증 지표:** 만족도·정답률만 보지 않고, 독립 지연 회상·새 맥락 적용·힌트 수준·불필요한 질문 수를 작은 파일럿에서 비교
- **기술 검증 후보:** 재제출 멱등성, 중단 후 재개, 정답 공개 전 비노출, 근거 없는 상태 승격 거부, 진단 상한, 기존 프로젝트 호환

## 확인할 결정

다음 목록은 초기 인터뷰 의제. 개념 후 실습 유지, 과제별 역할의 에이전트 판단, 중앙 지식 저장소 방향은 이후 선택됨. 최신 미결 사항은 [결정과 미결 사항](decisions.md) 참고.

초기 질문: A 교수법 개선 / B 기존 체계에 적응형 기능 추가 / C 그래프 중심 재구성 중 어느 수준까지 변경할지.

이후 순차 결정:

- 고정 진단 유지 옵션과 적응형 진단의 기본값
- 예측/설명/확인의 상호작용 강도와 설명 우선 경로
- practice의 진입점과 기존 review/lab의 역할 경계
- 지식 기록 범위: 프로젝트 내부부터 시작할지, 여러 study 프로젝트를 연결할지
- 자동 추출의 승인·수정·삭제 및 원문 추적 정책

## 코드 근거

### LearnHarness — 로컬 루트 기준

- `README.md`
- `src/agent/prompts/prober/10-probe-doctrine.md`
- `src/agent/prompts/teacher/05-method.md`
- `src/agent/prompts/teacher/10-planning.md`
- `src/agent/prompts/teacher/20-teaching.md`
- `src/agent/prompts/teacher/28-predictions.md`
- `src/agent/prompts/teacher/30-question-principles.md`
- `src/agent/prompts/shared/25-confidence.md`
- `src/agent/prompts/practice/10-doctrine.md`
- `src/core/contracts/probe.ts`, `src/core/contracts/graph.ts`
- `src/agent/tools/practice.ts`, `src/agent/teacher-agent.ts`

### 현재 저장소

- `runtime/pi/extensions/study/README.md`
- `runtime/pi/extensions/study/instructions/diagnosis.md`
- `runtime/pi/extensions/study/instructions/concept.md`
- `runtime/pi/extensions/study/instructions/review.md`
- `runtime/pi/extensions/study/assessment-core.ts`
- `runtime/pi/extensions/study/assets/assessment-template.html`
- `runtime/pi/extensions/study/index.ts`
- `runtime/pi/extensions/study/study-state.ts`
- `runtime/pi/extensions/study/checkpoint-core.ts`
- `runtime/pi/extensions/study/prompts/study-init.md`
- `resources/skills/tool/study-dialogue/SKILL.md`
