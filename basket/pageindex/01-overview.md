# PageIndex 개요

> **저장소**: https://github.com/VectifyAI/PageIndex  
> **Stars**: 24,702 | **Forks**: 2,073 | **License**: MIT  
> **설명**: Document Index for Vectorless, Reasoning-based RAG

---

## 핵심 개념: Vectorless RAG

PageIndex는 기존 RAG(Retrieval-Augmented Generation)와 근본적으로 다른 접근법을 취한다.

| 구분 | 기존 Vector RAG | PageIndex |
|------|----------------|-----------|
| 검색 단위 | 고정 크기 청크 (e.g. 512 tokens) | 문서 섹션 (계층 트리) |
| 저장 방식 | 임베딩 벡터 DB | JSON 트리 인덱스 |
| 검색 방식 | 코사인 유사도 | LLM 추론 (구조 탐색) |
| 비유 | 색인 없는 책에서 단어 검색 | 목차 보고 필요한 장 찾기 |
| 설명 가능성 | 낮음 (벡터 유사도) | 높음 (경로 추적 가능) |

### 핵심 아이디어

문서를 **계층적 트리 인덱스**로 변환한다. 에이전트는 이 트리를 보고 "어느 섹션을 읽어야 하는가"를 추론하여 **필요한 페이지만 가져온다**.

```
문서
├── 1장: 서론 (p.1–3)
├── 2장: 방법론 (p.4–15)
│   ├── 2.1 데이터 수집 (p.4–7)
│   └── 2.2 분석 방법 (p.8–15)
└── 3장: 결론 (p.16–20)
```

에이전트가 "데이터 수집 방법"을 찾으면 → 트리에서 2.1을 선택 → p.4–7만 읽음.

---

## 저장소 구조

```
pageindex/
├── __init__.py          # 공개 API: page_index_main, md_to_tree,
│                        #           get_document, get_document_structure,
│                        #           get_page_content, PageIndexClient
├── page_index.py        # 핵심: PDF → 트리 인덱스 (49KB)
├── page_index_md.py     # Markdown → 트리 인덱스
├── retrieve.py          # 에이전트용 도구 함수 3개
├── client.py            # PageIndexClient (고수준 API)
├── utils.py             # LLM 호출, PDF 파싱, JSON 유틸
└── config.yaml          # 기본 설정
examples/
├── agentic_vectorless_rag_demo.py   # OpenAI Agents SDK 데모
├── documents/           # 샘플 PDF
└── workspace/           # 캐시된 인덱스
requirements.txt         # litellm, pymupdf, PyPDF2, python-dotenv, pyyaml
run_pageindex.py         # CLI 진입점
```

### 기본 설정 (`config.yaml`)

| 파라미터 | 기본값 | 의미 |
|---------|--------|------|
| `model` | `gpt-4o-2024-11-20` | 인덱싱용 LLM |
| `retrieve_model` | `gpt-4.1` | 검색용 LLM |
| `toc_check_page_num` | `20` | TOC 탐지 범위 (앞 N 페이지) |
| `max_page_num_each_node` | `10` | 노드당 최대 페이지 수 |
| `max_token_num_each_node` | `20000` | 노드당 최대 토큰 수 |

---

## 성능

**FinanceBench 벤치마크: 98.7%** (Mafin 2.5 시스템, PageIndex 기반)

### 최적 사용 사례

- 10-K/연간보고서, 법률 문서, 기술 매뉴얼, 논문 등 장문 전문 문서
- 문서 구조 이해가 필요한 QA ("Appendix G 참조" 같은 교차 참조)
- 검색 경로가 설명 가능해야 하는 환경

### 부적합한 사례

- 컨텍스트에 충분히 들어가는 짧은 문서
- 텍스트 추출 품질이 낮은 스캔 PDF
- 높은 처리량 / 낮은 지연 시간이 필요한 검색 엔진
- 비구조화된 메모 모음
