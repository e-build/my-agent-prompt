# vendor

| 파일 | 출처 | 버전 | 라이선스 | SHA-256 |
|---|---|---|---|---|
| `mermaid.min.js` | npm `mermaid` 패키지의 `dist/mermaid.min.js` | 12.3.0 | MIT (`mermaid.LICENSE`) | `336df803d87a38b70a01e736e666c8f7601d2ce42f5e47c8fafe5d721074b9a3` |

- 교과서 HTML이 외부 요청 없이 Mermaid 다이어그램을 그리도록 결과물에 복사한다. 다이어그램이 있는 페이지만 불러온다.
- 수정하지 않는다. 버전을 올릴 때는 `npm pack mermaid@<버전>`으로 받아 파일·라이선스·이 표의 버전과 SHA-256을 함께 바꾸고, headless Chrome으로 CSP 아래 렌더링을 다시 확인한다.
- `securityLevel: "strict"`로 초기화한다(`assets/book/book.js`).
