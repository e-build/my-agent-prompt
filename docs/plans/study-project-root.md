# Study 프로젝트 루트 수정 계획

> **Implement task-by-task with the test-driven-development skill.**

## 목차

- [목표와 구조](#목표와-구조)
- [작업 1 — 경로 회귀 테스트](#작업-1--경로-회귀-테스트)
- [작업 2 — 공통 루트 결정과 커리큘럼 저장](#작업-2--공통-루트-결정과-커리큘럼-저장)
- [작업 3 — 지침과 문서](#작업-3--지침과-문서)
- [작업 4 — 기존 프로젝트 정리와 검증](#작업-4--기존-프로젝트-정리와-검증)
- [실행 결과](#실행-결과)

## 목표와 구조

**Goal:** 프로젝트 내부에서 커리큘럼을 열어도 중첩 프로젝트 생성 없이 HTML과 manifest를 동일한 루트에 저장.

**Architecture:** 기존 `findStudyProjectRoot` 호출 계약 유지. 공통 루트 결정 모듈로 구현 이동 후 `projectSlug`, 명시적 `projectRoot`, 신규 생성 허용 옵션 추가. 커리큘럼 도구는 같은 함수의 slug 지정 모드를 사용하며, 실제 산출물 저장 로직을 브라우저 실행과 분리해 회귀 검증.

**Tech Stack:** TypeScript, Node.js 22, node:test, Pi Extension API.

- 원본 저장소: `/Users/jimmylee/IdeaProjects/e-build/my-agent-prompt`
- 작업 브랜치: `fix/study-project-root`
- 기존 사용자 변경과 학습 코드는 보존. 자동 커밋·푸시 없음.
- 기준 테스트: study 전체 85개 통과.

## 작업 1 — 경로 회귀 테스트

**TDD scenario:** 기존 함수의 미검증 경로 동작 — 실패 테스트 우선.

**Files:**
- Create: `runtime/pi/extensions/study/project-root.test.ts`
- Modify: `runtime/pi/extensions/study/study-command.test.ts` (필요 시)

1. 기존 `findStudyProjectRoot`에 옵션을 전달하는 테스트 작성.
2. 루트·chapter·app 내부 실행, 상위 폴더의 정확한 slug, 초기화 전 빈 대상 폴더, 명시적 root, 잘못된 slug, root 불일치, 다른 프로젝트 안의 중첩 생성, 다중 후보 오류 검증.
3. `node --test runtime/pi/extensions/study/project-root.test.ts` 실행. 기존 구현이 옵션을 무시하거나 임의 후보를 선택해 실패하는지 확인.

## 작업 2 — 공통 루트 결정과 커리큘럼 저장

**Files:**
- Create: `runtime/pi/extensions/study/project-root.ts`
- Create: `runtime/pi/extensions/study/curriculum-core.ts`
- Create: `runtime/pi/extensions/study/curriculum-core.test.ts`
- Modify: `runtime/pi/extensions/study/study-command.ts`
- Modify: `runtime/pi/extensions/study/index.ts`

1. `findStudyProjectRoot` 구현을 공통 모듈로 이동하고 기존 import 경로에서는 재수출.
2. slug는 식별자만 허용. manifest slug와 실제 루트 이름 검증. 모호한 후보는 오류.
3. 기존 프로젝트 내부는 같은 루트 사용. 다른 프로젝트 내부의 신규 중첩 생성 금지. 신규 루트는 생성 허용 옵션이 있을 때만 선택.
4. HTML과 `.study/project.json`을 실제 생성하는 테스트 작성 후 RED 확인.
5. 브라우저와 독립적인 `writeCurriculumArtifacts` 구현. payload의 slug 불일치는 쓰기 전에 차단.
6. `study_curriculum_open`에 선택적 `projectRoot` 추가. 산출물 저장 함수와 파일 변경 큐 사용. 세션·도구 결과·승인/수정 메시지에 확정 root 포함.
7. 관련 테스트 GREEN 확인.

## 작업 3 — 지침과 문서

**Files:**
- Modify: `runtime/pi/extensions/study/prompts/study-init.md`
- Modify: `runtime/pi/extensions/study/README.md`

- init의 무조건 `cwd/study-{slug}` 생성 지침 제거.
- 문서 생성 전에 root 확정. 기존 프로젝트 수정과 신규 생성 구분. 동일 root를 도구에 전달.
- root·slug 역할과 모호성 오류 정책 문서화.
- `/reload` 적용 방법 안내.

## 작업 4 — 기존 프로젝트 정리와 검증

**Target:** `/Users/jimmylee/IdeaProjects/study/study-thread-pool-from-scratch`

1. 안쪽 디렉토리의 파일 목록과 manifest 동일성을 재확인.
2. `curriculum.html`을 상위로 이동. 동일한 안쪽 manifest만 제거하고 빈 디렉토리를 `rmdir`로 제거. 재귀 삭제 없음.
3. 이동 전후 HTML 해시, 상위 manifest·state·학습 파일 해시 보존 확인.
4. `node --test runtime/pi/extensions/study/*.test.ts` 전체 통과 확인.
5. `bash scripts/check-resources` 및 `git diff --check` 실행.
6. 실제 프로젝트 루트·chapter·app·상위 폴더에서 경로 결정 결과 확인.
7. 최종 변경 파일·테스트 수·남은 브라우저 검증 구분 보고.

## 실행 결과

- 완료: 공통 루트 결정, curriculum 저장 함수, 도구의 선택적 `projectRoot`, 승인/수정 bridge 메시지의 root 전달, init 지침과 README 정책.
- RED: 경로 테스트 13개 중 11개 실패, 산출물 writer 테스트 6개 실패 확인 후 구현. 추가 legacy metadata 모호성 회귀 1개 실패 확인 후 후보 탐색·선택 대상 검증 분리.
- GREEN: 최종 study 전체 **108개 통과 / 실패 0**. 기존 기준 85개에서 23개 추가.
- Pi 실제 loader로 설치 symlink의 extension 로딩·도구 등록 성공.
- 임시 샌드박스에서 실제 `study_curriculum_open.execute`·HTTP HTML 응답·승인/수정 POST·root 메시지 전달 통과. 브라우저 실행만 stub 처리, 실제 화면 렌더링·클릭은 미검증.
- 현재 프로젝트의 root/chapter/app/상위 폴더에서 요청한 slug가 동일 root로 해석됨. 다중 프로젝트 일반 탐색은 명확한 모호성 오류 확인.
- `git diff --check`, `bash scripts/check-resources` 통과.
- 기존 프로젝트: `curriculum.html`을 루트로 이동하고 동일한 안쪽 manifest와 빈 폴더만 제거. 재귀 삭제 없음. 기존 파일 **188개 해시 보존**, HTML SHA256 `4facc81d7a896525df4b32a00e301d67fd780ee5b37dc00b00c750afabf103dc` 동일.
- 기존 다른 프로젝트의 `projectSlug: "."` metadata 발견. 해당 파일 미수정. 후보 탐색 단계에서는 metadata를 해석하지 않고, 선택한 대상만 검증.
- 기존 사용자 변경 유지. 자동 커밋·푸시 없음. 현재 세션에서 적용은 `/reload` 필요.
