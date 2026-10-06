# Study concept 전환 지침 통합 — 구현 계획

> test-driven-development 스킬 기준으로 단계별 구현.

**Goal:** 명령 진입과 진단 review ack 진입 모두 현재 concept 지침 전달. 신규 concept.md 생성 방지 정책 유지.

**Architecture:** 기존 phase 지침 로더 공용화. 진단 review 메시지 생성기를 독립 모듈로 분리해 같은 로더 사용. 메시지 전송의 비동기 변경은 기존 fallback 전달 유지.

**Tech Stack:** TypeScript, Node.js node:test, Pi extension.

## 목차

- [범위](#범위)
- [실행 단계](#실행-단계)
- [검증 기준](#검증-기준)

## 범위

- 변경: study-command.ts, index.ts, 새 diagnosis-review-prompt.ts 및 회귀 테스트
- 현재 instructions/concept.md를 정본으로 유지. 정책 문구 복사 없음.
- 새 파일 쓰기 guard, phase 상태 변경, 완료 판정 변경은 제외.
- 학습 프로젝트: 이 세션에서 잘못 생성한 concept.md만 제거. README와 진단 기록은 유지.
- 커밋·푸시는 별도 요청 전 수행하지 않음.

## 실행 단계

1. 기존 study-command 테스트 실행 및 green 확인.
2. 기존 진단 review prompt 생성기 동작 보존 분리. 기존 메시지 내용 테스트로 baseline 확인.
3. 일반/설명 우선 진입의 canonical concept 지침 누락 회귀 테스트 추가. 실제 누락으로 실패 확인.
4. phase 지침 로더 공용화 및 review 생성기에 연결. 비동기 전송 fallback 유지.
5. 명령 진입·브라우저 진입이 동일한 concept 지침을 포함하는지 확인. 학습 선호·약점·pinpoint 보존 테스트.
6. study 전체 테스트 및 diff 검사. 잘못 만든 학습 파일 제거.

## 검증 기준

- concept 지침 전체가 두 진입 경로에 포함.
- README 교과서 본문 및 새 concept.md 금지 규칙 전달.
- ready_to_continue/explain_first 모두 지침 포함.
- 결과 확인 메시지 ID·약점·pinpoint·선호 분기 유지.
- study 전체 테스트 통과.
- 학습 README 및 기존 진단 기록 변경 없음.
