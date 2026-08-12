# Claude Code 연동

`~/.claude/settings.json` 의 `env` 블록만 교체. 별도 provider 스키마 없이 base URL + 모델명만 바꾸면 끝. **Anthropic Messages API(`/v1/messages`) 사용.** Codex 보다 단순함.

## 목차

- [백업](#백업)
- [설정 변경](#설정-변경)
- [모델 슬롯 기준](#모델-슬롯-기준)
- [검증](#검증)
- [운영 팁](#운영-팁)

## 백업

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak.$(date +%Y%m%d_%H%M%S)
```

## 설정 변경

변경 대상 env 키:

| 키 | 의미 | 예시 값 |
|----|------|---------|
| `ANTHROPIC_BASE_URL` | 엔드포인트 | `http://localhost:8317` |
| `ANTHROPIC_MODEL` | 기본/fallback 커스텀 모델 | `deepseek-v4-pro` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku 슬롯 | `deepseek-v4-flash` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet 슬롯 | `gpt-5.4` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | opus 슬롯 | `glm-5.2` |
| `ANTHROPIC_SMALL_FAST_MODEL` | 경량 호출 (제목/요약) | `deepseek-v4-flash` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 서브에이전트 (Task) | `glm-5.2` |

`ANTHROPIC_AUTH_TOKEN` 은 프록시가 무시하므로 기존 값 그대로 유지.

`env` 블록 적용 예:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<기존 값 유지>",
    "ANTHROPIC_BASE_URL": "http://localhost:8317",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.4",
    "ANTHROPIC_MODEL": "deepseek-v4-pro",
    "ANTHROPIC_SMALL_FAST_MODEL": "deepseek-v4-flash",
    "CLAUDE_CODE_SUBAGENT_MODEL": "glm-5.2"
  }
}
```

## 모델 슬롯 기준

Claude Code 내부 슬롯과 프록시 모델 대응:

| 선택/슬롯 | 참조 env 키 |
|-----------|------------|
| 기본/fallback | `ANTHROPIC_MODEL` |
| `/model sonnet` | `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| `/model opus` | `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| `/model haiku` | `ANTHROPIC_DEFAULT_HAIKU_MODEL` |

`settings.json` 최상단의 `"model"` 필드(`"sonnet"` / `"haiku"` / `"opus"`)는 **시작 시 활성 슬롯** 을 결정. 기본 시작 슬롯을 바꾸려면 이 값도 함께 설정.

## 검증

설정 저장 후 Claude Code 세션을 새로 열어 호출 한 건:

```
/model sonnet
(프롬프트 입력 → 정상 응답 확인)
```

프록시 로그로 실제 라우팅 확인:

```bash
docker logs cli-proxy-api --tail 20
```

## 운영 팁

- 변경 전 반드시 백업.
- 모델명은 프록시 `/v1/models` 에 노출된 정확한 ID 사용 (예: `glm-5.2`, not `GLM-5.2`).
- `AUTH_TOKEN` 교체 불필요. 프록시가 키를 무시함.
- 한 슬롯만 바꾸고 싶으면 해당 env 키만 수정. 전체 교체가 아니어도 됨.
