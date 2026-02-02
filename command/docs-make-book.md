---
description: Compile all docs into a comprehensive reference book in docs/book/
agent: doc-manager
---

## 진행 상태 확인

**대상 디렉토리**: `docs/book/`

1. **진행 파일 확인**:
   - `docs/book/.docs-make-book-progress.md` 존재 여부 확인

2. **진행 파일 발견 시**:
   ```
   ⚠️  발견: 진행 중인 문서 종합본 생성 작업
   
   시작: {started} ({elapsed-time} 전)
   진행: Phase {current}/4 ({percentage}%)
   마지막 업데이트: {last_updated}
   
   완료된 단계:
   {list-of-completed-phases}
   
   선택:
   1. 이어서 진행 (Phase {current}부터)
   2. 처음부터 다시 시작 (기존 진행 및 생성된 파일 삭제)
   3. 취소
   ```
   
   **사용자 선택 대기**:
   - 선택 1: 진행 파일 읽고 해당 Phase로 점프
   - 선택 2: 진행 파일 및 `docs/book/` 내용 삭제 후 Phase 0부터 시작
   - 선택 3: 명령 종료

3. **진행 파일 없음**: Phase 0부터 시작

---

# 문서 종합본 생성

docs/ 전체를 종합하여 `docs/book/` 하위에 고품질 레퍼런스 북 생성.

---

## 문서화 규칙 참조

@~/.config/opencode/refs/docs-rules.md

---

## 목표

1. **통합**: 흩어진 문서를 체계적으로 통합
2. **정제**: 중복 제거, 일관성 확보
3. **구조화**: 학습 순서에 맞게 재배열
4. **완성**: 목차, 용어집, 색인 포함

---

## 출력 구조

```
docs/book/
├── README.md              # 책 소개, 대상 독자
├── toc.md                 # 전체 목차
├── glossary.md            # 용어집
├── learning-path.md       # 추천 학습 경로
│
├── part-1-foundation/     # Part 1: 기초
│   ├── _index.md
│   └── ch01-xxx.md
│
├── part-2-architecture/   # Part 2: 아키텍처
│   └── ...
│
├── part-3-features/       # Part 3: 기능별 상세
│   └── ...
│
├── part-4-advanced/       # Part 4: 고급 주제
│   └── ...
│
└── appendix/              # 부록
    ├── references.md
    ├── troubleshooting.md
    └── changelog.md
```

---

## 실행 절차

### Phase 0: 진행 추적 초기화

**목적**: 종합본 생성 진행 상태를 추적할 파일 생성

1. **docs/book/ 디렉토리 확인**:
   - 존재하지 않으면 생성: `mkdir -p docs/book`

2. **진행 파일 생성**:
   ```markdown
   ---
   command: docs-make-book
   target: docs/book/
   started: {ISO-8601-timestamp}
   phase: 1
   total_phases: 4
   last_updated: {ISO-8601-timestamp}
   ---
   
   ## 진행 상태
   
   현재 Phase: 1/4
   전체 진행률: 0%
   
   ## 완료된 단계
   
   (없음)
   
   ## 진행 중
   
   - [ ] Phase 1: 수집 및 분석
   
   ## 대기 중
   
   - [ ] Phase 2: 구조 설계
   - [ ] Phase 3: 콘텐츠 작성
   - [ ] Phase 4: 품질 검증
   
   ## 중간 결과
   
   (Phase 완료 시 추가됨)
   ```

3. **확인 메시지**:
   ```
   ✓ 진행 추적 시작: docs/book/.docs-make-book-progress.md
   ```

---

### Phase 1: 수집 및 분석

1. **문서 수집**: `docs/` 내 모든 마크다운 목록화
2. **분류**: Foundation / Architecture / Features / Advanced
3. **의존성 분석**: 문서 간 참조, 학습 순서 도출
4. **중복 탐지**: 유사 내용 식별

#### Phase 1 완료 - 진행 상태 업데이트

**진행 파일 업데이트**:

1. **중간 결과 저장**:
   ```markdown
   ### Phase 1 결과
   
   **문서 수집 완료**:
   - 전체 문서 수: {count}개
   - Foundation: {count}개
   - Architecture: {count}개
   - Features: {count}개
   - Advanced: {count}개
   
   **분류 완료**:
   {list-of-documents-by-category}
   
   **의존성 분석 완료**:
   - 참조 관계: {count}개
   - 학습 순서 도출됨
   
   **중복 탐지 완료**:
   - 중복 의심: {count}개
   {list-of-duplicates}
   ```

2. **진행 상태 업데이트**:
   - `phase: 2`
   - `last_updated: {timestamp}`
   - 진행률: 25% (1/4 완료)
   - 완료 목록에 Phase 1 추가

3. **파일 저장**: `docs/book/.docs-make-book-progress.md` 업데이트

---

### Phase 2: 구조 설계

1. **Part/Chapter 구성**: 논리적 그룹핑, 난이도 순
2. **목차 설계**: 전체 흐름, Cross-reference 계획

#### Phase 2 완료 - 진행 상태 업데이트

**진행 파일 업데이트**:

1. **중간 결과 저장**:
   ```markdown
   ### Phase 2 결과
   
   **구조 설계 완료**:
   - Part 수: {count}개
   - Chapter 수: {count}개
   
   **Part/Chapter 구성**:
   {list-of-parts-and-chapters}
   
   **목차 설계 완료**:
   - 전체 흐름 정의됨
   - Cross-reference 계획 수립됨
   ```

2. **진행 상태 업데이트**:
   - `phase: 3`
   - `last_updated: {timestamp}`
   - 진행률: 50% (2/4 완료)
   - 완료 목록에 Phase 2 추가

---

### Phase 3: 콘텐츠 작성

1. **README.md**: 책 소개, 대상 독자, 사용법
2. **각 Chapter**: 기존 문서 통합/정제, 일관된 스타일
3. **용어집**: 알파벳/가나다 순
4. **학습 경로**: 빠른 시작 / 기본 / 심화

#### Phase 3 완료 - 진행 상태 업데이트

**진행 파일 업데이트**:

1. **중간 결과 저장**:
   ```markdown
   ### Phase 3 결과
   
   **콘텐츠 작성 완료**:
   - README.md: 생성됨
   - toc.md: 생성됨
   - glossary.md: 생성됨 ({term-count}개 용어)
   - learning-path.md: 생성됨
   
   **Chapter 작성 완료**:
   {list-of-created-chapters}
   
   **통계**:
   - 전체 파일 수: {count}개
   - 전체 라인 수: {count}줄
   - 원본 매핑: {count}개 문서 통합
   ```

2. **진행 상태 업데이트**:
   - `phase: 4`
   - `last_updated: {timestamp}`
   - 진행률: 75% (3/4 완료)
   - 완료 목록에 Phase 3 추가

---

### Phase 4: 품질 검증

1. **링크 검증**: 모든 내부 링크 확인
2. **일관성**: 용어, 스타일 통일
3. **완성도**: 목차와 내용 일치

#### Phase 4 완료 - 최종 정리

**진행 파일 업데이트**:

1. **중간 결과 저장**:
   ```markdown
   ### Phase 4 결과
   
   **품질 검증 완료**:
   - 링크 검증: {total}개 중 {valid}개 정상
   - 깨진 링크: {count}개 {list-if-any}
   - 일관성 검증: 통과
   - 완성도 검증: 통과
   ```

2. **진행 상태 업데이트**:
   - `phase: 4`
   - `last_updated: {timestamp}`
   - 진행률: 100% (4/4 완료)
   - 완료 목록에 Phase 4 추가

---

#### 사용자 확인 및 완료

**Question 도구 사용**:

```
question: "문서 종합본 생성이 완료되었습니다. 결과를 확인하시겠습니까?"

선택지:
1. 결과 확인 (생성된 파일 목록 및 통계 표시)
2. 완료 (진행 파일 정리)
```

**선택지 1 선택 시**:
- 생성된 디렉토리 트리 표시
- 통계 출력 (Part/Chapter/용어집 수)
- 원본 매핑 표시
- 다시 선택지 제공 (완료 또는 수정)

**선택지 2 선택 시**:

1. **진행 파일 정리**:
   - 이름 변경: `.docs-make-book-progress.md` → `.docs-make-book-result.md`
   - 최종 상태 업데이트:
     ```markdown
     ---
     command: docs-make-book
     target: docs/book/
     started: {started}
     completed: {timestamp}
     status: completed
     ---
     
     ## 문서 종합본 생성 완료
     
     전체 진행률: 100%
     
     ## 생성 통계
     - Part 수: {count}
     - Chapter 수: {count}
     - 용어 수: {count}
     - 전체 파일: {count}개
     - 원본 문서: {count}개 통합
     
     ## 생성된 구조
     {directory-tree}
     ```

2. **완료 메시지**:
   ```
   ✓ 문서 종합본 생성 완료
   
   위치: docs/book/
   결과 파일: docs/book/.docs-make-book-result.md
   
   생성된 파일:
   - README.md
   - toc.md
   - glossary.md ({term-count}개 용어)
   - learning-path.md
   - {part-count}개 Part, {chapter-count}개 Chapter
   
   확인: docs/book/README.md
   ```

---

## 스타일 가이드

### Chapter 헤더
```markdown
# Chapter N: {제목}

> {한줄 요약}

## 목차
## 선행 지식
```

### Cross-reference
```markdown
> 💡 **더 알아보기**: [관련 주제](./path)
> ⚠️ **주의**: [Chapter X](./path)를 먼저 이해하세요.
```

---

## 출력 보고

- 생성된 구조 (디렉토리 트리)
- 통계 (Part/Chapter/용어집 수)
- 원본 매핑 (원본 → 통합 위치)

---

## 주의사항

1. **원본 보존**: docs/ 원본 수정하지 않음
2. **중복 최소화**: 복사보다 링크 활용
3. **점진적**: 기본 구조부터 시작

---

## 진행 추적 관리

### 중단된 생성 재개

진행 파일이 있으면 자동으로 재개 옵션 제공 (Phase 0 참조).

**재개 시 주의**:
- Phase 3 (콘텐츠 작성) 중 중단된 경우: 이미 생성된 파일 확인 후 이어서 작성
- 부분 완료된 Chapter는 덮어쓰기 또는 건너뛰기 선택 가능

### 진행 파일 수동 삭제

처음부터 다시 시작하고 싶은 경우:
```bash
rm docs/book/.docs-make-book-progress.md
rm -rf docs/book/*  # 생성된 파일도 모두 삭제
```

### 진행 파일 보관

완료된 생성 결과를 보관하려면:
- `.docs-make-book-result.md`로 자동 이름 변경됨
- 수동 삭제 가능: `rm docs/book/.docs-make-book-result.md`

### 증분 업데이트

docs/ 내용이 변경된 후 종합본 업데이트:
1. 기존 진행 파일 삭제: `rm docs/book/.docs-make-book-result.md`
2. 명령 재실행: `/docs-make-book`
3. 변경된 문서만 반영하려면 Phase 1에서 diff 확인 후 선택적 업데이트
