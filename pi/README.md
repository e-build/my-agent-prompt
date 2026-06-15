# pi/ — Pi 코딩 에이전트 리소스

이 디렉토리는 [Pi coding agent](https://pi.dev) 전용 리소스를 관리합니다.
skills/ 디렉토리의 스킬은 모든 에이전트 공용이며, 여기에는 Pi 전용 설치/테마/extension/config 만 포함됩니다.

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
│   └── filechanges/           (/filechanges 변경사항 리뷰/되돌리기)
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

## Extension 설명

| Extension | 명령어 | 설명 |
|-----------|--------|------|
| `custom-footer.ts` | (자동) | 하단에 토큰/비용/속도/생각수준 실시간 표시 |
| `context-command.ts` | `/context` | 시작/대화 컨텍스트 사용량 분석 (Claude Code 스타일) |
| `local-models.ts` | `/local-models` | Ollama/LM Studio/RunPod 등 로컬 LLM 등록 |
| `safety-guard.ts` | `/safety` | force push, rm -rf 등 위험 명령 차단 |
| `flow-title.ts` | (자동) | 시작 시 Pi 로고+버전+모델명 표시 |
| `filechanges/` | `/filechanges` | Pi edit/write 내역 리뷰, 승인, 되돌리기 |

## 출처

- abhinand5/pi-setup, amosblomqvist/pi-config, mattpocock/skills 커뮤니티 리소스 기반
- 필요한 경우 각 extension 상단에 출처 표기
