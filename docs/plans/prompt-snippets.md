# Prompt Snippets Implementation Plan

> **Implement task-by-task with the test-driven-development skill.**

## 목차

- [목표와 설계](#목표와-설계)
- [구현 순서](#구현-순서)
- [검증](#검증)

## 목표와 설계

**Goal:** upstream prompt-snippets 확장과 사용자가 지정한 설명 규칙 1개를 Pi 런타임 리소스에 추가.

**Architecture:** `runtime/pi/extensions/prompt-snippets/index.ts`에 원본 코드 보존. 같은 디렉터리의 `snippets/`에는 요청한 문구만 저장. 기존 `scripts/install-pi --restore`의 디렉터리 자동 연결 사용. 전역 설치·설정 변경 제외.

**Tech Stack:** TypeScript, Pi Extension API, pi-tui, Node.js 내장 테스트 러너 및 설치된 Pi 확장 로더.

- 선택한 규칙을 다음 메시지에만 적용하고 전송·세션 시작 시 선택 초기화.
- 사용자 문구는 수정 없이 `append`, `order: 10`으로 등록.
- upstream 기본 스니펫 6개 제외.
- upstream: https://github.com/amosblomqvist/pi-config
- 기준 커밋: `f82da563ab05d66729492d64c7ed4e96db3663f3`
- upstream 트리·GitHub license API에서 라이선스 파일 확인되지 않음. 임의 라이선스 부여 금지. 외부 재배포 시 이용 조건 확인 필요.

## 구현 순서

### 1. 회귀 테스트 작성 및 실패 확인

**TDD scenario:** New feature — full TDD cycle.

- 생성: `runtime/pi/extensions/prompt-snippets/prompt-snippets.test.mjs`
- 실제 Pi 로더로 임시 디렉터리에 복사한 확장 로딩. 터미널 UI 입력만 테스트 드라이버로 대체.
- 검증: 명령·단축키 등록, 선택·취소·미리보기, prepend/append 정렬, 한 번 적용, 세션 초기화, 파일 재조회, 비대화형 모드, 제공 스니펫 본문.
- 원본 파일이 없는 상태의 실패 확인 후 구현 진행.

### 2. 원본 코드와 사용자 스니펫 추가

- 생성: `runtime/pi/extensions/prompt-snippets/index.ts`
- 생성: `runtime/pi/extensions/prompt-snippets/snippets/explain-clearly.md`
- 원본 코드는 고정 커밋에서 가져오고 바이트 일치 확인.
- 스니펫 본문:

```text
Please be direct and specific. Show every intermediate step. Explain it in a way that a 12-year-old could understand. If necessary, please use Mermaid diagrams at appropriate points to supplement the explanation.
```

### 3. 사용법과 출처 문서화

- 생성: `runtime/pi/extensions/prompt-snippets/README.md`
- 수정: `runtime/pi/README.md`의 확장 구조·목록.
- `/snippets`, `Ctrl+Alt+S`, Space, Tab, Enter, Esc 안내.
- 자동 갱신 없는 vendored snapshot임을 명시.

## 검증

```bash
node --test runtime/pi/extensions/prompt-snippets/prompt-snippets.test.mjs
bash scripts/check-resources --quiet
git diff --check
```

- 테스트에는 설치된 `@earendil-works/pi-coding-agent` 필요. npm 전역 설치 위치에서 탐색하며 `PI_PACKAGE_DIR`로 패키지 루트 지정 가능.
- 기존 설치 스크립트는 임시 HOME/PI_HOME에서 실행해 새 확장 디렉터리 링크 확인.
- 실제 사용자의 전역 설치 경로와 설정 변경 없음.

### 실행 결과

- 추가 전 테스트: 확장·스니펫 부재로 8개 실패 확인.
- 추가 후 테스트: 8개 통과, 0개 실패. 설치된 Pi 확장 로더에서 원본 코드 로딩 성공.
- `scripts/check-resources --quiet`: 종료 코드 0.
- `git diff --check`: 종료 코드 0.
- 임시 HOME/PI_HOME의 `scripts/install-pi --restore`: 종료 코드 0. 확장 디렉터리 심링크와 스니펫 1개 확인.
- 최초 도입 시 고정 upstream 커밋과 `index.ts` 바이트 일치 확인. 이후 사용자 요청으로 단축키와 해당 주석을 `Alt+S`에서 `Ctrl+S`로 변경.
- 원본 SHA-256: `b8f8183b1e0ff7251753c6f415fa59e511d9e776a97d4a09159540b6618388a7`.
- 최초 도입 검증 당시 실제 터미널 수동 검증과 전역 설치는 수행하지 않음. 이후 요청으로 전역 확장 심링크 연결 완료.

### 단축키 충돌 회귀 수정

- 원인: 등록만 확인하는 테스트는 Pi 기본 키와의 충돌 진단을 실행하지 않았음. `Ctrl+S`는 `app.models.save` 등 기본 액션과 중복.
- 실제 `ExtensionRunner.getShortcuts`에서 스크린샷과 동일한 경고 재현.
- 사용자 선택에 따라 스니펫을 `Ctrl+Alt+S`로 이동. Pi 기본 단축키와 전역 keybindings.json 변경 없음.
- 회귀 테스트: 기본 `KeybindingsManager`와 실제 runner로 충돌 진단이 비어 있는지 확인. 수정 전 2개 실패, 수정 후 9개 전체 통과.
- 글로벌 심링크 경로와 현재 사용자 키바인딩으로 검증: `ctrl+alt+s` 등록, 충돌 진단 0개.
- 구조 검사와 `git diff --check` 통과.
