# 공유 에이전트 프롬프트 자원

Pi·OpenCode·Claude Code·Codex 4개 코딩 에이전트가 함께 쓰는 스킬·명령·참조 문서·런타임 코드의 정본 저장소.

본문은 `resources/`에 한 번만 작성하고, 도구별 차이(호출 문법·설치 경로·실행 코드)는 `adapters/`와 `runtime/`에서 처리한다.

## 목차

- [빠른 시작](#빠른-시작)
- [들어 있는 것](#들어-있는-것)
- [도구별 지원 현황](#도구별-지원-현황)
- [설치](#설치)
- [새 자원 추가하기](#새-자원-추가하기)
- [다른 세션에서 요청하기](#다른-세션에서-요청하기)
- [검증과 상세 문서](#검증과-상세-문서)

## 빠른 시작

저장소 루트에서 Bash(macOS·Linux·Git Bash)로 실행.

```bash
# 1. 직접 관리하는 스킬 설치 → ~/.agents/skills/
bash scripts/install-skills

# 2. (선택) 외부 스킬 설치
python3 scripts/sync-external-skills

# 3. 쓰는 도구의 자원 설치
bash scripts/install-pi --restore --copy-config   # Pi
bash scripts/install-opencode                     # OpenCode
bash scripts/install-claude                       # Claude Code
bash scripts/install-codex                        # Codex

# 4. 구조 검증
bash scripts/check-resources --quiet
```

설치 후 각 도구를 다시 시작하면 반영된다. 이후 저장소를 수정하면 링크로 바로 반영되므로 재설치는 새 스킬·명령을 추가했을 때만 필요하다.

## 들어 있는 것

| 구분 | 위치 | 내용 |
|------|------|------|
| 스킬 | `resources/skills/<category>/` | `dev`(설계 검증·리팩터링·문서 가독성), `super`(브레인스토밍·진단·TDD·계획 작성), `tool`(문서 검색·handoff·학습·스킬 작성), `shopl`(Shopl 업무 전용) |
| 외부 스킬 | [external-skills.json](resources/external-skills.json) | upstream URL·브랜치·선택 경로만 등록. 원본은 저장소 밖 클론 |
| 공유 명령 | `resources/commands/` | `me-ladder-*`(제1원리 설명·퀴즈·로드맵 등 학습), `me-flip-*`(관점 뒤집기), `zz-workflow-*`(문서 선행 기능개발 절차 설치·진행) |
| 참조 문서 | `resources/references/` | 아키텍처 가이드, 문서화 규칙, 리뷰 체크리스트 |
| 템플릿 | `resources/templates/feature-workflow/` | `zz-workflow-init`이 대상 프로젝트에 복사하는 문서 템플릿 |
| adapter | `adapters/<tool>/` | 공유 명령을 호출하는 얇은 wrapper(Codex는 명시 호출 전용 스킬), OpenCode subagent 정의 |
| 런타임 | `runtime/pi/`, `runtime/opencode/` | Pi extension(`study` 학습 흐름, 푸터, 변경사항 리뷰 등)·테마·런처, OpenCode plugin |
| 외부 연동 | `integrations/cliproxyapi/` | CLI Proxy API 서버 구성과 Claude Code·Codex 연결 가이드 |
| 설계 기록 | `docs/plans/` | 기능별 설계·구현 계획·검증 기록 |

디렉터리 계약 전체와 에이전트 작업 원칙은 [AGENTS.md](AGENTS.md) 참고.

## 도구별 지원 현황

| 도구 | 스킬 | 명령 호출 예 | 런타임 | 설치 명령 |
|------|------|--------------|--------|-----------|
| Pi | `~/.agents/skills/` 직접 읽음 | `/me-ladder-explain` | extension·테마·설정·런처 | `install-pi` |
| OpenCode | `~/.agents/skills/` 직접 읽음 | `/me-ladder-explain` | plugin, subagent | `install-opencode` |
| Claude Code | `~/.claude/skills/` 브릿지 링크 | `/my-agent-prompt:me-ladder-explain` | — | `install-claude` |
| Codex | `~/.agents/skills/` 직접 읽음 | `$me-ladder-explain` (명시 호출 전용 스킬) | — | `install-codex` |

모든 도구별 설치 스크립트는 `resources/commands/`와 `resources/templates/`를 `~/.agents/commands/`, `~/.agents/templates/`로 링크한다. 명령 본문과 스킬은 저장소를 어디에 클론했든 이 고정 경로를 참조한다.

## 설치

저장소 루트에서 실행. 직접 관리하는 스킬과 외부 스킬 설치는 **별도 명령**.

```bash
# 직접 관리하는 스킬 → ~/.agents/skills/
bash scripts/install-skills

# 외부 사용 목록 최초 설치: 저장소 밖에 클론 + 선택 스킬 연결
python3 scripts/sync-external-skills

# 특정 외부 저장소만 명시적으로 최신화
python3 scripts/sync-external-skills --update diagram-design

# 도구별 자원 설치 (외부 스킬 설치·갱신은 수행하지 않음)
bash scripts/install-pi --restore --copy-config
bash scripts/install-opencode
```

- 스킬은 심링크로 설치. 사용자가 직접 관리하는 실제 디렉터리는 덮어쓰지 않음.
- Windows(Git Bash)에서 Developer Mode가 꺼져 있으면 심링크 대신 디렉터리 junction을 만든다. 관리자 권한 불필요.
- Windows에서 `python3`이 Microsoft Store 안내만 띄우면 `python scripts/sync-external-skills`처럼 실제 인터프리터로 실행.
- 외부 원본을 이 저장소에 복사하지 않음. 브랜치 추적 및 필요할 때만 수동 업데이트.
- Codex 스킬 설치 및 upstream 플러그인·에이전트 등록은 자동화 대상 아님.
- 스킬 설치와 실제 런타임 호환성은 별도 검증 필요.
- Pi 설치 후 모델·프로바이더 설정은 `~/.pi/agent/settings.json`에서 직접 수정. 자세한 내용은 [runtime/pi/README.md](runtime/pi/README.md).
- 외부 스킬의 경로·옵션·충돌 처리 기준은 [외부 스킬 관리](resources/external-skills.md) 참고.

## 새 자원 추가하기

| 만드는 것 | 위치 |
|-----------|------|
| 스킬 | `resources/skills/<category>/<name>/SKILL.md` |
| 외부 스킬 | `resources/external-skills.json`에 URL·브랜치·경로만 등록 |
| `/` 명령 | 본문은 `resources/commands/<name>.md`, 필요한 도구에만 wrapper(`adapters/<tool>/commands/<name>.md`, Codex는 `adapters/codex/skills/<name>/`) |
| Pi extension·테마 | `runtime/pi/extensions/`, `runtime/pi/themes/` |
| OpenCode plugin | `runtime/opencode/plugins/<name>/` |

adapter에는 본문을 복사하지 않고 `resources/`의 정본을 읽도록만 작성. 본문·스킬에서 저장소 파일을 가리킬 때는 절대 경로 대신 `~/.agents/...` 고정 경로를 쓴다. 추가 후 `bash scripts/check-resources`로 구조를 확인한다. 세부 규칙은 [AGENTS.md의 새 파일 위치](AGENTS.md#새-파일을-어디에-둘까) 참고.

## 다른 세션에서 요청하기

이 저장소에서 새 세션을 열고 다음처럼 요청 가능.

```text
이 GitHub 스킬을 외부 사용 목록에 등록만 해줘: <URL>. 원본 복사 없이 참조로 관리해줘.

등록된 diagram-design 외부 스킬을 설치해줘. 기존 원본 업데이트는 하지 마.

diagram-design 외부 스킬을 최신 main으로 업데이트하고 전후 커밋과 링크 상태를 알려줘.

외부 스킬 사용 목록과 설치 상태만 확인해줘. 설치나 업데이트는 하지 마.
```

다른 프로젝트에서 요청할 때는 **이 저장소 경로**를 함께 지정. 에이전트는 [AGENTS.md의 외부 스킬 요청 처리](AGENTS.md#외부-스킬-요청-처리)를 시작점으로 관리 문서와 사용 목록 확인.

등록·설치·업데이트·실행 검증은 서로 다른 작업. 이전 대화나 목록 등록만으로 설치 완료를 가정하지 않음. 자세한 요청 예시는 [다른 세션에서 요청하는 방법](resources/external-skills.md#다른-세션에서-요청하는-방법) 참고.

## 검증과 상세 문서

```bash
# 기존 자원 구조 검사
bash scripts/check-resources --quiet

# 외부 스킬 관리 명령의 오프라인 통합 테스트
python3 scripts/tests/test-sync-external-skills.py
```

테스트는 임시 로컬 Git 저장소 사용. 사용자 전역 스킬 경로와 네트워크 변경 없음. 실제 upstream 설치·실행 성공을 보증하는 테스트는 아님.

- [저장소 작업 지침](AGENTS.md)
- [외부 스킬 관리·운영 절차](resources/external-skills.md)
- [외부 스킬 사용 목록](resources/external-skills.json)
- [외부 스킬 구현 계획과 검증 기록](docs/plans/external-skills.md)
- [Pi 런타임](runtime/pi/README.md) · [study extension](runtime/pi/extensions/study/README.md)
- [OpenCode plugin](runtime/opencode/README.md)
- [CLI Proxy API 연동](integrations/cliproxyapi/README.md)
