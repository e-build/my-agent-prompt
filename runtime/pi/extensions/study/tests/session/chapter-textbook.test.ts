import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkedTextbookPages, textbookWarnings } from "../../src/session/chapter-textbook.ts";

export const bookPage = (body: string) =>
  `---\nconcept: cn-aaaa1111\n---\n<!-- study:book region=head hash=000000000000 -->\nh\n<!-- /study:book -->\n\n<!-- study:book region=main hash=000000000000 -->\n${body}\n<!-- /study:book -->\n\n<!-- study:book region=foot hash=000000000000 -->\nf\n<!-- /study:book -->\n\n## 메모\n`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "chapter-textbook-"));
  await mkdir(join(root, "book", "자바", "스레드"), { recursive: true });
  await mkdir(join(root, "study-a", "ch-01-x"), { recursive: true });
  await writeFile(join(root, "book", "자바", "스레드", "README.md"), bookPage("본문"));
  return { root, readme: join(root, "study-a", "ch-01-x", "README.md") };
}

test("reads book pages linked under '## 교과서 페이지' with their body state", async () => {
  const { root, readme } = await fixture();
  const content =
    "# ch\n\n## 교과서 페이지\n\n- [스레드](../../book/%EC%9E%90%EB%B0%94/%EC%8A%A4%EB%A0%88%EB%93%9C/README.md)\n- [없음](../../book/없음/README.md)\n- [웹](https://ex.com)\n- [스레드 다시](../../book/자바/스레드/README.md)\n\n## 다음\n- [밖](../../book/자바/README.md)\n";
  const pages = await linkedTextbookPages(readme, content);
  assert.deepEqual(
    pages.map((p) => [p.path, p.exists, p.hasBody]),
    [
      [join(root, "book", "자바", "스레드", "README.md"), true, true],
      [join(root, "book", "없음", "README.md"), false, false],
    ],
  );
  assert.equal(pages[0].body, "본문");
});

test("an empty main region is not a body; no section means no pages", async () => {
  const { root, readme } = await fixture();
  await writeFile(join(root, "book", "자바", "스레드", "README.md"), bookPage("(아직 본문이 없습니다)"));
  const [only] = await linkedTextbookPages(readme, "## 교과서 페이지\n\n- [스레드](../../book/자바/스레드/README.md)\n");
  assert.equal(only.hasBody, false);
  assert.deepEqual(await linkedTextbookPages(readme, "# ch\n\n## 학습 목표\n"), []);
});

test("structure warnings name what a concept page is missing, never block", () => {
  assert.deepEqual(textbookWarnings("## 왜 필요한가\n\n글"), [
    "내부 동작 섹션이 없습니다",
    "SVG 그림이 없습니다",
    "출처(웹 링크)가 없습니다",
  ]);
  assert.deepEqual(
    textbookWarnings("## 내부 동작\n\n![상태](../_media/cn-a/s.svg)\n\n## 출처\n\n- [JLS](https://docs.oracle.com/)"),
    [],
  );
});
