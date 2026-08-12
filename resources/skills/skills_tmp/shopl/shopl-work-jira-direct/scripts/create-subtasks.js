#!/usr/bin/env node

/**
 * create-subtasks.js — Jira 하위작업 일괄 등록 + 담당자 지정 + 상태 변경
 *
 * 사용법:
 *   1) 인라인 제목 목록
 *      node create-subtasks.js <PARENT_KEY> \
 *        --assignee <ACCOUNT_ID|EMAIL|DISPLAY_NAME> \
 *        --status "진행 중" \
 *        --titles "첫 번째 작업" "두 번째 작업" ...
 *
 *   2) 파일에서 제목 읽기 (한 줄 또는 마크다운 목록)
 *      node create-subtasks.js <PARENT_KEY> \
 *        --assignee jimmy \
 *        --status "진행 중" \
 *        --from-file tasks.md
 *
 *   3) stdin 파이프
 *      cat tasks.txt | node create-subtasks.js <PARENT_KEY> \
 *        --assignee jimmy \
 *        --status "진행 중"
 *
 * 옵션:
 *   --assignee    담당자 지정 (accountId / email / displayName)
 *                 생략하면 미지정으로 생성
 *   --status      생성 후 전환할 상태명 (예: "진행 중", "Hold", "Close")
 *                 생략하면 "할 일(To Do)" 상태로 유지
 *   --titles      인라인 제목 목록 (공백 포함 시 따옴표)
 *   --from-file   제목이 적힌 파일 경로 (텍스트 한 줄당 1개, 또는 마크다운 목록)
 *   --section     문서 내 특정 섹션(헤딩) 이후의 목록만 추출 (예: "구현 하위작업 이름")
 *   --dry-run     실제 생성 없이 미리보기만 출력
 *   --prefix      제목 앞에 붙일 번호 prefix (예: "[01]")
 *                 "auto"를 주면 01, 02,... 자동 채번
 *   --batch       배치 크기 (기본 10, 0=전체 한 번에)
 */

const https = require("https");

// ─── 설정 ───────────────────────────────────────────────────────
const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
const SUBTASK_ISSUE_TYPE_ID = "10003"; // SH 프로젝트 Sub-task ID

// ─── CLI 파싱 ───────────────────────────────────────────────────
const args = process.argv.slice(2);

function parseArgs(args) {
  const result = { titles: [], assignee: null, status: null, fromFile: null, section: null, dryRun: false, prefix: null, batch: 10 };
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--assignee":
        result.assignee = args[++i];
        break;
      case "--status":
        result.status = args[++i];
        break;
      case "--from-file":
        result.fromFile = args[++i];
        break;
      case "--section":
        result.section = args[++i];
        break;
      case "--titles": {
        i++;
        const collected = [];
        while (i < args.length && !args[i].startsWith("--")) {
          collected.push(args[i]);
          i++;
        }
        result.titles = collected;
        continue;
      }
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--prefix":
        result.prefix = args[++i];
        break;
      case "--batch":
        result.batch = parseInt(args[++i], 10) || 10;
        break;
      default:
        if (!args[i].startsWith("--") && !result.parentKey) {
          result.parentKey = args[i];
        }
        break;
    }
    i++;
  }
  return result;
}

const opts = parseArgs(args);

// ─── 검증 ────────────────────────────────────────────────────────
const missing = [];
if (!JIRA_BASE_URL) missing.push("JIRA_BASE_URL");
if (!JIRA_EMAIL) missing.push("JIRA_EMAIL");
if (!JIRA_API_TOKEN) missing.push("JIRA_API_TOKEN");
if (missing.length) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
  process.exit(2);
}
if (!opts.parentKey) {
  console.error("❌ Usage: create-subtasks.js <PARENT_KEY> [options]");
  console.error("   예: node create-subtasks.js SH-18440 --assignee jimmy --status \"진행 중\" --from-file tasks.md");
  process.exit(1);
}

// ─── 유틸 ────────────────────────────────────────────────────────
const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

function jiraApi(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, JIRA_BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: { raw: data } });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function findUser(query) {
  // query가 accountId 형식인지, email인지, displayName인지 판별
  const isAccountId = /^[a-z0-9]+:[a-z0-9-]+$|^[a-f0-9]{24}$/.test(query);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);

  let accountId = null;

  if (isAccountId) {
    accountId = query;
  } else {
    // 사용자 검색
    const res = await jiraApi("GET", `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=5`);
    if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
      // email이 있으면 exact match 우선
      if (isEmail) {
        const exact = res.body.find((u) => u.emailAddress === query);
        if (exact) accountId = exact.accountId;
      } else {
        const exact = res.body.find((u) => u.displayName === query);
        if (exact) accountId = exact.accountId;
      }
      if (!accountId) accountId = res.body[0].accountId;
    }
  }
  return accountId;
}

async function findTransition(issueKey, targetStatusName) {
  const res = await jiraApi("GET", `/rest/api/3/issue/${issueKey}/transitions`);
  if (res.status !== 200) return null;
  const transition = (res.body.transitions || []).find(
    (t) => t.to.name === targetStatusName || t.to.id === targetStatusName
  );
  return transition ? transition.id : null;
}

async function createSubtask(parentKey, summary, assigneeId) {
  const fields = {
    project: { key: "SH" },
    summary,
    issuetype: { id: SUBTASK_ISSUE_TYPE_ID },
    parent: { key: parentKey },
  };
  if (assigneeId) {
    fields.assignee = { accountId: assigneeId };
  }
  return await jiraApi("POST", "/rest/api/3/issue", { fields });
}

async function transitionIssue(issueKey, transitionId) {
  return await jiraApi("POST", `/rest/api/3/issue/${issueKey}/transitions`, {
    transition: { id: transitionId },
  });
}

// ─── 제목 로딩 ──────────────────────────────────────────────────
/**
 * 마크다운/텍스트에서 목록 항목만 추출
 * - "1. 항목" → "항목"
 * - "- 항목" 또는 "* 항목" → "항목" (체크박스 "- [x] 항목" 포함)
 * - 일반 텍스트, 헤딩, 코드 블록, 표, 인용, 구분선은 무시
 * - section 옵션이 있으면 해당 헤딩 이후의 목록만 추출
 */
function extractListItems(content, sectionFilter) {
  const items = [];
  let inCodeBlock = false;
  let inTargetSection = !sectionFilter; // sectionFilter 없으면 전체 스캔
  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    // 섹션 필터: 헤딩 라인에서 섹션명 매칭
    if (sectionFilter && line.startsWith("#")) {
      const headingText = line.replace(/^#+\s*/, "").toLowerCase();
      if (headingText.includes(sectionFilter.toLowerCase())) {
        inTargetSection = true;
      }
      continue;
    }

    if (!inTargetSection) continue;
    if (!line || line.startsWith("---") || line.startsWith(">") || line.startsWith("|")) continue;

    // 숫자 목록: "1. xxx" / "1) xxx"
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    // 불릿 목록: "- xxx" / "* xxx" (체크박스 포함)
    const bulletMatch = line.match(/^\s*[-*]\s*(?:\[\S?\]\s*)?(.+)$/);
    let text = null;
    if (numberedMatch) {
      text = numberedMatch[1];
    } else if (bulletMatch) {
      text = bulletMatch[1];
    }
    if (text) {
      // 인라인 코드 백틱, 링크, 볼드/이탤릭 제거
      text = text.replace(/`([^`]+)`/g, "$1")
                 .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
                 .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
                 .trim();
      if (text) items.push(text);
    }
  }
  return items;
}

async function loadTitles() {
  let titles = [...opts.titles];

  if (opts.fromFile) {
    const fs = require("fs");
    if (!fs.existsSync(opts.fromFile)) {
      console.error(`❌ File not found: ${opts.fromFile}`);
      process.exit(1);
    }
    const content = fs.readFileSync(opts.fromFile, "utf8");
    titles = extractListItems(content, opts.section);
  }

  // stdin 파이프 처리 (titles가 없고 fromFile도 없을 때, TTY가 아닐 때)
  if (opts.titles.length === 0 && !opts.fromFile && !process.stdin.isTTY) {
    const fs = require("fs");
    const content = fs.readFileSync(0, "utf8");
    titles = extractListItems(content, opts.section);
  }

  return titles;
}

// ─── 메인 ────────────────────────────────────────────────────────
async function main() {
  const titles = await loadTitles();

  if (titles.length === 0) {
    console.error("❌ No subtask titles provided. Use --titles, --from-file, or pipe via stdin.");
    process.exit(1);
  }

  // 번호 prefix 처리
  if (opts.prefix === "auto") {
    const pad = String(titles.length).length;
    titles.forEach((t, i) => {
      titles[i] = `[${String(i + 1).padStart(pad, "0")}] ${t}`;
    });
  } else if (opts.prefix) {
    titles.forEach((t, i) => {
      titles[i] = `${opts.prefix} ${t}`;
    });
  }

  console.log(`\n📋 Parent: ${opts.parentKey}`);
  console.log(`📝 Subtasks to create: ${titles.length}`);
  if (opts.section) console.log(`📑 Section filter: "${opts.section}"`);
  if (opts.assignee) console.log(`👤 Assignee lookup: ${opts.assignee}`);
  if (opts.status) console.log(`🔄 Target status: ${opts.status}`);
  if (opts.dryRun) console.log(`👓 DRY RUN — no actual changes\n`);
  else console.log("");

  // 담당자 확인
  let assigneeId = null;
  if (opts.assignee) {
    assigneeId = await findUser(opts.assignee);
    if (!assigneeId) {
      console.error(`⚠️  Could not resolve assignee "${opts.assignee}". Creating without assignee.`);
    } else {
      console.log(`✅ Assignee resolved: ${opts.assignee} → ${assigneeId}`);
    }
  }

  // 상태 전환 ID 확인
  let transitionId = null;
  if (opts.status) {
    // 첫 번째 생성될 티켓으로 transition 조회 (더미 — 실제 생성 후 개별 전환)
    // 실제로는 생성 후 개별 전환
  }

  if (opts.dryRun) {
    titles.forEach((t, i) => console.log(`   ${t}`));
    console.log(`\n👓 Dry run complete. ${titles.length} subtasks would be created.`);
    return;
  }

  // 배치 생성
  const batchSize = opts.batch > 0 ? opts.batch : titles.length;
  const created = [];
  const failed = [];

  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    console.log(`\n--- Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(titles.length / batchSize)} ---`);

    const promises = batch.map(async (title) => {
      const res = await createSubtask(opts.parentKey, title, assigneeId);
      if (res.status === 201 && res.body.key) {
        created.push({ key: res.body.key, title, id: res.body.id });
        return { key: res.body.key, title, status: "created" };
      } else {
        failed.push({ title, error: res.body.errors || res.body });
        return { title, error: res.body.errors || res.body, status: "failed" };
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.status === "created") {
        process.stdout.write(`   ✅ ${r.key}  ${r.title}\n`);
      } else {
        process.stdout.write(`   ❌ ${r.title}: ${JSON.stringify(r.error)}\n`);
      }
    }

    // 배치 간격 (rate limit 배려)
    if (i + batchSize < titles.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ─── 상태 전환 ───────────────────────────────────────────────
  if (opts.status && created.length > 0) {
    const firstKey = created[0].key;
    const tid = await findTransition(firstKey, opts.status);
    if (!tid) {
      console.log(`\n⚠️  Could not find transition to "${opts.status}". Skipping status change.`);
    } else {
      console.log(`\n🔄 Transitioning ${created.length} subtasks to "${opts.status}" (transition ID: ${tid})...`);
      const transitionPromises = created.map(async (c) => {
        const res = await transitionIssue(c.key, tid);
        return { key: c.key, ok: res.status === 204 };
      });
      const transitionResults = await Promise.all(transitionPromises);
      const ok = transitionResults.filter((r) => r.ok).length;
      const fail = transitionResults.filter((r) => !r.ok).length;
      if (fail > 0) {
        console.log(`   ⚠️  ${ok} changed, ${fail} failed`);
        transitionResults.filter((r) => !r.ok).forEach((r) => console.log(`      ❌ ${r.key}`));
      } else {
        console.log(`   ✅ All ${ok} subtasks transitioned to "${opts.status}"`);
      }
    }
  }

  // ─── 요약 ─────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 Summary`);
  console.log(`   Parent:     ${opts.parentKey}`);
  console.log(`   Created:    ${created.length} / ${titles.length}`);
  if (failed.length > 0) console.log(`   Failed:     ${failed.length}`);
  if (assigneeId) console.log(`   Assignee:   ${opts.assignee} (${assigneeId})`);
  if (opts.status) console.log(`   Status:     ${opts.status}`);
  console.log(`   Keys:       ${created.map((c) => c.key).join(", ")}`);
  console.log(`${"=".repeat(50)}`);

  // 실패 상세
  if (failed.length > 0) {
    console.log(`\n❌ Failed details:`);
    failed.forEach((f) => console.log(`   ${f.title}: ${JSON.stringify(f.error)}`));
  }
}

main().catch((e) => {
  console.error("❌ Unhandled error:", e.message);
  process.exit(1);
});
