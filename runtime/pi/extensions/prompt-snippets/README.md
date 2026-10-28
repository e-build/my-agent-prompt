# Prompt Snippets

## 목차

- [기능](#기능)
- [사용법](#사용법)
- [스니펫 관리](#스니펫-관리)
- [검증](#검증)
- [출처와 이용 조건](#출처와-이용-조건)

## 기능

선택한 짧은 프롬프트 규칙을 **다음 메시지 앞·뒤에 한 번 적용**하는 Pi 확장. 시스템 프롬프트나 영구 설정을 변경하는 방식이 아니라, 전송할 사용자 메시지 본문에 규칙을 결합하는 방식.

- `prepend` 그룹 → 입력 메시지 → `append` 그룹 순서로 결합. 각 그룹은 `order`, 동률이면 이름순 정렬.
- 활성 규칙은 에디터 위 위젯에 표시.
- 메시지 전송 후와 세션 시작 시 선택 초기화.
- 터미널 대화형 모드에서만 선택 메뉴 지원. RPC·print 모드에서는 메뉴 사용 불가.

## 사용법

저장소에 추가하는 작업과 전역 Pi에 설치하는 작업은 별개. 설치가 필요할 때 저장소 루트에서 실행:

```bash
bash scripts/install-pi --restore
```

기존 설치 스크립트가 이 디렉터리를 `~/.pi/agent/extensions/prompt-snippets`에 연결. 위 명령은 다른 레포 Pi 자원도 함께 설치하며, 설정 예시를 복사하는 `--copy-config`는 불필요. 설치 후 Pi에서 `/reload` 실행 또는 재시작.

1. `/snippets` 또는 `Ctrl+S`로 메뉴 열기.
2. `↑`·`↓`로 이동, `Space`로 선택 전환.
3. `Tab`으로 전체 본문 미리보기. 미리보기의 `↑`·`↓`는 스크롤, `Tab`·`Esc`는 목록 복귀.
4. 목록에서 `Enter`로 선택 적용, `Esc`로 이번 변경 취소.
5. 메시지 전송 시 규칙 결합. 다음 메시지에도 쓰려면 다시 선택.

## 스니펫 관리

기본 제공 파일은 **`snippets/explain-clearly.md` 1개**. upstream 기본 스니펫 6개는 포함하지 않음. 표시 이름은 `Explain clearly`, 위치는 `append`, 정렬값은 `10`. 사용자 요청 문구 그대로 저장:

```text
Please be direct and specific. Show every intermediate step. Explain it in a way that a 12-year-old could understand. If necessary, please use Mermaid diagrams at appropriate points to supplement the explanation.
```

새 규칙은 `index.ts` 옆 `snippets/`에 Markdown 파일로 추가:

```markdown
---
name: 표시 이름
description: 메뉴에 표시할 설명
placement: append
order: 10
---
메시지에 붙일 규칙 본문
```

| 필드 | 생략 시 기본값 | 설명 |
|------|----------------|------|
| `name` | 확장자 없는 파일명 | 메뉴 표시 이름 |
| `description` | 빈 문자열 | 짧은 설명 |
| `placement` | `append` | `prepend` 또는 `append` |
| `order` | `9999` | 그룹 내 정렬값 |

- frontmatter 경계와 비어 있지 않은 본문 필수. 단순한 한 줄 `키: 값` 메타데이터만 지원하며 전체 YAML 문법은 미지원.
- 메뉴를 열 때와 선택된 규칙을 적용할 때 파일 재조회. 스니펫 수정만으로는 `/reload` 불필요.
- 설치 후 심링크 경로에서 수정해도 이 저장소 파일에 반영됨.

## 검증

```bash
node --test runtime/pi/extensions/prompt-snippets/prompt-snippets.test.mjs
bash scripts/check-resources --quiet
```

테스트는 설치된 Pi의 실제 확장 로더와 pi-tui 키 처리 사용. 입력과 위젯 UI만 테스트 드라이버로 대체하며, 실제 터미널 표시를 수동 확인한 것은 아님. 임시 디렉터리에서만 스니펫 변경.

전역 npm 설치 경로에서 `@earendil-works/pi-coding-agent` 탐색. 다른 위치에 설치했다면 패키지 루트 지정:

```bash
PI_PACKAGE_DIR=/path/to/node_modules/@earendil-works/pi-coding-agent \
  node --test runtime/pi/extensions/prompt-snippets/prompt-snippets.test.mjs
```

## 출처와 이용 조건

- 원본 저장소: [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config)
- 원본 확장: [`extensions/prompt-snippets/index.ts`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/index.ts)
- 기준 커밋: `f82da563ab05d66729492d64c7ed4e96db3663f3`
- `index.ts`는 해당 커밋 기반. 로컬 변경: 메뉴 단축키를 `Alt+S`에서 `Ctrl+S`로 변경. 자동 upstream 업데이트 없음.
- 로컬 추가분: 사용자 스니펫 1개, 회귀 테스트, 이 문서.
- 확인한 upstream 트리에 라이선스 파일이 없고 GitHub license API도 404 응답. **공개 저장소라는 이유만으로 자유 이용·재배포 가능하다고 간주하지 않음.** 임의 라이선스 부여 없이 출처 보존. 외부 배포 전에는 작성자 이용 허락 또는 적용 조건 확인 필요.
