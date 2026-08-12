# runtime/pi/ — Pi 코딩 에이전트 런타임 리소스

이 디렉토리는 [Pi coding agent](https://pi.dev) 전용 실행 리소스를 관리합니다.
공유 명령어 본문은 `resources/commands/`, Agent Skills는 `resources/skills/`에 있으며
이 디렉토리에는 Pi 전용 extension/theme/config만 포함됩니다.

## 구조

```
runtime/pi/
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
└── bin/pi                 ← 컴팩트 Pi 런처
```

## 설치

```bash
# 전체 설치 (commands + skills + extensions + themes + config + launcher)
bash scripts/install-pi --restore --copy-config

# 마지막으로 settings.json에서 모델/프로바이더 설정
code ~/.pi/agent/settings.json
```

## study extension

학습 커리큘럼(`study-{slug}` 프로젝트)과 인터랙티브 사전진단/학습 완료 테스트를 담당하는 self-contained extension.

| 구성 | 설명 |
|------|------|
| `prompts/study-init.md` | `/study-init <주제>` — 학습 프로젝트 생성 |
| `prompts/study-chapter.md` | `/study-chapter [챕터] [단계]` — 챕터 학습 (diagnosis/lab/test/review) |
| `prompts/study-review.md` | `/study-review [챕터] [단계]` — 5단계 복습 |
| `study_diagnosis_open` tool | diagnosis HTML 생성 + 브라우저 자동 open + 제출/채점 bridge |
| `study_test_open` tool | test HTML 생성 + 브라우저 자동 open + 제출/채점/점수별 handoff bridge |
| `assets/assessment-template.html` | 사전진단/테스트 공통 UI 템플릿 (self-contained) |

`/study-chapter {챕터} diagnosis`와 `/study-chapter {챕터} test`는 각 tool로 브라우저를 자동으로 연다. 제출 답안은 현재 Pi 세션에서 채점되고 정답/해설이 같은 브라우저에 표시된다. test는 통과 시 복습, 미달 시 취약 개념 재학습으로 분기하며 `test.md`에 attempt별 문제·답안·채점을 누적한다. 자세한 흐름은 `runtime/pi/extensions/study/README.md` 참조.

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
