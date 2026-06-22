---
name: shopl-dev-auth-token
description: "Shopl 인증서버(dev-auth.shopl.work)에서 API 호출용 인증 토큰을 발급받는 절차를 정의한다. OAuth2 Authorization Code + PKCE 기반 인증 흐름을 설명하며, 웹/모바일 두 방식의 토큰 발급 과정과 실제 검증 시 DevTools에서 세션을 추출하는 실무 절차를 안내한다. Use when: Shopl API 호출 시 인증 토큰 필요, curl 검증 시 SESSION 쿠키 발급, shopl-authorization-server docs 참조."
---

# Shopl 인증 토큰 발급

## Overview

Shopl은 인증서버가 **별도 서비스**로 분리되어 있다. OAuth2 Authorization Code + PKCE 기반 인증을 사용하며, 웹과 모바일 각각 다른 인증 흐름을 가진다.

실제 API 호출(curl 등)로 검증이 필요할 때 이 스킬이 정의하는 절차를 따라 인증 토큰을 발급받는다.

## 인증서버 정보

| 항목 | 값 |
|------|------|
| Dev 인증서버 URL | `https://dev-auth.shopl.work/` |
| 인증 방식 | OAuth2 Authorization Code + PKCE (S256) |
| 요청 암호화 | AES-256 (loginId, password 등) |
| 관련 문서 | `shopl-authorization-server/docs/flows/` |

## 인증 흐름 문서

| 구분 | 파일 | 설명 |
|------|------|------|
| 웹 | `web-login-flow.md` | reCAPTCHA + AES-256 암호화 요청 + PKCE. 2단계 (로그인 → 토큰 교환) |
| 모바일 | `mobile-login-flow.md` | 3단계 인증 (로그인 → 디바이스 검증 → 디바이스 변경[조건부] → 토큰 교환) |
| 토큰 교환 | `/oauth2/token` | Authorization Code → Access Token / Refresh Token / ID Token |

## 실무 토큰 발급 절차 (테스트/검증용)

자동화된 토큰 발급(AES-256 암호화, PKCE, reCAPTCHA 등)은 복잡하므로,
브라우저 로그인 후 DevTools에서 세션 값을 추출하는 방식을 권장한다.

### 웹 (Cookie: SESSION)

1. 브라우저에서 Shopl 웹 대시보드 로그인 (`https://dev-dashboard.shopl.work`)
2. DevTools 열기 (F12)
3. **Application** 탭 → **Cookies** → `dev-dashboard.shopl.work` 도메인 선택
4. `SESSION` 쿠키 값 복사
5. API 호출 시 HTTP Header에 추가
   ```
   Cookie: SESSION={SESSION_VALUE}
   ```

### 모바일 (Authorization: Bearer)

1. 모바일 앱에서 로그인
2. 네트워크 요청 캡처 (Charles Proxy / Proxyman 등)
3. `/oauth2/token` 응답에서 `access_token` 값 복사
4. API 호출 시 HTTP Header에 추가
   ```
   Authorization: Bearer {ACCESS_TOKEN}
   ```
