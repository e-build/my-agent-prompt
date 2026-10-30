# LearnHarness — 지식·명제·학습 지도 단위 조사

## 목차

- [조사 범위와 결론](#조사-범위와-결론)
- [단위별 구분](#단위별-구분)
- [명제의 분할과 추출 기준](#명제의-분할과-추출-기준)
- [동일성 판단과 병합](#동일성-판단과-병합)
- [추론과 선수 관계의 구분](#추론과-선수-관계의-구분)
- [학습 근거와 사실 검증의 한계](#학습-근거와-사실-검증의-한계)
- [현재 study 초안과의 차이](#현재-study-초안과의-차이)
- [근거 파일](#근거-파일)

## 조사 범위와 결론

- 대상: [amosblomqvist/learnharness](https://github.com/amosblomqvist/learnharness)
- 검토 커밋: `3dd52110bbcbcba81645453ce0a8fdc230594c47`
- 이번 조사 시 `git ls-remote`의 upstream HEAD와 로컬 checkout HEAD 일치 확인
- 근거: 실제 TypeScript 계약·추출/감사 프롬프트·저장/병합 코드·테스트 코드·저장소 포함 fixture
- 앱 실행·실제 LLM 추출·테스트 실행은 하지 않음. 정적 소스 조사이며 추출 품질을 실측한 결과 아님
- 일부 파일 머리말에 구형 `supports` edge와 plan→graph 설명이 남아 있음. 현행 schema·함수·프롬프트·검증 코드를 우선

**핵심: `지식 → 개념 → 명제`라는 3단계 엔티티 체계가 아님. 영구 그래프는 명제와 추론 사슬로 구성. 개념처럼 보이는 이름은 명제의 표시용 라벨이며, 학습 지도는 별도 세션 구조.**

## 단위별 구분

| 용어/구조 | 현행 의미 | 단위와 식별 기준 |
|---|---|---|
| Knowledge graph | 여러 수업·노트에서 추출한 내용 전체 | 명제들과 추론 사슬의 집합. 별도 상위 `Knowledge` 항목 모델이 아님 |
| Concept / core idea | 교수·추출 지침의 자연어 표현 | 별도 `Concept` 엔티티나 conceptId→propositionIds 계층 없음 |
| `GraphNode` / proposition | 영구 저장하는 기본 내용 | 정밀하고 자립적인 주장 `statement` 하나. `id`는 저장 코드가 발급 |
| `name` | 그래프에서 읽기 쉬운 짧은 이름 | 용어집 표제어 형태. 고유할 필요 없고 동일성 기준도 아님 |
| `GraphChain` | 전제들이 함께 결론을 함의하는 논증 | `premises[]` + `conclusion`. 별도 `arg_` ID |
| `PlanNode` | 현재 수업 지도의 주요 지점 | 에이전트가 선택한 slug·title·선택적 summary. 세션 범위 |
| Reasoning step | 수업을 진행하는 미세 단위 | 이미 받아들인 사실에서 다음 사실로 가는 한 번의 추론 이동 |
| Cluster | 그래프의 표시용 묶음 | 명제를 처음 생성한 출처 세션 기준. 개념 분류 체계나 의미 유사도 군집이 아님 |

`GraphNode`의 실제 필드:

```text
id, name, statement, aliases, createdAt, provenance
```

- `statement`: 명제의 정밀한 의미와 동일성 판단 기준
- `aliases`: 동일 주장에 대해 출처에서 사용한 다른 표현
- `provenance`: 해당 주장이 등장한 세션·메시지의 위치
- 별도 `conceptId`, 조건 목록, 명제 종류, 정확성 상태, 내용 버전, 숙련도 필드는 없음

### 실제 fixture의 예

저장소 테스트 자료 `tests/fixtures/golden-data/graph/nodes.jsonl:20`:

- `name`: `Transaction atomicity`
- `statement`: “A transaction groups several operations into one indivisible unit, so that after a crash either all of the operations or none of them are applied. This is the atomicity, the 'A', of ACID.”

이 레코드는 `Transaction atomicity`라는 개념 객체 아래 여러 명제를 둔 구조가 아님. **짧은 이름과 구체적 주장을 가진 명제 노드 하나.** 실제 statement는 두 문장이므로 ‘문장 하나 = 노드 하나’라는 기계적 분할도 아님. 예시는 데이터 형태의 증거이며 본 조사에서 내용의 정확성까지 검증한 것은 아님.

## 명제의 분할과 추출 기준

`EXTRACTION_CORE`와 `propositionProps`의 기준:

1. **하나의 자립적인 핵심 아이디어**
   - 원문을 보지 않은 사람도 이해할 수 있는 정밀한 주장
   - 원문의 ‘주장 3’, ‘공리 B’, 특정 문서 전개 순서에만 의존하는 표현 제외
2. **대상 세계에 관한 주장**
   - ‘학습자가 X를 이해했다’가 아니라 X 자체
   - 오개념은 학습자의 잘못이 아니라 올바른 교정 내용으로 추출
3. **논증에서 핵심 역할을 하는 내용**
   - 해당 주제의 참고서가 다룰 주요 아이디어
   - 논증에 필요 없는 예시·기호 풀이·재진술까지 모두 노드화하지 않음
   - 연결할 논증이 없는 핵심 명제는 독립 노드로 보존 가능
4. **기존에 추출한 내용 위에 이어 붙이기**
   - 같은 출처에서 이미 추출한 명제·사슬을 digest로 제공
   - 같은 내용을 재진술해 새 노드를 만들기보다 기존 ID 참조
   - 이미 도출한 결론을 다음 논증의 전제로 활용
   - 기존 결론의 재도출은 실질적으로 다른 경로일 때만 추가

**기계적 분할 알고리즘은 아님.** 고정 글자 수·문장 수, 개념별 명제 수, 정의/법칙/사례 등 강제 유형 체계 없음. ‘핵심성·자립성·한 아이디어’의 의미 판단은 LLM에 맡김.

수업의 `one step, one fact`와 저장 노드의 분할 기준도 동일하지 않음. 수업 지도 노드 하나를 설명하는 데 여러 reasoning step이 가능하며, 영구 그래프 추출기는 수업 지도와 별도로 교사 설명을 읽음.

## 동일성 판단과 병합

처리 흐름:

```text
extractor: 원문에서 새 명제와 논증 추출
→ auditor: 기존 그래프를 탐색해 동일 명제인지 판단
→ merger: 판정에 따라 ID 연결 또는 신규 생성, 사슬 저장
```

- 추출기: 원문을 보는 단계. 같은 출처의 기존 추출 결과를 활용
- 감사기: 원문이나 추론 사슬을 재검증하지 않음. 새 명제와 기존 그래프의 **동일성만** 판단
- 병합기: 의미 판단 없이 감사기의 `linkTo`를 적용하는 결정적 코드

감사기의 **equivalence bias**:

- 같은 주장의 바꿔 말하기·재서술·압축은 병합 우선
- 같은 주장을 다른 정밀도나 관점으로 표현한 경우에도 연결 지향
- 실제로 다른 주장은 분리
- 원문 표현이나 이름의 문자열 일치가 기준은 아님

정상적인 재등장 병합 결과:

- 첫 레코드의 `name`, `statement`, `createdAt` 유지
- 나중 표현은 `aliases`에 추가, 출처는 합집합
- 새로운 설명이 더 정밀하더라도 이 경로에서는 기존 statement를 최신 본문으로 교체하지 않음
- `linkTo`가 없으면 statement 문자열이 완전히 같아도 새 노드 생성. 이 동작을 확인하는 테스트 코드 존재

따라서 이 병합은 **동일 주장에 출처·표현을 누적**하는 기능이지, 버전별 기준 설명을 자동 수정하고 교재에 전파하는 현재 study 제안과 같은 기능이 아님.

## 추론과 선수 관계의 구분

### 영구 지식 그래프: 함의만

```text
A ∧ B ⇒ C
```

- A와 B가 **함께** C를 함의하는 관계
- `A→C`, `B→C`가 각각 충분하다는 뜻이 아님
- 같은 결론에 이르는 독립 논증은 별도 chain
- 중복 사슬의 키는 정렬한 전제 ID 목록 + 결론 ID
- 역사적 연결·서사 순서·누가 누구를 반박했는지 등의 연결만으로 chain 생성 금지
- 현행 schema에는 `supports`·일반 관련 관계 없음. 구형 주석의 유형과 구분 필요
- `nodes.jsonl`과 `chains.jsonl`이 저장 내용. 화살표·다중 전제 합류점은 여기서 생성하는 파생 뷰
- 단일 전제는 직접 화살표, 다중 전제는 합류점을 거쳐 결론으로 표시

### 수업 지도: 먼저 이해할 것

```text
선수 학습 지점 → 이를 필요로 하는 지점
```

- `PlanEdge.from`은 선수, `to`는 후속 지점
- 수업 계획의 노드는 토대·주요 경유지·목표 같은 구조적 지점. 매 대화 turn이나 모든 저장 명제와 1:1 대응하지 않음
- 영구 그래프 추출은 수업 지도에 의존하지 않으므로 plan node를 자동으로 같은 graph node에 접는 계약이 아님
- 지도 위치는 질문의 nodeId에서 도출. visited는 지나갔다는 의미이며 숙련·완료 판정이 아님

## 학습 근거와 사실 검증의 한계

- 세션에서 영구 그래프로 추출되는 입력은 교사가 학습자에게 제시한 설명 문장. 학습자 응답·thinking·퀴즈 블록·일반 도구 결과는 제외
- 가져온 개인 노트도 같은 추출 파이프라인 사용
- 학습자 응답과 사고 과정은 세션에 존재하지만 그래프의 이해도·점수 이벤트로 누적하지 않음
- 노드의 출처는 채팅의 특정 교사 메시지까지, chain은 현재 세션 수준. 노트는 파일 참조 수준
- 출처 위치는 어디에서 나온 내용인지의 증거이며 그 주장의 참을 증명하는 근거와 동일하지 않음

**‘TRUE proposition’은 지침이지 자동 증명 결과가 아님.**

- 감사기는 추출기를 신뢰하고 사실 여부·추론 타당성을 재확인하지 않음
- 코드 검증은 전제 최소 1개, 존재하는 ID, 결론의 자기 전제 금지, 세션 메시지 anchor 유효성 등 구조 중심
- 명제의 사실성이나 `premises ⇒ conclusion`의 논리적 타당성을 증명하는 엔진은 이 경로에 없음
- 레코드에 별도 조건 필드가 없으므로 필요한 한정은 statement에 담겨야 함. 자동으로 조건 누락을 방지하는 구조가 아님
- 사슬 단순화·삭제는 ledger를 다시 쓸 수 있어 모든 파일이 영구 불변 이력이라고 볼 수 없음

## 현재 study 초안과의 차이

조사 후 사용자 선택 반영: **도입 검토 1–6의 원칙 확정**. 명제·분해·관계에 이어 근거 확인·보수적 병합/교정 이력·묶음 교재/복습 경험 채택. 구체적 스키마·간격·이전/복구 계약은 후속 검토. LearnHarness에 관한 소스 조사 결과 자체는 변경 없음.

| 항목 | LearnHarness 현행 | study 결정·제안 |
|---|---|---|
| 기본 내용 단위 | 명제 하나 | **명제 기본 단위·예시 수준 분해 확정** — 독립적으로 다룰 주장 분리, 설명·기록은 보존 |
| 짧은 개념 이름 | 명제의 표시 라벨 | **큰 개념은 탐색용 이름·태그·목록으로 구성** — 별도 Concept 원본 계층 없이 시작 |
| 학습 순서 | 세션의 별도 PlanTree | **목표별 학습 경로를 추론과 구분 확정**. 지점 하나가 명제 여러 개를 참조 가능 |
| 관계 의미 | 영구 그래프의 전제 묶음→결론, 별도 수업 지도 | **추론·선수 학습·적용 맥락 구분 확정**. 공동 전제·독립 논증 보존, 물리 저장 방식은 미결 |
| 수집·확인 | 교사 설명·노트에서 추출, 감사기는 동일성 중심 | **근거 상태·미확정 사용 경계 확정**. 학습자 답변은 별도 수행 근거 |
| 병합·교정 | 같은 명제에 표현·출처 추가, 최초 본문 유지 | **보수적 병합·교정 버전·이전 ID/과거 답안 보존 확정**. 복구 구현은 후속 설계 |
| 학습 근거 | 세션에 보존, 지식 그래프에는 없음 | **실제 확인 범위의 명제·당시 버전·맥락에 연결 확정**. 질문과 교재는 묶어 구성 |
| 원본 형식 | JSONL 명제·사슬 | Markdown 중심 원본 + 구조화 정보 제안 |

설계 검토에 대한 함의:

- 앞서 제안한 ‘개념/원칙 기본 노드’는 LearnHarness의 모델을 그대로 옮긴 것이 아님
- 명제 기본 단위와 추론·선수 학습·적용 맥락의 의미 구분은 조사 후 별도 사용자 선택으로 확정. 추론 검토 절차·관계 이력·물리 저장 계약은 후속 설계
- ‘개념’을 여러 명제의 탐색 묶음으로 추가할 수는 있으나 이는 study의 확장안. LearnHarness에 이미 있는 Concept 계층으로 설명하면 안 됨
- 조건·버전·자료 근거·학습 근거 연결은 우리 요구에 따른 추가 계약. 원본의 공격적인 병합 정책이나 무검증 신뢰를 그대로 채택할 근거는 아님
- **조사 당시 요청은 원본 확인이며 조사 자체가 승인을 뜻하지 않음. 이후 별도 질문에서 명제 기본 단위를 명시적으로 확정. 분해 수준과 관계 의미도 후속 질문에서 각각 채택. 이후 검토 4는 1안, 5·6은 사용자 요청에 따라 추천안 채택. 저장 형식·복습 간격·레거시 이전·복구 세부 등은 여전히 제안**

## 근거 파일

아래 링크는 모두 검토 커밋에 고정.

- [GraphNode: name과 statement, GraphChain](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/core/contracts/graph.ts#L126-L151)
- [추출기 schema](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/agent/subagents/extraction.ts#L147-L220)
- [핵심 아이디어 분할·추론 추출 지침](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/agent/subagents/extraction.ts#L401-L433)
- [감사기의 동일성 판단과 equivalence bias](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/agent/subagents/extraction.ts#L537-L573)
- [교사 설명만 추출하는 입력 선택](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/core/coverage.ts#L38-L49)
- [실제 병합 reader와 그래프 파생](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/core/graph.ts#L395-L505)
- [수업 지도: 구조적 지점, 선수 관계, 추론 단계와의 구분](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/agent/prompts/teacher/10-planning.md#L15-L37)
- [수업의 one step, one fact](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/src/agent/prompts/teacher/20-teaching.md#L1-L10)
- [명제 예시: Transaction atomicity](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/tests/fixtures/golden-data/graph/nodes.jsonl#L20)
- [문자열 일치만으로 병합하지 않는 테스트](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/tests/graph.test.ts#L553-L577)
- [다중 전제·독립 논증 표시 테스트](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/tests/graph.test.ts#L1081-L1116)
