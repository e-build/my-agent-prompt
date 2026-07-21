# pi/ — Pi 코딩 에이전트 리소스

이 디렉토리는 [Pi coding agent](https://pi.dev) 전용 리소스를 관리합니다.
`bodies/`(공유 명령어 본문)와 `skills/`(Agent Skills)는 모든 에이전트 공용이며,
여기에는 Pi 전용 설치/테마/extension/config 만 포함됩니다.

## 구조

```
pi/
├── extensions/            ← Pi extension 모음
│   ├── custom-footer.ts       (토큰/비용/속도 푸터)
│   ├── context-command.ts     (/context 컨텍스트 분석)
│   ├── local-models.ts        (/local-models 로컬 LLM 매니저)
│   ├── safety-guard.ts        (/safety 위험 명령 차단)
│   ├── flow-title.ts          (맞춤형 시작 헤더)
│   ├── cliproxyapi-sync.ts    (cliproxy model 동기화 — 별도 설정 파일)
│   ├── cliproxyapi-sync-loading.md  (cliproxyapi-sync 동작 메커니즘 문서)
│   ├── filechanges/           (/filechanges 변경사항 리뷰/되돌리기)
│   └── study/                 (/study-init, /study-chapter, /study-review + 인터랙티브 사전진단 브라우저 세션)
├── themes/                ← Pi 테마 10종 (nebula-pulse, tokyo-night 등)
├── config/
│   ├── settings.example.json
│   └── mcp.example.json
├── bin/pi                 ← 컴팩트 Pi 런처
├── install.sh             ← 설치/복원 스크립트
└── sync.sh                ← ~/.pi/agent → pi/ 동기화
```

## 설치

```bash
# 전체 설치 (extensions + themes + config + launcher + cliproxyapi-sync symlink)
bash pi/install.sh --restore --copy-config

# cliproxyapi-sync 설정 파일 입력 (첫 실행 시)
# ~/.config/opencode/cliproxyapi-sync-config.jsonc
#   { "baseURL": "http://localhost:8317/v1", "apiKey": "..." }

# 마지막으로 settings.json에서 모델/프로바이더 설정
code ~/.pi/agent/settings.json
```

## 동기화

Pi 설정을 변경한 후 레포에 백업:

```bash
bash pi/sync.sh
```

`cliproxyapi-sync.ts`는 심링크로 관리되므로 sync에서 제외됩니다. 설정 파일(`cliproxyapi-sync-config.jsonc`)은 사용자 로컬에만 존재하므로 sync되지 않습니다.

## study extension

학습 커리큘럼(`study-{slug}` 프로젝트)과 인터랙티브 사전진단을 담당하는 self-contained extension.

| 구성 | 설명 |
|------|------|
| `prompts/study-init.md` | `/study-init <주제>` — 학습 프로젝트 생성 |
| `prompts/study-chapter.md` | `/study-chapter [챕터] [단계]` — 챕터 학습 (diagnosis/lab/test/review) |
| `prompts/study-review.md` | `/study-review [챕터] [단계]` — 5단계 복습 |
| `study_diagnosis_open` tool | diagnosis HTML 생성 + 로컬 서버 + 브라우저 자동 open + 제출 bridge |
| `assets/diagnosis-template.html` | 사전진단 UI 템플릿 (self-contained) |

`/study-chapter {챕터} diagnosis`는 `study_diagnosis_open` tool로 브라우저를 자동으로 열고, 학습자가 제출하면 답안이 현재 Pi 세션으로 전송되어 자동 채점된다. 채점 결과(정답/해설)는 같은 브라우저에 표시된다. 자세한 흐름은 `pi/extensions/study/README.md` 참조.

## Extension 설명

| Extension | 명령어 | 설명 |
|-----------|--------|------|
| `custom-footer.ts` | (자동) | 하단에 토큰/비용/속도/생각수준/CWD/브랜치 실시간 표시 |
| `context-command.ts` | `/context` | 시작/대화 컨텍스트 사용량 분석 (Claude Code 스타일) |
| `local-models.ts` | `/local-models` | Ollama/LM Studio/RunPod 등 로컬 LLM 등록 |
| `safety-guard.ts` | `/safety` | force push, rm -rf 등 위험 명령 차단 |
| `flow-title.ts` | (자동) | 시작 시 헤더 (full/minimal 모드, `/welcome mode minimal` 전환) |
| `filechanges/` | `/filechanges`<br>`/filechanges-accept`<br>`/filechanges-decline` | Pi edit/write 내역 리뷰 (select list), diff 확인, 일괄 승인/되돌리기 |
| `study/` | `/study-init`<br>`/study-chapter`<br>`/study-review` | 학습 프로젝트 + 인터랙티브 사전진단 브라우저 세션 (위 study extension 섹션 참조) |

## Skills

이 저장소 root `skills/` 디렉토리는 **Agent Skills** (에이전트가 자율 로드)를 포함합니다.
`~/.pi/agent/skills/`에 심링크하여 사용합니다.

> **Shared Command Bodies**: 슬래시 명령어(`/`)로 호출하는 공유 실행 본문은
> `~/.pi/agent/prompts/`의 Pi wrapper가 `../bodies/<name>.md` 를 참조합니다.
> 자세한 내용은 `AGENTS.md`의 [Shared Architecture by Resource Type](../AGENTS.md#shared-architecture-by-resource-type) 참조.

### abhinand5/pi-setup 포팅 스킬 (10개)

| Skill | 설명 | 비고 |
|-------|------|------|
| `diagnose` | 디버깅 전용 루프 (재현→최소화→가설→계측→수정→회귀) | scripts/hitl-loop.template.sh 포함 |
| `find-docs` | 웹/로컬 문서 검색 도우미 | |
| `grill-me` | 계획/설계를 결정 트리로 스트레스 테스트 | |
| `grill-with-docs` | 계획 검증 + CONTEXT.md/ADR 인라인 업데이트 | ADR-FORMAT.md, CONTEXT-FORMAT.md 포함 |
| `handoff` | 대화 압축 → 다른 에이전트 handoff 문서 생성 | |
| `hf-cli` | HuggingFace Hub CLI (모델/데이터셋/Spaces) | |
| `improve-codebase-architecture` | 도메인 언어 기반 리팩터링 기회 발굴 | DEEPENING.md, HTML-REPORT.md 등 포함 |
| `mcp-code-search` | MCP grep 서버로 GitHub 코드 검색 | |
| `teach` | 사용자에게 새 개념/스킬 가르치기 | |
| `write-a-skill` | 새 스킬 생성 가이드 | |

## 출처

- abhinand5/pi-setup, amosblomqvist/pi-config, mattpocock/skills 커뮤니티 리소스 기반
- 필요한 경우 각 extension/skill 상단에 출처 표기
