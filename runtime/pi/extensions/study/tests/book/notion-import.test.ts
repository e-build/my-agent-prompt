import { test } from "node:test";
import assert from "node:assert/strict";
import { planNotionImport, type NotionPage } from "../../src/book/notion-import.ts";

const id = (n: number) => String(n).padStart(32, "0");
const url = (n: number) => `https://app.notion.com/p/${id(n)}`;

function pages(): NotionPage[] {
  return [
    {
      id: id(1),
      title: "📕 교과서",
      lastEdited: "2025-07-25T00:00:00Z",
      content: `# 1. 자바\n\n---\n\n### <b>1.2 스레드</b>\n\n<page url="${url(2)}">\n스레드 개념\n</page>\n\n<page url="${url(3)}">\n정리\n</page>\n\n# 4. 데이터 베이스\n\n<page url="${url(4)}">\n정리\n</page>\n\n# \\$ 서적\n\n<database url="https://app.notion.com/p/d1" data-source-url="collection://c1" inline="true">서적</database>`,
    },
    { id: id(2), title: "스레드 개념", lastEdited: "2023-05-31T00:00:00Z", content: `본문 <mention url="${url(3)}" /> 참조\n\n<image source="notion-file-block://b/f?space_id=s&amp;name=x.png" />\n\n<page url="${url(5)}">\n하위 글\n</page>` },
    { id: id(3), title: "정리", lastEdited: "2024-01-01T00:00:00Z", content: "" },
    { id: id(4), title: "정리", lastEdited: "2024-01-02T00:00:00Z", content: "DB 정리" },
    { id: id(5), title: "하위 글", lastEdited: "2024-01-03T00:00:00Z", content: "깊은 내용" },
  ];
}

test("files follow the Notion sections, sub pages nest under their parent, duplicate titles get an id suffix", () => {
  const plan = planNotionImport(pages(), { rootId: id(1) });
  assert.deepEqual(plan.files.map((f) => f.path), [
    "sources/notion/1. 자바/1.2 스레드/스레드 개념.md",
    "sources/notion/1. 자바/1.2 스레드/정리-00000003.md",
    "sources/notion/4. 데이터 베이스/정리-00000004.md",
    "sources/notion/1. 자바/1.2 스레드/스레드 개념/하위 글.md",
    "sources/notion/README.md",
  ]);
});

test("each file keeps provenance in front matter, links between converted pages are relative, images get local paths", () => {
  const plan = planNotionImport(pages(), { rootId: id(1) });
  const file = plan.files.find((f) => f.path.endsWith("스레드 개념.md"))!;
  assert.match(file.content, /^---\nnotion: 00000000000000000000000000000002\nsource: https:\/\/app\.notion\.com\/p\/00000000000000000000000000000002\nedited: 2023-05-31\n---\n# 스레드 개념\n\n/);
  assert.match(file.content, /본문 \[정리\]\(%EC%A0%95%EB%A6%AC-00000003\.md\) 참조/);
  assert.match(file.content, /!\[\]\(media\/00000000000000000000000000000002-0\.png\)/);
  assert.match(file.content, /- \[하위 글\]\(%EC%8A%A4%EB%A0%88%EB%93%9C%20%EA%B0%9C%EB%85%90\/%ED%95%98%EC%9C%84%20%EA%B8%80\.md\)/);
  assert.deepEqual(plan.images, [{ ref: "notion-file-block://b/f?space_id=s&name=x.png", path: "sources/notion/1. 자바/1.2 스레드/media/00000000000000000000000000000002-0.png", page: id(2) }]);
});

test("empty pages are kept as titled notes and listed; the index links every section and database", () => {
  const plan = planNotionImport(pages(), { rootId: id(1) });
  const empty = plan.files.find((f) => f.path.endsWith("정리-00000003.md"))!;
  assert.match(empty.content, /# 정리\n\n> 노션 원문이 비어 있습니다\./);
  assert.deepEqual(plan.empty, [id(3)]);
  const index = plan.files.find((f) => f.path === "sources/notion/README.md")!.content;
  assert.match(index, /## 1\. 자바\n\n### 1\.2 스레드\n\n- \[스레드 개념\]\(1\.%20%EC%9E%90%EB%B0%94\/1\.2%20%EC%8A%A4%EB%A0%88%EB%93%9C\/%EC%8A%A4%EB%A0%88%EB%93%9C%20%EA%B0%9C%EB%85%90\.md\)/);
  assert.match(index, /노션 데이터베이스: 서적 \(collection:\/\/c1\)/);
});

test("pages reachable from nowhere are reported, not dropped silently", () => {
  const plan = planNotionImport([...pages(), { id: id(9), title: "고아", lastEdited: "2024-01-01T00:00:00Z", content: "x" }], { rootId: id(1) });
  assert.deepEqual(plan.orphans, [id(9)]);
  assert.ok(plan.files.some((f) => f.path === "sources/notion/_기타/고아.md"));
});

test("writeImport writes sources once, copies media with sniffed extensions, and never overwrites existing files", async (t) => {
  const { writeImport } = await import("../../src/book/notion-import.ts");
  const { workspaceFixture } = await import("../support/workspace-fixture.ts");
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = await workspaceFixture(t);
  const plan = planNotionImport(pages(), { rootId: id(1) });
  const media = join(root, ".study", "local", "import", "notion", "media");
  await mkdir(media, { recursive: true });
  await writeFile(join(media, `${id(2)}-0.png`), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
  const result = await writeImport(root, plan, media);
  assert.equal(result.written, plan.files.length);
  assert.deepEqual(result.renamed, [`${id(2)}-0.png → ${id(2)}-0.jpg`]);
  const page = await readFile(join(root, "sources", "notion", "1. 자바", "1.2 스레드", "스레드 개념.md"), "utf8");
  assert.match(page, /!\[\]\(media\/00000000000000000000000000000002-0\.jpg\)/);
  assert.ok(existsSync(join(root, "sources", "notion", "1. 자바", "1.2 스레드", "media", `${id(2)}-0.jpg`)));
  await assert.rejects(writeImport(root, plan, media), /이미 있습니다/);
});
