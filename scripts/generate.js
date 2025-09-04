#!/usr/bin/env node

import fs from "node:fs";
import fetch from "node-fetch";

const ORG = "your-org-name"; // TODO: replace with your GitHub org
const TOKEN = process.env.GITHUB_TOKEN;

// -----------------------------
// Helper functions
// -----------------------------

async function fetchAllRepos(headers) {
  let repos = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`,
      { headers }
    );
    const data = await res.json();
    if (data.length === 0) break;
    repos = repos.concat(data);
    page++;
  }
  return repos;
}

async function fetchRepoTopics(repo, headers) {
  const res = await fetch(
    `https://api.github.com/repos/${ORG}/${repo}/topics`,
    {
      headers: {
        ...headers,
        Accept: "application/vnd.github.mercy-preview+json",
      },
    }
  );
  if (!res.ok) return { names: [] };
  return res.json();
}

async function fetchRepoReadme(repo, headers) {
  const res = await fetch(
    `https://api.github.com/repos/${ORG}/${repo}/readme`,
    { headers }
  );
  if (!res.ok) return "";
  const data = await res.json();
  if (!data.content) return "";
  return Buffer.from(data.content, "base64").toString("utf-8");
}

function extractTitleAndBlurb(readme) {
  let title = null;
  let blurb = null;
  if (!readme) return { title, blurb };

  const lines = readme.split(/\r?\n/);

  for (const line of lines) {
    if (!title && line.startsWith("#")) {
      title = line.replace(/^#+\s*/, "").trim();
    }
    if (!blurb && line.startsWith("Description:")) {
      blurb = line.replace("Description:", "").trim();
    }
    if (title && blurb) break;
  }
  return { title, blurb };
}

// -----------------------------
// Main
// -----------------------------

async function main() {
  const headers = TOKEN ? { Authorization: `token ${TOKEN}` } : {};

  const repos = await fetchAllRepos(headers);

  const enriched = [];
  const featured = [];

  for (const repo of repos) {
    const topics = await fetchRepoTopics(repo.name, headers);
    const readme = await fetchRepoReadme(repo.name, headers);
    const { title, blurb } = extractTitleAndBlurb(readme);

    const enrichedRepo = {
      name: repo.name,
      title: title || repo.description || repo.name,
      blurb,
      url: `https://${ORG}.github.io/${repo.name}/`,
      archived: repo.archived,
      topics: topics.names || [],
    };

    enriched.push(enrichedRepo);

    if (enrichedRepo.topics.includes("featured")) {
      featured.push(enrichedRepo);
    }
  }

  enriched.sort((a, b) => a.title.localeCompare(b.title));
  featured.sort((a, b) => a.title.localeCompare(b.title));

  function groupByTopic(repos) {
    const groups = {};
    for (const repo of repos) {
      const groupNames = repo.topics.length > 0 ? repo.topics : ["Other"];
      for (const t of groupNames) {
        if (!groups[t]) groups[t] = [];
        groups[t].push(repo);
      }
    }
    return groups;
  }

  const groupsAll = groupByTopic(enriched);
  const groupsFeatured = groupByTopic(featured);

  // -----------------------------
  // Generate all_test.html
  // -----------------------------
  const sectionsAll = Object.keys(groupsAll)
    .sort()
    .map((topic) => {
      const items = groupsAll[topic]
        .map((repo) => {
          const text = repo.title + (repo.archived ? " (archived)" : "");
          const cls = repo.archived ? 'class="archived"' : "";
          return `<li><a ${cls} href="${repo.url}" target="_blank" rel="noopener noreferrer">${text}</a></li>`;
        })
        .join("\n");
      return `<h2>${topic}</h2>\n<ul>\n${items}\n</ul>`;
    })
    .join("\n\n");

  const htmlAll = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>All Test Repositories</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>All Test Repositories</h1>
  ${sectionsAll}
</body>
</html>`;

  // -----------------------------
  // Generate featured_workshops.html
  // -----------------------------
  const sectionsFeatured = Object.keys(groupsFeatured)
    .sort()
    .map((topic) => {
      const items = groupsFeatured[topic]
        .map((repo) => {
          const text = repo.title + (repo.archived ? " (archived)" : "");
          const cls = repo.archived ? 'class="archived"' : "";
          const blurbText = repo.blurb
            ? `<p class="blurb">${repo.blurb}</p>`
            : "";
          return `<li>
  <a ${cls} href="${repo.url}" target="_blank" rel="noopener noreferrer">${text}</a>
  ${blurbText}
</li>`;
        })
        .join("\n");
      return `<h2>${topic}</h2>\n<ul>\n${items}\n</ul>`;
    })
    .join("\n\n");

  const htmlFeatured = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Featured Workshops</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Featured Workshops</h1>
  ${sectionsFeatured}
</body>
</html>`;

  // -----------------------------
  // Write files
  // -----------------------------
  fs.writeFileSync("all_test.html", htmlAll);
  fs.writeFileSync("featured_workshops.html", htmlFeatured);

  console.log("✅ Pages generated: all_test.html, featured_workshops.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
