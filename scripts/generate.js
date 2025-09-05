#!/usr/bin/env node

import fs from "node:fs";

const ORG = "ubc-library-rc"; // replace if needed
const TOKEN = process.env.GITHUB_TOKEN;

const TOPIC_LABELS = {
  data: "Data analysis and visualization",
  "digital-scholarship": "Digital scholarship",
  geospatial: "Geographic information systems (GIS) and mapping",
//  "research-data-management": "Research data management",    --exclude RDM, which is added manually through 'non_repo_workshops.html' 
};

// -----------------------------
// Helpers
// -----------------------------

async function fetchAllRepos(headers) {
  let allRepos = [];
  let page = 1;
  let fetched;
  do {
    const res = await fetch(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: repos page ${page}`);
    fetched = await res.json();
    allRepos = allRepos.concat(fetched);
    page++;
  } while (fetched.length === 100);
  return allRepos;
}

async function fetchRepoTopics(repo, headers) {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/topics`, {
    headers: { ...headers, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return { names: [] };
  return res.json();
}

async function fetchRepoReadme(repo, headers) {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/readme`, {
    headers,
  });
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
  const headers = {
    "User-Agent": "gh-actions",
    Accept: "application/vnd.github+json",
    ...(TOKEN ? { Authorization: `token ${TOKEN}` } : {}),
  };

  const repos = await fetchAllRepos(headers);

  const enriched = [];
  const featured = [];

  for (const repo of repos) {
    if (!repo.description) continue;

    try {
      const topics = await fetchRepoTopics(repo.name, headers);
      const readme = await fetchRepoReadme(repo.name, headers);
      const { title, blurb } = extractTitleAndBlurb(readme);

      const finalTitle = title || repo.description || repo.name;

      const enrichedRepo = {
        name: repo.name,
        title: finalTitle,
        blurb,
        url: `https://${ORG}.github.io/${repo.name}/`,
        archived: repo.archived,
        topics: topics.names || [],
      };

      if (topics.names && topics.names.includes("workshop")) {
        enriched.push(enrichedRepo);
      }
      if (topics.names && topics.names.includes("featured")) {
        featured.push(enrichedRepo);
      }
    } catch (e) {
      console.warn(`⚠️ Skipping ${repo.name}: ${e.message}`);
    }
  }

  // -----------------------------
  // Group by predefined topics
  // -----------------------------
  function groupRepos(repos) {
    const grouped = {};
    for (const topic of Object.keys(TOPIC_LABELS)) {
      grouped[topic] = repos
        .filter((r) => r.topics.includes(topic))
        .sort((a, b) => a.title.localeCompare(b.title));
    }
    return grouped;
  }

  const groupedAll = groupRepos(enriched);
  const groupedFeatured = groupRepos(featured);

  // -----------------------------
  // Non-repo workshops
  // -----------------------------
  let nonRepoWorkshops = "";
  try {
    nonRepoWorkshops = fs.readFileSync("non_repo_workshops.html", "utf8");
  } catch (err) {
    console.warn("⚠️ Could not load non_repo_workshops.html:", err.message);
  }

  // -----------------------------
  // Non-repo featured workshops
  // -----------------------------
  let nonRepoFeaturedWorkshops = "";
  try {
    nonRepoFeaturedWorkshops = fs.readFileSync("non_repo_featured_workshops.html", "utf8");
  } catch (err) {
    console.warn("⚠️ Could not load non_repo_featured_workshops.html:", err.message);
  }
  
  // -----------------------------
  // Generate all_test.html
  // -----------------------------
  const sectionsAll = Object.entries(groupedAll)
    .map(([topic, repos]) => {
      if (!repos.length) return "";
      const items = repos
        .map((repo) => {
          const text = repo.title + (repo.archived ? " (archived)" : "");
          const cls = repo.archived ? 'class="archived"' : "";
          return `<li><a ${cls} href="${repo.url}" target="_blank" rel="noopener noreferrer">${text}</a></li>`;
        })
        .join("\n");
      return `<section>
  <h2>${TOPIC_LABELS[topic]}</h2>
  <ul>${items}</ul>
</section>`;
    })
    .join("\n\n");

  const htmlAll = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>UBC Library Research Commons - Open Educational Materials</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <section>
    <div class="header-flex">
      <div id="header-img">
        <img src="images/rc-logo-square.png" alt="UBC Research Commons logo"/>
      </div>
      <div id="header-text">
        UBC Library Research Commons
      </div>
      <div id="header-link">
        <a href="https://github.com/${ORG}/">github.com/${ORG}</a>
      </div>
    </div>
  </section>
  <h1>Past and present workshops offered by the Research Commons</h1>
  <p>For currently scheduled workshops visit <a href="https://researchcommons.library.ubc.ca/events/">https://researchcommons.library.ubc.ca/events/</a></p>
  ${sectionsAll}
  ${nonRepoWorkshops}
</body>
</html>`;

  fs.writeFileSync("all_test.html", htmlAll);

  // -----------------------------
  // Generate featured_workshops.html
  // -----------------------------
  const sectionsFeatured = Object.entries(groupedFeatured)
    .map(([topic, repos]) => {
      if (!repos.length) return "";
      const items = repos
        .map((repo) => {
          const text = repo.title + (repo.archived ? " (archived)" : "");
          const cls = repo.archived ? 'class="archived"' : "";
          const blurbText = repo.blurb
            ? `<p class="blurb">${repo.blurb}</p>`
            : "";
          return `<div class="workshop-card">
        <a ${cls} href="${repo.url}" target="_blank" rel="noopener noreferrer">${text}</a>
        ${blurbText}
        </div>`;
        })
        .join("\n");
      return `<section>
        <h2>${TOPIC_LABELS[topic]}</h2>
        <div class="workshop-grid">
          ${items}
        </div>
      </section>`;
    })
    .join("\n\n");

  const htmlFeatured = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>UBC Library Research Commons - Featured workshops</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <section>
    <div class="header-flex">
      <div id="header-img">
        <img src="images/rc-logo-square.png" alt="UBC Research Commons logo"/>
      </div>
      <div id="header-text">
        UBC Library Research Commons
      </div>
      <div id="header-link">
        <a href="https://github.com/${ORG}/">github.com/${ORG}</a>
      </div>
    </div>
  </section>
  <h1>Featured Workshops</h1>
  ${sectionsFeatured}
  ${nonRepoFeaturedWorkshops}
</body>
</html>`;

  fs.writeFileSync("featured_workshops.html", htmlFeatured);

  console.log("✅ Pages generated: all_test.html, featured_workshops.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
