# 디자인 토큰

## 목차
- [문서 목적](#문서-목적)
- [토큰 구조](#토큰-구조)
- [색상](#색상)
- [타이포그래피](#타이포그래피)
- [간격 / 여백](#간격--여백)
- [그림자](#그림자)
- [둥근 모서리](#둥근-모서리)
- [Z-Index](#z-index)
- [반응형 브레이크포인트](#반응형-브레이크포인트)

## 문서 목적

- 프로젝트의 모든 시각 원자값을 정의
- 디자인과 개발이 같은 값을 참조하기 위한 단일 진실 공급원

## 토큰 구조

3계층 구조로 관리:

```
Primitive Token (raw value) → Semantic Token (의미/용도) → Component Token (컴포넌트 바인딩)
```

예시:
- `blue-500: #3B82F6` (primitive)
- `color-primary: blue-500` (semantic)
- `button-bg-primary: color-primary` (component)

---

## 색상

### Primary

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-primary` | — | 주요 액션, 강조 |
| `--color-primary-hover` | — | 호버 상태 |
| `--color-primary-text` | — | Primary 위의 텍스트 |

### Neutral

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-bg` | — | 배경 |
| `--color-surface` | — | 카드/서피스 |
| `--color-text` | — | 본문 텍스트 |
| `--color-text-secondary` | — | 보조 텍스트 |
| `--color-border` | — | 테두리 |

### Semantic

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-success` | — | 성공 |
| `--color-warning` | — | 경고 |
| `--color-error` | — | 오류 |
| `--color-info` | — | 정보 |

---

## 타이포그래피

### Font Family

- System font stack 또는 프로젝트 지정 폰트

### Font Size Scale

| 토큰 | 크기 | 용도 |
|------|------|------|
| `--text-xs` | — | |
| `--text-sm` | — | |
| `--text-base` | — | 본문 |
| `--text-lg` | — | |
| `--text-xl` | — | |
| `--text-2xl` | — | 제목 |
| `--text-3xl` | — | 큰 제목 |

### Weight

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--weight-regular` | 400 | 본문 |
| `--weight-medium` | 500 | 강조 |
| `--weight-bold` | 700 | 제목 |

### Line Height

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--leading-tight` | 1.25 | 제목 |
| `--leading-normal` | 1.5 | 본문 |

---

## 간격 / 여백

### Spacing Scale

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--space-1` | — | 4px |
| `--space-2` | — | 8px |
| `--space-3` | — | 12px |
| `--space-4` | — | 16px |
| `--space-5` | — | 20px |
| `--space-6` | — | 24px |
| `--space-8` | — | 32px |
| `--space-10` | — | 40px |
| `--space-12` | — | 48px |

---

## 그림자

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--shadow-sm` | — | 가벼운 그림자 |
| `--shadow-md` | — | 보통 |
| `--shadow-lg` | — | 모달/팝오버 |

---

## 둥근 모서리

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--radius-sm` | — | 버튼 |
| `--radius-md` | — | 카드 |
| `--radius-lg` | — | 모달 |
| `--radius-full` | — | 원형 |

---

## Z-Index

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--z-dropdown` | — | 드롭다운 |
| `--z-sticky` | — | 고정 헤더 |
| `--z-modal` | — | 모달 |
| `--z-toast` | — | 토스트 |

---

## 반응형 브레이크포인트

| 이름 | 너비 | 용도 |
|------|------|------|
| `sm` | — | 모바일 |
| `md` | — | 태블릿 |
| `lg` | — | 데스크탑 |
