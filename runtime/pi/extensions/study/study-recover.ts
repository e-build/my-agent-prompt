// 학습 근거 검증 + 통과·확인된 시험 기록으로 test 복구. 안내 페이지 실패는 복구를 무효화하지 않음.
// 사용: node --experimental-strip-types study-recover.ts <projectRoot> <chapterSlug>
import { validateChapterEvidence } from "./chapter-evidence.ts";
import { buildReviewStartPage } from "./review-page.ts";
import { findRecoverablePassedTest } from "./assessment-grade.ts";
import { applyTestRecovery } from "./study-state.ts";

async function main(): Promise<void> {
  const [projectRoot, chapterSlug] = process.argv.slice(2);
  if (!projectRoot || !chapterSlug) {
    console.error("usage: node --experimental-strip-types study-recover.ts <projectRoot> <chapterSlug>");
    process.exit(2);
  }
  await validateChapterEvidence(projectRoot, chapterSlug);
  const record = await findRecoverablePassedTest(projectRoot, chapterSlug);
  if (!record) {
    console.error("복구 대상 없음: 통과+확인(acknowledged)된 시험 기록이 없습니다.");
    process.exit(1);
  }
  const recovered = await applyTestRecovery(projectRoot, chapterSlug, record);
  console.log(recovered
    ? `복구 완료: test → completed (시험 ${record.id}, ${record.score}/${record.maxScore}, attempt ${record.attempt})`
    : "대상 챕터 상태를 찾지 못했습니다.");
  if (recovered) {
    try { console.log(`review: ${await buildReviewStartPage(projectRoot, chapterSlug)}`); }
    catch (error) { console.warn(`안내 페이지만 갱신 실패: ${error instanceof Error ? error.message : error}`); }
  }
  process.exit(recovered ? 0 : 1);
}

await main();
