#!/usr/bin/env node

const issueKey = process.argv[2];

if (!issueKey) {
  console.error("Usage: get-children.js <ISSUE_KEY>");
  process.exit(1);
}

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
const missing = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
const url = new URL("/rest/api/3/search/jql", JIRA_BASE_URL);
url.searchParams.set("jql", `parent = ${issueKey} OR \"Epic Link\" = ${issueKey} ORDER BY key`);
url.searchParams.set("fields", "summary,issuetype,parent,status,assignee");
url.searchParams.set("maxResults", "100");

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

    const issues = (data.issues || []).map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary,
      issuetype: issue.fields?.issuetype?.name,
      status: issue.fields?.status?.name,
      assignee: issue.fields?.assignee?.displayName || null,
      parent: issue.fields?.parent?.key || null,
    }));

    console.log(JSON.stringify({ parent: issueKey, count: issues.length, issues }, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ error: error.message }, null, 2));
    process.exit(4);
  });
