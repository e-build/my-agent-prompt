# Pi Extensions

이 디렉토리는 이 저장소에서 관리하는 `pi` 전용 extension 소스 모음이다.
개발 중에는 파일을 `~/.pi/agent/extensions/`로 복사하지 말고 **심볼릭 링크**로 연결한다.

## 설치

```bash
bash pi-extensions/install-local.sh
```

기본 대상 경로:

- `~/.pi/agent/extensions/*.ts`

`PI_CODING_AGENT_DIR`를 쓰는 환경이면 그 값을 우선 사용한다.

기존 일반 파일이 이미 있으면 덮어쓰지 않는다. 백업 후 심링크로 바꾸려면:

```bash
bash pi-extensions/install-local.sh --force
```

## 제거

```bash
bash pi-extensions/install-local.sh --uninstall
```

## 현재 extension

| Source | Linked path |
|--------|-------------|
| `cliproxyapi-sync.ts` | `~/.pi/agent/extensions/cliproxyapi-sync.ts` |

## 사용 팁

- 링크 후 `pi`를 다시 시작하거나 `/reload`를 실행하면 반영된다.
- `pi`는 `~/.pi/agent/extensions/*.ts`를 자동 탐색한다.
- 같은 이름의 일반 파일이 이미 있으면 기본적으로 건너뛴다.
- 기존 파일을 백업하고 심링크로 교체하려면 `--force`를 사용한다.
