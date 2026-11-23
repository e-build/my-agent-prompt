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
│   ├── cliproxyapi-sync/      (cliproxy model 동기화 — 별도 설정 파일)
│   ├── comment-cleanup/       (새로 쓴 주석을 종료 직전에 한 번 정리)
│   ├── filechanges/           (/filechanges 변경사항 리뷰/되돌리기)
│   ├── prompt-snippets/       (/snippets, Ctrl+Alt+S — 다음 메시지에 규칙 한 번 적용)
│   └── study/                 (/study-init, /study-chapter, /study-review — 학습 채널로 진행하는 학습 흐름)
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

배치 진단 → 개념 → 실습 → 시험 → 복습을 학습 채널 하나(Pi 대화창 또는 Plannotator Inbox)로 진행하는 extension. 단계별 지침은 마크다운이고 `/study-prompts`로 덮어쓸 수 있다. 자세한 내용은 [study/README.md](./extensions/study/README.md).

## Extension 설명

| Extension | 명령어 | 설명 |
|-----------|--------|------|
| `custom-footer.ts` | (자동) | 하단에 토큰/비용/속도/생각수준/CWD/브랜치 실시간 표시 |
| `context-command.ts` | `/context` | 시작/대화 컨텍스트 사용량 분석 (Claude Code 스타일) |
| `local-models.ts` | `/local-models` | Ollama/LM Studio/RunPod 등 로컬 LLM 등록 |
| `safety-guard.ts` | `/safety` | force push, rm -rf 등 위험 명령 차단 |
| `flow-title.ts` | (자동) | 시작 시 헤더 (full/minimal 모드, `/welcome mode minimal` 전환) |
| `cliproxyapi-sync/` | (자동) | 로컬 CLIProxyAPI 모델을 `cp-*` provider로 자동 등록 ([README](./extensions/cliproxyapi-sync/README.md)) |
| `comment-cleanup/` | (자동) | 에이전트가 새로 쓴 주석을 종료 직전에 규칙에 맞게 한 번 정리 ([README](./extensions/comment-cleanup/README.md)) |
| `filechanges/` | `/filechanges`<br>`/filechanges-accept`<br>`/filechanges-decline` | Pi edit/write 내역 리뷰 (select list), diff 확인, 일괄 승인/되돌리기 |
| `prompt-snippets/` | `/snippets` · `Ctrl+Alt+S` | 다음 메시지 앞·뒤에 규칙 한 번 적용. 사용자 지정 `Explain clearly` 스니펫 포함 ([README](./extensions/prompt-snippets/README.md)) |
| `study/` | `/study-init`<br>`/study-chapter`<br>`/study-review`<br>`/study-prompts` | 학습 프로젝트와 채널 기반 학습 흐름 (위 study extension 섹션 참조) |
