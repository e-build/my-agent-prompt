# 공유 에이전트 프롬프트 자원

## 목차

- [관리 대상](#관리-대상)
- [설치](#설치)
- [다른 세션에서 요청하기](#다른-세션에서-요청하기)
- [검증과 상세 문서](#검증과-상세-문서)

## 관리 대상

Pi·OpenCode·Claude Code·Codex가 공유하는 프롬프트 자원 관리 저장소.

| 대상 | 기준 위치 | 관리 방식 |
|------|-----------|-----------|
| 직접 관리하는 스킬 | `resources/skills/` | 이 저장소가 실행 지침의 정본 |
| 외부 스킬 | [external-skills.json](resources/external-skills.json) | 사용 참조만 관리. 실행 지침의 정본은 upstream |
| 공유 명령·참조·템플릿 | `resources/commands/`, `references/`, `templates/` | 도구 독립 본문 |
| 도구별 adapter·실행 코드 | `adapters/`, `runtime/` | 호출 문법·설치 경로·런타임 차이 처리 |

구조와 에이전트 작업 기준은 [AGENTS.md](AGENTS.md) 참고.

## 설치

저장소 루트에서 실행. 직접 관리하는 스킬과 외부 스킬 설치는 **별도 명령**.

```bash
# 직접 관리하는 스킬 → ~/.agents/skills/
bash scripts/install-skills

# 외부 사용 목록 최초 설치: 저장소 밖에 클론 + 선택 스킬 연결
python3 scripts/sync-external-skills

# 특정 외부 저장소만 명시적으로 최신화
python3 scripts/sync-external-skills --update im-not-ai

# 도구별 자원 설치 (외부 스킬 설치·갱신은 수행하지 않음)
bash scripts/install-pi --restore --copy-config
bash scripts/install-opencode
```

- 외부 원본을 이 저장소에 복사하지 않음. 브랜치 추적 및 필요할 때만 수동 업데이트.
- Pi·OpenCode는 공유 스킬 위치 사용. Claude Code는 별도 브릿지 링크 제공.
- Codex 스킬 설치 및 upstream 플러그인·에이전트 등록은 자동화 대상 아님.
- 스킬 설치와 실제 런타임 호환성은 별도 검증 필요.
- 상세 경로·옵션·충돌 처리 기준은 [외부 스킬 관리](resources/external-skills.md) 참고.

## 다른 세션에서 요청하기

이 저장소에서 새 세션을 열고 다음처럼 요청 가능.

```text
이 GitHub 스킬을 외부 사용 목록에 등록만 해줘: <URL>. 원본 복사 없이 참조로 관리해줘.

등록된 im-not-ai 외부 스킬을 설치해줘. 기존 원본 업데이트는 하지 마.

im-not-ai 외부 스킬을 최신 main으로 업데이트하고 전후 커밋과 링크 상태를 알려줘.

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

- [저장소 작업 지침](AGENTS.md)
- [외부 스킬 관리·운영 절차](resources/external-skills.md)
- [외부 스킬 사용 목록](resources/external-skills.json)
- [외부 스킬 구현 계획과 검증 기록](docs/plans/external-skills.md)

테스트는 임시 로컬 Git 저장소 사용. 사용자 전역 스킬 경로와 네트워크 변경 없음. 실제 upstream 설치·실행 성공을 보증하는 테스트는 아님.
