---
description: jimmy-working wiki 품질을 검사하고 모순, 고아 페이지, 누락 링크 등을 수정한다
---

# Wiki Lint

jimmy-working wiki의 건강 상태를 점검하고 품질 문제를 수정하는 워크플로우를 실행한다.

**Wiki 경로**: `/Users/donggeollee/Obsidian/jimmy-working`

## 사용법

```
/wiki-lint
```

인자 없이 실행. 전체 위키를 순회하며 아래 항목들을 점검한다.

---

## 워크플로우

### 0. Schema 확인

`/Users/donggeollee/Obsidian/jimmy-working/AGENTS.md` 를 읽어 위키 구조와 규칙을 확인한다.

### 1. 전체 페이지 목록 수집

`wiki/index.md` 를 읽고, 실제 파일시스템도 확인해 index에 없는 페이지를 발견한다:

```bash
find /Users/donggeollee/Obsidian/jimmy-working/wiki -name "*.md" \
  ! -name "index.md" ! -name "log.md"
```

### 2. 점검 항목 순회

각 페이지에 대해 아래를 검사한다:

#### A. 프론트매터 유효성
- `type`, `title`, `created`, `updated`, `status` 필드 존재 여부
- 유효한 type 값 (`entity`, `concept`, `project`, `decision`, `summary`)
- 올바른 날짜 형식 (YYYY-MM-DD)

#### B. 고아 페이지 (Orphan)
- `wiki/index.md` 에 등록되지 않은 페이지
- 어떤 다른 페이지에서도 `[[링크]]`로 참조되지 않는 페이지

#### C. 깨진 링크
- `[[wiki/xxx]]` 링크가 실제 파일로 연결되는지 확인
- `sources:` 프론트매터의 소스 파일이 실제로 존재하는지 확인

#### D. 누락 크로스레퍼런스
- 같은 entity 이름이 본문에 등장하지만 `[[링크]]` 없이 단순 텍스트로만 쓰인 경우
- `wiki/entities/` 파일명과 일치하는 키워드를 본문에서 검색

#### E. 모순 탐지
- 같은 주제를 다루는 페이지들에서 서로 상충되는 주장
- 특히 dates, 수치, 결정 사항에 주목

#### F. stale 페이지
- `updated` 날짜가 90일 이상 지난 페이지
- `status: active` 인데 오래된 페이지 (업데이트 필요 여부 판단)

#### G. 크기 위반
- 300줄을 초과하는 페이지 → 분리 대상으로 표시

#### H. index.md 정합성
- index.md의 링크/설명이 실제 파일과 일치하는지
- 총 페이지 수 카운트가 맞는지

### 3. 즉시 수정 가능한 항목 처리

아래는 자동으로 수정한다:
- 프론트매터 누락 필드 추가 (유추 가능한 값으로)
- 고아 페이지 → index.md에 추가
- 깨진 링크 → 주석 처리 또는 삭제
- 누락 크로스레퍼런스 → `[[링크]]` 추가
- index.md 총 페이지 수, 날짜 업데이트

### 4. 사용자 확인이 필요한 항목 표시

아래는 수정하지 않고 보고만 한다:
- 모순 (사용자가 판단해야 함)
- stale 페이지 (업데이트 여부는 사용자 결정)
- 300줄 초과 페이지 분리 (구조 변경은 사용자 승인 필요)

### 5. log.md append

```
## [YYYY-MM-DD] lint | 점검 완료
- 검사 페이지: N개
- 자동 수정: N건 (종류 목록)
- 요주의 항목: N건 (종류 목록)
- 모순 발견: N건
- stale 페이지: N개
```

### 6. Git commit (수정이 있는 경우)

```bash
cd /Users/donggeollee/Obsidian/jimmy-working
git add -A
git commit -m "lint: 위키 품질 점검 및 자동 수정 (YYYY-MM-DD)"
```

---

## 완료 보고 형식

```markdown
## Lint 결과 요약

**검사 일시**: YYYY-MM-DD
**검사 페이지**: N개

### 자동 수정 완료 (N건)
- [ ] 프론트매터 보완: N개 파일
- [ ] 고아 페이지 index 등록: N개
- [ ] 크로스레퍼런스 추가: N건
- [ ] 깨진 링크 처리: N건

### 요주의 항목 (사용자 확인 필요)
- ⚠️ 모순 발견: (페이지 쌍과 내용)
- ⏰ Stale 페이지: (목록)
- 📄 크기 초과 페이지: (목록)

### 전체 건강 점수
(주관적 평가: 문제 없음 / 경미 / 주의 필요 / 심각)
```
