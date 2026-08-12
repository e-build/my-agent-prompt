#!/usr/bin/env node

const issueKey = process.argv[2];
const fieldsArg = process.argv[3] || "summary,issuetype,status,assignee,parent,subtasks";

if (!issueKey) {
  console.error("Usage: get-issue.js <ISSUE_KEY> [comma,separated,fields]");
  process.exit(1);
}

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
const missing = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
const fields = fieldsArg.split(",").map((s) => s.trim()).filter(Boolean);
const url = new URL(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, JIRA_BASE_URL);
url.searchParams.set("fields", fields.join(","));

fetch(url, {
  headers: {
    "Authorization": `Basic ${auth}`,
    "Accept": "application/json",
  },
})
  .then(async (res) => {
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      console.error(JSON.stringify({ status: res.status, error: data }, null, 2));
      process.exit(3);
    }

    const output = {
      key: data.key,
      id: data.id,
      self: data.self,
      fields: data.fields,
    };
    console.log(JSON.stringify(output, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ error: error.message }, null, 2));
    process.exit(4);
  });
