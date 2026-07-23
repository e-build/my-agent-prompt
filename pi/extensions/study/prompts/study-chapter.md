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

## 사전진단 흐름 (study extension 기반)

사전진단은 markdown에 문제를 나열하지 않는다. **`study_diagnosis_open` tool로 인터랙티브 브라우저 세션을 연다.** Plannotator처럼 학습자가 직접 파일을 열 필요 없이, tool이 브라우저를 자동으로 띄운다.

정상 진행:
1. `DiagnosisQuestionSet` JSON을 구성한다.
2. `study_diagnosis_open` tool을 호출한다 → tool이 `ch-{slug}/diagnosis.html` 생성 + 로컬 서버 시작 + **브라우저 자동 open**.
3. 학습자가 브라우저에서 답안을 작성하고 "AI에게 제출"을 누른다.
4. 답안이 현재 Pi 세션으로 자동 전송된다 (`# DIAGNOSIS_SUBMISSION_RECEIVED`).
5. AI가 채점하고, `diagnosis.md`에 결과를 기록한다.
6. AI 응답 끝에 반드시 `<!--DIAGNOSIS_GRADE_JSON_START--> ... <!--DIAGNOSIS_GRADE_JSON_END-->` 마커로 채점 JSON을 포함한다. extension이 이를 추출해 브라우저에 자동 표시한다.
7. **채점 직후에는 개념 학습으로 넘어가지 않는다.** 학습자가 브라우저에서 결과(점수·정답·해설·보완 포인트)를 충분히 확인할 때까지 대기한다.
8. 학습자는 결과 화면에서 개념 학습 중 조금 더 비중 있게 다루면 좋겠는 문항을 `pinpoint`하고 문항별 comment를 남길 수 있다.
9. 학습자가 브라우저에서 “Pi에서 개념 학습 시작” 버튼을 누르면 `# DIAGNOSIS_RESULTS_REVIEWED` 신호가 들어온다. **이 신호를 받은 뒤에야** diagnosis.md의 취약 분야를 기준으로 개념 학습을 시작하고, 학습자가 강조한 pinpoint는 설명 밀도 조절에 반영한다.

> 학습자에게 "브라우저로 직접 여세요" / "복사해서 붙여넣으세요" 라고 안내하지 마라. 그건 tool이 다 한다.

## 문항 JSON schema

`study_diagnosis_open`의 `questionsJson`에는 아래 schema를 따르는 JSON object를 **문자열로** 넘긴다. 새 챕터마다 이 JSON만 바꾼다.

### 문항 구성 규칙

- **최소 10문항**을 만든다. 10문항 미만은 사전진단으로 부족하다.
- 문항 수 기준 비중은 아래를 기본값으로 한다.
  - 객관식: 약 70% (`single-choice` + `multiple-choice`)
  - 주관식: 약 20% (`short-answer`; 필요하면 `code`/`sql`도 이 비중 안에서 사용)
  - 서술형: 약 10% (`essay`)
- 10문항 기준 고정 예시는 **객관식 7문항 + 주관식 2문항 + 서술형 1문항**이다.
- 10문항을 초과하면 위 비율에 가장 가깝게 배분한다. 단, 사전진단은 빠른 진단이 목적이므로 서술형을 과도하게 늘리지 않는다.
- 총점은 보통 100점으로 두되, 문항 수 비중과 별개로 난이도에 따라 배점한다.

```ts
type DiagnosisQuestionSet = {
  version: "1.0";
  chapterSlug: string;
  chapterTitle: string;
  phase: string;                 // e.g. "Phase 1 / diagnosis"
  instructions: string;          // 학습자에게 보이는 안내문
  totalPoints: number;           // 보통 100
  sections: DiagnosisSection[];
  questions: DiagnosisQuestion[];
};

type DiagnosisSection = {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  questionIds: string[];
};

type DiagnosisQuestion = {
  id: string;
  type: "single-choice" | "multiple-choice" | "short-answer" | "essay" | "code" | "sql";
  sectionId: string;
  prompt: string;
  description?: string;
  points: number;
  required?: boolean;            // default true
  options?: DiagnosisOption[];   // choice 타입에만 사용
  placeholder?: string;          // text/code/sql/essay 입력 힌트
  rubric?: string[];             // 학습자에게 공개 가능한 채점 기준
  constraints?: string[] | Record<string, string | number | boolean>;
};

type DiagnosisOption = {
  id: string;                    // e.g. "A"
  label?: string;                // 화면 표시용. 없으면 id 사용
  text: string;
};
```

### 정답/해설 보안 규칙

- `questionsJson`에는 정확한 `answerKey`, 모범답안 전문, 해설 전문을 넣지 않는다.
- HTML에 들어가는 `rubric`은 "공개 가능한 채점 기준"만 넣는다.
- AI 채점용 정답/해설은 Pi 세션 컨텍스트에서만 유지한다.
- 채점이 끝난 뒤에는 AI가 `DIAGNOSIS_GRADE_JSON`에 `correctAnswer`, `explanation`, `advice`를 포함해 반환한다. extension이 이를 브라우저로 전달하고, 학습자는 제출한 같은 화면에서 문항별 정답·해설·보완 포인트를 확인한다.

### 채점 결과 JSON 포맷

학습자 답안 제출 후 들어오는 `# DIAGNOSIS_SUBMISSION_RECEIVED` 프롬프트를 받으면, 반드시 아래 포맷으로 응답한다. extension이 마커를 추출해 브라우저에 표시한다.

```
<!--DIAGNOSIS_GRADE_JSON_START-->
```json
{
  "kind": "study-diagnosis-grade",
  "diagnosisId": "<제출 프롬프트에 명시된 diagnosisId 그대로>",
  "totalScore": 72,
  "maxScore": 100,
  "level": "slow|normal|fast",
  "summary": "전체 진단 요약",
  "weaknesses": ["약점 태그"],
  "recommendation": "권장 학습 깊이와 다음 행동",
  "results": [
    {
      "id": "q1",
      "score": 10,
      "maxScore": 10,
      "status": "correct|partial|wrong|unanswered",
      "correctAnswer": "정답 또는 모범 답안",
      "explanation": "왜 맞고 틀렸는지 해설",
      "advice": "이 문항 기준 보완할 점"
    }
  ]
}
```
<!--DIAGNOSIS_GRADE_JSON_END-->
```

### 리뷰 완료 전환 (`DIAGNOSIS_RESULTS_REVIEWED`)

채점 직후에는 개념 학습으로 넘어가지 않고 대기한다. 학습자가 브라우저에서 결과를 모두 확인한 뒤 “Pi에서 개념 학습 시작” 버튼을 누르면, 아래 신호가 현재 Pi 세션에 들어온다.

```
# DIAGNOSIS_RESULTS_REVIEWED

- diagnosisId: <id>
- chapterSlug: <slug>
- chapterTitle: <title>
- 총점: 72/100
- level: normal
- 취약 분야: 인덱스 컬럼 순서, 실행 계획 해석
- 학습자가 강조한 pinpoint:
  - q4 (0/8, wrong): 복합 인덱스 `(a, b, c)`에서 가장 먼저 고려해야 하는 원칙은? — leftmost prefix가 아직 감이 안 옵니다.
  - q7 (8/8, correct): 느린 쿼리 개선 순서는 맞췄지만 감으로 찍었습니다.
- diagnosisMdPath: <경로>

학습자가 브라우저에서 진단 결과(점수·정답·해설·보완 포인트)를 모두 확인했습니다.
이제 diagnosis.md의 결과를 기준으로 개념 학습을 시작하되, 학습자가 강조한 pinpoint는 관련 개념의 설명 비중을 조금 높이는 신호로 반영하세요.
```

이 신호를 받으면:
1. 개념 학습의 기본 범위와 순서는 챕터 README의 학습 목표와 diagnosis.md의 전체 약점/권장 학습 깊이를 기준으로 정한다.
2. 학습자가 강조한 pinpoint는 학습 범위 변경이나 우선순위 override가 아니라 **비중 조절 신호**다.
3. pinpoint된 문항과 연결된 개념은 해당 개념을 설명할 때 조금 더 천천히 다루고, 예시/비교/확인 질문을 1~2개 더 추가한다.
4. pinpoint만 따로 떼어 별도 강의처럼 진행하지 않는다. 전체 흐름 안에서 관련 지점을 조금 더 강조한다.
5. 정답이지만 pinpoint된 문항은 "감으로 맞춘 문항"일 수 있으므로 해당 개념 설명 중 짧게 확인하고 넘어간다.
6. 학습자가 본 학습 범위를 벗어나지 않도록 범위를 한정한다.

> 학습자가 탭을 닫고 Pi에 직접 “계속”/“개념 학습 시작”이라고 적어도 같은 의미로 받아들여 전환한다. `DIAGNOSIS_RESULTS_REVIEWED`는 canonical한 happy path다.

### 예시 JSON (10문항: 객관식 7 + 주관식 2 + 서술형 1)

```json
{
  "version": "1.0",
  "chapterSlug": "ch-01-index-basics",
  "chapterTitle": "인덱스 기초",
  "phase": "Phase 1 / diagnosis",
  "instructions": "현재 이해 수준을 확인합니다. 모르는 것은 모른다고 답하세요.",
  "totalPoints": 100,
  "sections": [
    {
      "id": "concept",
      "title": "핵심 개념",
      "description": "용어와 기본 원리를 확인합니다.",
      "estimatedMinutes": 8,
      "questionIds": ["q1", "q2", "q3", "q4"]
    },
    {
      "id": "apply",
      "title": "적용 판단",
      "description": "상황별 선택을 확인합니다.",
      "estimatedMinutes": 8,
      "questionIds": ["q5", "q6", "q7"]
    },
    {
      "id": "explain",
      "title": "짧은 설명과 근거",
      "description": "직접 설명할 수 있는지 확인합니다.",
      "estimatedMinutes": 9,
      "questionIds": ["q8", "q9", "q10"]
    }
  ],
  "questions": [
    {
      "id": "q1",
      "type": "single-choice",
      "sectionId": "concept",
      "prompt": "인덱스의 주된 목적에 가장 가까운 것은?",
      "points": 8,
      "options": [
        { "id": "A", "text": "테이블의 모든 데이터를 압축한다" },
        { "id": "B", "text": "조건에 맞는 데이터를 더 빨리 찾게 돕는다" },
        { "id": "C", "text": "모든 쓰기 작업을 빠르게 만든다" },
        { "id": "D", "text": "트랜잭션 격리 수준을 높인다" }
      ],
      "rubric": ["핵심 목적을 고른다", "쓰기 비용과 구분한다"]
    },
    {
      "id": "q2",
      "type": "single-choice",
      "sectionId": "concept",
      "prompt": "B-Tree 인덱스가 특히 잘 처리하는 조건은?",
      "points": 8,
      "options": [
        { "id": "A", "text": "선두 컬럼부터 이어지는 동등/범위 조건" },
        { "id": "B", "text": "모든 LIKE '%keyword%' 조건" },
        { "id": "C", "text": "항상 모든 OR 조건" },
        { "id": "D", "text": "SELECT 절의 모든 표현식" }
      ],
      "rubric": ["B-Tree 탐색 특성을 이해한다"]
    },
    {
      "id": "q3",
      "type": "multiple-choice",
      "sectionId": "concept",
      "prompt": "인덱스를 추가할 때 함께 고려해야 할 비용을 모두 고르세요.",
      "points": 10,
      "options": [
        { "id": "A", "text": "쓰기 성능 저하 가능성" },
        { "id": "B", "text": "저장 공간 증가" },
        { "id": "C", "text": "옵티마이저 선택지 증가" },
        { "id": "D", "text": "모든 쿼리의 자동 고속화 보장" }
      ],
      "rubric": ["장점뿐 아니라 운영 비용을 고른다"]
    },
    {
      "id": "q4",
      "type": "single-choice",
      "sectionId": "concept",
      "prompt": "복합 인덱스 `(a, b, c)`에서 가장 먼저 고려해야 하는 원칙은?",
      "points": 8,
      "options": [
        { "id": "A", "text": "항상 알파벳순으로 컬럼을 둔다" },
        { "id": "B", "text": "쿼리 조건과 정렬에서 선두 컬럼 활용 여부를 본다" },
        { "id": "C", "text": "가장 긴 문자열 컬럼을 항상 앞에 둔다" },
        { "id": "D", "text": "PK 컬럼은 절대 포함하지 않는다" }
      ],
      "rubric": ["leftmost prefix 관점을 이해한다"]
    },
    {
      "id": "q5",
      "type": "single-choice",
      "sectionId": "apply",
      "prompt": "카디널리티가 매우 낮은 컬럼 하나만으로 만든 인덱스의 일반적 위험은?",
      "points": 8,
      "options": [
        { "id": "A", "text": "선택도가 낮아 효과가 작을 수 있다" },
        { "id": "B", "text": "항상 PK보다 빠르다" },
        { "id": "C", "text": "INSERT 비용이 0이 된다" },
        { "id": "D", "text": "WHERE 조건을 사용할 수 없게 된다" }
      ],
      "rubric": ["선택도와 인덱스 효율을 연결한다"]
    },
    {
      "id": "q6",
      "type": "multiple-choice",
      "sectionId": "apply",
      "prompt": "실행 계획을 볼 때 인덱스 사용 여부 판단에 도움이 되는 정보를 모두 고르세요.",
      "points": 10,
      "options": [
        { "id": "A", "text": "access type" },
        { "id": "B", "text": "key 또는 possible_keys" },
        { "id": "C", "text": "rows 추정치" },
        { "id": "D", "text": "테이블 이름의 길이" }
      ],
      "rubric": ["실행 계획의 핵심 필드를 안다"]
    },
    {
      "id": "q7",
      "type": "single-choice",
      "sectionId": "apply",
      "prompt": "느린 쿼리 개선 전 가장 먼저 할 일에 가까운 것은?",
      "points": 8,
      "options": [
        { "id": "A", "text": "모든 컬럼에 인덱스를 만든다" },
        { "id": "B", "text": "쿼리, 데이터 분포, 실행 계획을 확인한다" },
        { "id": "C", "text": "서버를 재시작한다" },
        { "id": "D", "text": "ORDER BY를 모두 제거한다" }
      ],
      "rubric": ["근거 기반 튜닝 순서를 고른다"]
    },
    {
      "id": "q8",
      "type": "short-answer",
      "sectionId": "explain",
      "prompt": "인덱스를 너무 많이 만들면 생길 수 있는 문제를 두 가지 이내로 쓰세요.",
      "points": 12,
      "placeholder": "쓰기 비용, 저장공간, 최적화 혼선 등",
      "rubric": ["비용/부작용을 구체적으로 언급한다"]
    },
    {
      "id": "q9",
      "type": "short-answer",
      "sectionId": "explain",
      "prompt": "복합 인덱스에서 컬럼 순서가 중요한 이유를 한두 문장으로 설명하세요.",
      "points": 12,
      "placeholder": "선두 컬럼, 조건 조합, 정렬 활용 관점",
      "rubric": ["선두 컬럼과 조건 패턴을 연결한다"]
    },
    {
      "id": "q10",
      "type": "essay",
      "sectionId": "explain",
      "prompt": "친구에게 인덱스를 책의 목차 비유로 설명하고, 그 비유가 깨지는 지점도 쓰세요.",
      "points": 16,
      "placeholder": "비유 + 한계 + 실제 DB에서 조심할 점",
      "rubric": ["비유가 쉽다", "비유의 한계를 말한다", "실제 판단 기준을 포함한다"]
    }
  ]
}
```

## 단계 종료 안내 원칙

각 단계가 끝날 때는 선택지를 많이 주지 말고, 학습자가 다음 행동을 바로 알 수 있도록 아래 3줄 구조로 안내한다.

```text
완료: {이번 단계에서 끝낸 것}
다음: {바로 이어질 다음 단계}
실행: {명령어, 브라우저 버튼, 또는 파일 경로}
```

원칙:
- 다음 행동은 하나만 강하게 안내한다.
- 선택지는 그 선택이 필요한 바로 그 시점에만 묻는다.
- init 직후에는 lab/실습 과제 생성을 묻지 않는다.
- 실습 과제 세트 제안은 concept 학습 후 lab으로 전환할 때만 한다.
- "할 수도 있습니다"보다 "다음은 이것입니다"처럼 직접적으로 말한다.

## 단계별 학습 설계 원칙

`/study-chapter`는 init에서 만든 순서를 그대로 따라가되, 각 단계의 역할에 맞는 학습 전략을 사용한다. 전략 이름을 장황하게 설명하지 말고, 행동 규칙으로 적용한다.

### diagnosis — 현재 이해 꺼내기
- 설명을 읽고 맞히는 문제가 아니라, 학습자가 현재 머릿속에 있는 구조를 꺼내보게 한다.
- 단순 암기보다 개념 구분, 오개념 탐지, 관계 이해, 실제 판단을 확인한다.
- 객관식은 헷갈리는 선택지를 통해 구분 능력을 본다.
- 주관식/서술형은 짧게 자기 말로 설명하게 한다.

### concept — 쉬운 예시에서 원리로
- 쉬운 말 정의 → 구체 예시 → 중간 상태 → 원리 → 비슷한 개념 비교 순서로 진행한다.
- 처음부터 어려운 문제를 던지지 않는다.
- 학습자가 pinpoint한 문항이 있으면 전체 개념 흐름은 유지하되, 해당 문항과 연결된 개념의 설명 밀도와 예시를 조금 늘린다.
- 개념 학습 후 `concept.md`에 교과서형으로 정리한다.

### lab — 안내에서 독립 수행으로
- 실습은 처음부터 빈 과제로 시작하지 않는다.
- 따라 하기 → 조건 바꿔보기 → 힌트 없이 직접 수행 순서로 설계한다.
- 개발/DB, 언어, 음악, 글쓰기, 자격증, 운동 등 모든 주제에 맞게 "따라 하기/변형하기/독립 수행"을 번역한다.

### test — 변형 상황에서 확인
- 테스트는 lab에서 본 예시를 그대로 반복하지 않는다.
- 기억에서 꺼내고, 조금 다른 조건에 적용하게 한다.
- 헷갈리는 개념 쌍을 비교하게 하거나 실제 판단 문제로 낸다.

## 진행 단계별 지시

### diagnosis (사전평가)

1. `diagnosis.md`가 없으면 헤더만 생성한다 (아래 템플릿).
2. 챕터 README의 `학습 목표`, `다룰 개념과 용어`, `개념 관계도`, `학습 흐름`을 읽고 `DiagnosisQuestionSet` JSON을 구성한다. `완료 기준` 섹션은 기대하지 않는다. 이때 반드시 문항 구성 규칙을 지켜 **최소 10문항, 객관식 약 70%, 주관식 약 20%, 서술형 약 10%**로 만든다.
3. **`study_diagnosis_open` tool을 호출한다.** 필수 인자:
   - `chapterSlug`: 챕터 디렉토리 slug (예: `ch-01-mysql8-architecture`)
   - `chapterTitle`: 챕터 제목
   - `phase`: Phase 라벨 (예: `Phase 1 / diagnosis`)
   - `questionsJson`: 위에서 구성한 JSON을 문자열로
   - `diagnosisMdPath`: `ch-{slug}/diagnosis.md`
4. tool이 HTML 생성 + 브라우저 자동 open을 끝내면, 학습자에게 안내한다:
   - "브라우저를 열었습니다. 답안을 작성하고 제출하세요. 채점 결과를 확인한 뒤 조금 더 비중 있게 다루면 좋겠는 문항을 pinpoint할 수 있습니다. 마지막에 'Pi에서 개념 학습 시작'을 누르면 이어서 진행합니다."
   - 학습자에게 복사/붙여넣기를 시키지 마라.
5. 학습자가 제출하면 `# DIAGNOSIS_SUBMISSION_RECEIVED` 프롬프트가 현재 세션에 들어온다. 그때:
   - rubric 기준으로 채점한다.
   - `diagnosis.md` 하단에 점수/오답/약점/권장 학습 깊이를 기록한다.
   - 응답 끝에 `<!--DIAGNOSIS_GRADE_JSON_START--> ... <!--DIAGNOSIS_GRADE_JSON_END-->` 마커로 채점 JSON을 반드시 포함한다 (`diagnosisId` 유지).
6. 사전평가 결과가 나쁘면 개념 학습을 더 천천히, 좋으면 빠르게 진행한다.
7. tool 호출이 실패하거나 extension이 없으면, 그 사실을 학습자에게 알리고 `/reload` 또는 `bash pi/install.sh --restore` 를 안내한다. 수동 fallback(직접 파일 열기/복사)은 제공하지 않는다 — diagnosis는 extension 기반이 표준이다.

`diagnosis.md` 초기 헤더 템플릿:

```md
# 사전진단 결과 — {챕터 제목}

- 상태: 진행 중
- 진단: /study-chapter diagnosis → study_diagnosis_open

## 결과 기록

아직 채점 전입니다.
```

### 개념 학습
- diagnosis.md의 약점을 우선 커버한다.
- 개념 학습은 Pi TUI 대화로 진행한다. full interactive HTML로 만들지 않는다.
- 단, 개념 학습은 채팅 기록으로만 남기지 않는다. **lab 또는 test로 전환하기 전에 반드시 `ch-{slug}/concept.md`를 생성하거나 최신화한다.**
- `concept.md`는 채팅 요약이 아니라, 나중에 여러 챕터의 `concept.md`만 모아도 교과서처럼 읽을 수 있는 독립 문서여야 한다.
- 개념 학습 범위는 챕터 README의 `학습 목표`, `다룰 개념과 용어`, `개념 관계도`를 기준으로 삼는다. 챕터 README에 `완료 기준`이 없어도 정상이다.
- 개념을 설명할 때는 직접적이고 구체적으로, 모든 중간 상태를 보여주고, 12살에게 설명하듯 쉽게 쓴다.
- 추상 용어를 쓰기 전에는 일상어로 먼저 풀어준다.
- 주제에 맞는 구체 예시를 반드시 사용한다. 예: 개발/DB는 코드·SQL·데이터, 글쓰기는 문장·문단 전후 비교, 언어학습은 발화·대화문, 음악은 악보·리듬 패턴, 업무 프로세스는 실제 상황/문서 흐름.
- 구조, 흐름, 순서, 관계가 이해에 도움이 되면 mermaid 다이어그램을 사용한다.
- `concept.md`에는 자기점검 섹션을 만들지 않는다. 이 문서는 문제지가 아니라 교과서형 개념 노트다.

`concept.md` 구조:

```md
# {챕터 제목}

- 챕터: ch-01-...
- 생성: YYYY-MM-DD
- 기반: diagnosis.md 약점 + 개념 학습 대화

## 이 장에서 배우는 것
이 개념이 왜 필요한지, 어떤 문제를 푸는지를 2~3문장으로 설명한다.

## 핵심 개념
진단 약점과 실제 학습 대화에서 다룬 핵심 개념을 교과서처럼 정리한다.
각 개념은 하위 절로 나눈다.

### {개념명}
- 한 줄 정의
- 일상어 설명
- 구체 예시
- 중간 상태
- 필요 시 mermaid 다이어그램

## 단계별 작동 원리
before → step 1 → step 2 → after 순서로 중간 상태를 생략하지 않고 설명한다.

## 핵심 비유 / 모델
학습 중 나온 비유와 머릿속 모델을 정리한다.
비유가 어디까지 맞고 어디서 깨지는지도 함께 쓴다.

## 흔한 함정
진단 오답, 대화 중 오해, 실제 적용에서 틀리기 쉬운 부분을 정리한다.
왜 틀렸는지까지 설명한다.

## 정리
핵심 내용을 3~5개 bullet로 압축한다.
```

### lab (실습)
- lab으로 전환하기 직전, 먼저 `concept.md`가 최신인지 확인한다. 없거나 현재 개념 학습 내용이 반영되지 않았으면 먼저 생성/최신화한다.
- 그 다음 학습자에게 아래처럼 lab 전환을 안내한다.

```text
완료: 개념 학습 내용을 concept.md로 정리했습니다.
다음: 실습으로 이해를 확인합니다.
실행: ch-01 대표 실수/오류/어려운 상황을 재현하는 실습 세트를 만들고 lab/README.md를 작성하겠습니다.
```

- `lab/` 디렉토리에 실습 과제 파일을 생성한다(확장자는 도메인에 맞게).
- lab 시작 전 또는 시작 시 `lab/README.md`를 체크리스트 형식으로 생성한다.
- 학습자가 직접 수행한 결과/로그/산출물/실행계획/스크린샷/문서 초안 등 주제에 맞는 증거를 lab/에 첨부하도록 안내한다.
- 완료 후 결과를 확인하고, 틀린 부분이 있으면 피드백한다.

`lab/README.md` 구조:

```md
# 실습 — {챕터 제목}

## 목표
이번 실습에서 확인할 것.

## 단계
- [ ] 1. 따라 하기: 예시/시범/샘플을 따라 수행한다.
- [ ] 2. 변형하기: 조건, 입력, 상황, 표현, 난이도 중 일부를 바꿔 수행한다.
- [ ] 3. 독립 수행: 힌트 없이 직접 수행하고 결과를 남긴다.

## 완료 조건
무엇을 제출/확인하면 완료인지.

## 산출물
- 파일 또는 결과 위치
- 주제에 맞는 증거: 실행 로그, 쿼리 결과, 문서 초안, 녹음/대본, 스크린샷 등
```

### test (테스트)
- `test.md`에 학습 완료 확인 문제를 출제한다.
- diagnosis보다 한 단계 높은 난이도로 구성한다.
- lab에서 본 예시를 그대로 반복하지 말고, 조건/상황/입력/표현을 바꾼 변형 문제로 낸다.
- 기억에서 꺼내고 판단하게 만든다. 힌트나 바로 직전 예시 의존을 줄인다.
- 헷갈리는 개념 쌍이 있으면 비교/구분 문제를 포함한다.
- 통과 기준을 명시하고, 미달 시 부족한 개념만 다시 학습하도록 안내한다.
- 결과를 `test.md`에 기록한다.

### review (복습)
- 복습은 `/study-review` 커맨드로 위임한다. 에이전트는 Verifier/Reinforcer/Curious Student/Anchorer/Scheduler 역할로 5단계(blank-recall → gap-fill → self-lecture → analogy-lock → schedule)를 진행한다.
- `review/` 디렉토리가 없으면 생성한다.
- 피드백은 본 학습 범위(concept/lab)로 한정. 벗어나면 `review/learning-gaps.md`에 분류.

## 종료 조건

- 모든 단계를 완료했으면 "이 챕터 완료" 메시지와 함께 다음 챕터 번호를 안내한다.
- 중간에 끝낼 경우 "다음에 /study-chapter 로 이어서 시작" 메시지를 남긴다.
