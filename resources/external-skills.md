# 외부 스킬 관리

## 목차

- [관리 경계](#관리-경계)
- [현재 구현 범위](#현재-구현-범위)
- [다른 세션에서 요청하는 방법](#다른-세션에서-요청하는-방법)
- [에이전트 처리 절차](#에이전트-처리-절차)
- [설치와 업데이트](#설치와-업데이트)
- [저장 위치와 안전 규칙](#저장-위치와-안전-규칙)
- [새 스킬 등록](#새-스킬-등록)
- [런타임 호환성](#런타임-호환성)

## 관리 경계

- 직접 관리하는 스킬: `resources/skills/`가 정본.
- 외부 스킬: [external-skills.json](external-skills.json)이 **사용 목록의 정본**이며, 실행 지침의 정본은 upstream 저장소.
- 외부 원본·참조 문서·스크립트를 이 저장소에 복사하거나 수정하지 않음.
- `category`는 사용 목록의 분류 정보. 실제 설치 경로는 Agent Skills 표준의 평면 이름 사용.
- 외부 스킬 설치는 기존 `install-skills`와 분리. 일반 설치 중 네트워크 접근·upstream 갱신 없음.

## 현재 구현 범위

| 작업 | 구현 상태 |
|------|-----------|
| 외부 사용 목록 등록 | URL·브랜치·분류·선택 스킬 경로 기록 |
| 최초 설치 | 전체 upstream 클론 및 선택 스킬 심링크 생성 |
| 반복 설치 | 기존 클론 유지, 없는 링크 연결. upstream 갱신 없음 |
| 명시적 업데이트 | `--update`에서만 fetch 및 fast-forward |
| 보호 규칙 | 기존 경로 충돌·원격/브랜치 불일치·로컬 수정·로컬 커밋 거부 |
| 검증 | 로컬 Git fixture 기반 테스트. [테스트 코드](../scripts/tests/test-sync-external-skills.py) 참고 |
| 자동화 제외 | 정기 갱신·삭제·태그/커밋 고정·lock 파일·플러그인/에이전트 등록 |

사용 목록 등록은 설치 완료를 뜻하지 않음. 클론과 링크 상태는 머신별 로컬 상태이며, 요청 시 실제 확인 필요. 실행 호환성은 별도 검증 대상.

## 다른 세션에서 요청하는 방법

이 저장소에서 세션 시작 권장. 다른 프로젝트에서 요청할 경우 이 저장소 경로와 [이 문서](external-skills.md)를 함께 지정.

| 의도 | 요청 예시 | 처리 범위 |
|------|-----------|-----------|
| 새 외부 스킬 등록 | `이 GitHub 스킬을 외부 사용 목록에 추가해줘: <URL>. 원본 복사 없이 참조 방식으로 관리하고, 등록만 해줘.` | upstream 구조 확인 후 JSON 수정. 전역 설치 없음 |
| 등록과 최초 설치 | `<URL>의 <스킬 이름>을 writing 분류로 외부 사용 목록에 추가하고 설치해줘.` | 목록 등록 후 해당 source 동기화. 기존 클론 갱신 없음 |
| 기존 목록 설치 | `등록된 diagram-design 외부 스킬을 설치해줘. 기존 원본은 업데이트하지 마.` | `python3 scripts/sync-external-skills diagram-design` |
| 특정 upstream 갱신 | `diagram-design 외부 스킬을 최신 main으로 업데이트하고 전후 커밋과 링크 상태를 알려줘.` | `python3 scripts/sync-external-skills --update diagram-design` |
| 전체 갱신 | `사용 목록에 등록된 외부 스킬을 모두 업데이트해줘.` | `python3 scripts/sync-external-skills --update` |
| 상태 확인만 | `외부 스킬 사용 목록과 로컬 설치 상태를 확인해줘. 설치나 업데이트는 하지 마.` | JSON·클론·링크 읽기만 수행 |
| 실행 확인 | `설치된 diagram-design을 이 에이전트에서 실제로 실행 가능한지 확인해줘.` | 원본 지침·런타임 의존성 확인 및 실행 검증. 설치 성공과 구분 |

외부 스킬을 **관리**하는 요청과 해당 스킬을 **사용**하는 요청은 별개. 설치·발견 상태 확인 후 `diagram-design으로 아키텍처 다이어그램을 만들어줘`처럼 원본 스킬 이름으로 사용 요청 가능. 관리용 slash command는 만들지 않았으며, 위 문장은 에이전트에게 보내는 자연어 요청 예시.

## 에이전트 처리 절차

1. [사용 목록](external-skills.json)과 이 문서 확인. 이전 대화나 구현 계획을 현재 상태의 근거로 사용하지 않음.
2. 등록·설치·업데이트·조회·실행 검증 중 요청 범위 구분. 대상 source나 스킬 선택이 불명확하면 확인 질문.
3. 새 등록 시 upstream의 실제 `SKILL.md` 위치, 기본 브랜치, 참조 파일 및 도구 전용 의존성 확인.
   - 저장소 URL만 주어졌다고 모든 스킬을 자동 선택하지 않음.
   - 직접 관리 스킬 및 외부 사용 목록과 이름 중복 확인.
   - 원본 복사·수정 대신 JSON 참조 등록. 분류는 메타데이터이며 `resources/skills/writing/` 등 디렉터리 생성 불필요.
4. 조회 요청에는 동기화 명령 실행 금지. 동기화 명령에는 최초 클론·링크 생성 부작용이 있고, dry-run·status 옵션은 없음.
5. 설치 요청에는 기본 명령, 최신화 요청에만 `--update` 사용. 이 저장소 밖에서는 `python3 <repo-root>/scripts/sync-external-skills ...`로 호출 가능.
6. 충돌이나 로컬 수정 발견 시 원인과 경로 보고 후 중단. 자동 삭제·reset·stash 또는 사용자 승인 없는 원본 수정 금지.
7. 실행 결과에서 source ID·브랜치·커밋·선택 스킬 링크 확인. 업데이트 전후 커밋과 실패한 대상을 구분해 보고.
8. 완료 보고는 **목록 등록 / 로컬 설치 / upstream 갱신 / 런타임 실행 검증**을 각각 구분. 실제 확인하지 않은 단계는 미검증으로 표시.

등록·관리 코드 변경 시 검증 명령 실행. 외부 원본 최신화만 수행한 경우 사용 목록 변경이나 이 저장소 커밋은 필요 없음. 새 세션에서는 로컬 스킬 발견 여부를 다시 확인하며, 현재 세션에 자동 반영되었다고 가정하지 않음.

## 설치와 업데이트

Git과 Python 3 필요. 저장소 루트에서 실행. 명령의 정본은 [sync-external-skills](../scripts/sync-external-skills).

```bash
# 전체 사용 목록 설치: 없는 저장소만 클론, 기존 클론은 그대로 연결
python3 scripts/sync-external-skills

# 특정 저장소만 설치
python3 scripts/sync-external-skills diagram-design

# 명시적 업데이트: 등록된 브랜치로 fetch + fast-forward
python3 scripts/sync-external-skills --update diagram-design

# 전체 upstream 업데이트
python3 scripts/sync-external-skills --update

# Claude Code 브릿지 생략
python3 scripts/sync-external-skills --no-bridge
```

현재 목록은 `diagram-design`의 `main`을 추적하며, `design` 분류의 `diagram-design` 선택.

업데이트는 새 upstream 지침을 받아들이는 작업이므로 변경 내용 검토 권장. 출력의 커밋 해시와 클론의 Git 이력으로 수신 버전 확인 가능. upstream 설치 스크립트는 실행하지 않음.

## 저장 위치와 안전 규칙

| 대상 | 기본 경로 | 재정의 환경변수 |
|------|-----------|-----------------|
| 사용 목록 | `resources/external-skills.json` | `EXTERNAL_SKILLS_MANIFEST` |
| 전체 upstream 클론 | `~/.local/share/agent-skills/sources/<id>/` | `EXTERNAL_SKILLS_SOURCES_DIR` |
| 선택 스킬 심링크 | `~/.agents/skills/<name>` | `AGENTS_SKILLS_DIR` |
| Claude Code 브릿지 | `~/.claude/skills/<name>` | `CLAUDE_SKILLS_DIR` |

- 전체 저장소 클론으로 스킬 디렉터리 밖의 원본 의존 파일도 보관.
- Claude 브릿지는 `~/.claude`가 존재할 때만 생성.
- 기존 실제 디렉터리·파일·다른 대상의 심링크 발견 시 **중단**. 사용자 자원 교체 없음.
- 원격 URL·브랜치 불일치, 로컬 파일 변경, fast-forward 불가능한 이력 발견 시 **중단**. 자동 reset·stash·병합 커밋 생성 없음. 정상 업데이트는 `merge --ff-only` 사용.
- 여러 source 처리에는 전체 롤백 없음. 뒤의 source에서 실패해도 앞의 클론 생성·갱신은 남을 수 있으므로 결과별 확인 필요. 링크 생성은 선택한 모든 source의 경로 검증 후 수행.
- `main` 등 브랜치 추적만 지원. 태그·커밋 고정 및 lock 파일은 현재 범위에서 제외.
- 사용 목록 항목 삭제만으로 기존 링크·클론이 자동 제거되지는 않음. 제거 시 해당 외부 스킬 심링크를 확인하고 수동 삭제 필요.
- 동시에 여러 동기화 명령 실행 금지.

## 새 스킬 등록

[external-skills.json](external-skills.json)의 `sources`에 다음 정보 추가.

```json
{
  "id": "source-id",
  "url": "https://github.com/owner/repository.git",
  "branch": "main",
  "category": "writing",
  "skills": [
    { "name": "skill-name", "path": "skills/skill-name" }
  ]
}
```

- `id`: 클론 디렉터리 이름 및 개별 동기화 선택자.
- `path`: 저장소 루트 기준 상대 경로. 해당 위치에 `SKILL.md` 필수.
- 스킬 이름은 전체 외부 사용 목록에서 중복 금지. 직접 관리 스킬과 중복은 등록 전에 수동 확인 필요.
- 동기화 스크립트는 기존 설치 경로와의 충돌을 차단하지만, 아직 설치하지 않은 `resources/skills/`와의 이름 중복까지 검사하지는 않음. 중복 상태에서 기존 `install-skills` 실행 금지.

검증 명령:

```bash
python3 scripts/tests/test-sync-external-skills.py
bash scripts/check-resources --quiet
```

테스트는 임시 로컬 Git 저장소 사용. 네트워크나 사용자 전역 설치 경로 변경 없음. `check-resources`는 기존 자원의 구조 검사이며, 외부 원격 접근·설치 상태·실행 호환성 검증이 아님.

## 런타임 호환성

**스킬 발견·심링크 설치와 실행 호환성은 별개.** 공유 위치에 설치해도 모든 에이전트에서 동일하게 동작한다는 보장 없음.

- Pi·OpenCode: `~/.agents/skills/`에서 발견 가능. 원본의 Claude 전용 도구·환경변수·에이전트 호출은 별도 실행 검증 필요.
- Claude Code: 스킬 브릿지만 제공. upstream 플러그인 등록이나 루트 `agents/`의 에이전트 등록까지 수행하지 않음.
- Codex: 이번 명령은 `~/.codex/skills/`를 변경하지 않음. upstream의 Codex 전용 패키지 설치 안내 참고.
- 원본이 `${CLAUDE_SKILL_DIR}`, 플러그인 루트 경로 추론, 다중 에이전트 호출에 의존하면 심링크 환경에서 추가 검증 필요. 설치 완료를 실제 기능 동작 검증으로 보고하지 않음.
