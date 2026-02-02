---
description: Execute documentation for a topic, feature, or implementation
agent: doc-manager
---

# 문서화 실행

**주제**: $ARGUMENTS

---

## 문서화 규칙

@~/.config/opencode/refs/docs-rules.md

---

## 실행 절차

### Phase 1: 주제 분석

1. **주제 파악**
   - 자연어 주제 해석
   - 핵심 키워드 추출
   - 문서화 범위 결정

2. **관련 자료 탐색**
   - `src/` 관련 코드 검색
   - 기존 `docs/` 문서 확인
   - 필요시 공식문서/웹 탐색 (librarian 활용)

### Phase 2: 구조 결정

1. **Feature 식별**
   - 기존 feature에 추가 vs 새 feature 생성
   - 새 feature: 적절한 번호/이름 결정

2. **문서 분류**
   - learning/ vs design/ 판단
   - 양쪽에 걸치면 분리 작성

### Phase 3: 문서 작성

1. **learning/** (해당시)
   - 개념/이론 중심
   - 출처 명시 필수
   - 비교/분석 포함

2. **design/** (해당시)
   - 우리 시스템 설계 중심
   - 추상화 수준 유지
   - Mermaid 다이어그램 활용

3. **공통**
   - 목차 포함
   - 파일명 규칙 준수

### Phase 4: index.md 관리

- 새 문서 링크 추가
- docs/README.md 업데이트 (새 feature인 경우)

---

## 출력

### 생성된 파일
```
docs/{feature}/
├── index.md (신규/수정)
├── learning/{생성된 파일}
└── design/{생성된 파일}
```

### 요약
- 문서화 범위
- 생성된 문서 목록
- 주요 내용

### 후속 제안
- 추가 문서화 권장 주제
- 연결 가능한 기존 문서
