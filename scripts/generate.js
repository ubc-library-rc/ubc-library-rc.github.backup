import fs from 'node:fs';
import https from 'node:https';

const ORG = 'ubc-library-rc';

const TOPIC_LABELS = {
  data: 'Data analysis and visualization',
  'digital-scholarship': 'Digital scholarship',
  geospatial: 'Geographic information systems (GIS) and mapping',
  'research-data-management': 'Research data management'
};

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllRepos(headers) {
  let allRepos = [];
  let page = 1;
  let fetched;

  console.log('🔄 Fetching all repositories from GitHub (with pagination)...');

  do {
    const url = `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`;
    console.log(`📄 Fetching page ${page}...`);
    fetched = await fetchJSON(url, headers);
    allRepos = allRepos.concat(fetched);
    page++;
  } while (fetched.length === 100);

  console.log(`✅ Fetched ${allRepos.length} repositories total.`);
  return allRepos;
}

async function fetchRepoTopics(repoName, headers) {
  const url = `https://api.github.com/repos/${ORG}/${repoName}/topics`;
  return fetchJSON(url, headers);
}

async function fetchRepoReadme(repoName, headers) {
  const url = `https://api.github.com/repos/${ORG}/${repoName}/readme`;
  try {
    const json = await fetchJSON(url, headers);
    const content = Buffer.from(json.content, 'base64').toString('utf8');
    return content;
  } catch (e) {
    console.warn(`⚠️ Could not fetch README for ${repoName}: ${e.message}`);
    return '';
  }
}

function extractTitleAndBlurb(readmeText) {
  let title = '';
  let blurb = '';

  const lines = readmeText.split(/\r?\n/);

  for (const line of lines) {
    if (!title && line.startsWith('#')) {
      title = line.replace(/^#+\s*/, '').trim();
    }
    if (!blurb && line.startsWith('Description:')) {
      blurb = line.replace(/^Description:\s*/, '').trim();
    }
    if (title && blurb) break;
  }

  return { title, blurb };
}

function buildHTMLPage(sections, extraContent = '') {
  return `<!DOCTYPE html>
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
  ${sections}
  ${extraContent}
</body>
</html>`;
}

async function main() {
  const headers = {
    'User-Agent': 'gh-actions',
    'Accept': 'application/vnd.github+json',
    'Authorization': `token ${process.env.GITHUB_TOKEN}`
  };

  const repos = await fetchAllRepos(headers);

  // ---- Enriched list for all_test.html ----
  const enriched = [];
  for (const repo of repos) {
    if (!repo.description) continue;
    try {
      const topics = await fetchRepoTopics(repo.name, headers);
      if (topics.names && topics.names.includes('workshop')) {
        enriched.push({
          name: repo.name,
          description: repo.description,
          url: `https://${ORG}.github.io/${repo.name}/`,
          archived: repo.archived,
          topics: topics.names || []
        });
      }
    } catch (e) {
      console.warn(`Skipping ${repo.name}: ${e.message}`);
    }
  }

  const groupedAll = {};
  for (const topic of Object.keys(TOPIC_LABELS)) {
    groupedAll[topic] = enriched
      .filter(repo => repo.topics.includes(topic))
      .sort((a, b) => a.description.localeCompare(b.description));
  }

  let nonRepoWorkshops = '';
  try {
    nonRepoWorkshops = fs.readFileSync('non_repo_workshops.html', 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not load non_repo_workshops.html:', err.message);
  }

  const sectionsAll = Object.entries(groupedAll).map(([topic, repos]) => {
    if (!repos.length) return '';
    const items = repos.map(repo => {
      const text = repo.description + (repo.archived ? ' (archived)' : '');
      const cls = repo.archived ? 'class="archived"' : '';
      return `<li><a ${cls} href="${repo.url}" target="_blank" rel="noopener noreferrer">${text}</a></li>`;
    }).join('\n');
    return `<section>
  <h2>${TOPIC_LABELS[topic]}</h2>
  <ul>${items}</ul>
</section>`;
  }).join('\n\n');

  const htmlAll = buildHTMLPage(sectionsAll, nonRepoWorkshops);
  fs.writeFileSync('all_test.html', htmlAll);
  console.log('✅ all_test.html generated');

  // ---- Featured workshops page ----
  const featured = [];
  for (const repo of repos) {
    try {
      const topics = await fetchRepoTopics(repo.name, headers);
      if (topics.names && topics.names.includes('workshop') && topics.names.includes('featured')) {
        const readme = await fetchRepoReadme(repo.name, headers);
        const { title, blurb } = extractTitleAndBlurb(readme);
        featured.push({
          name: repo.name,
          title: title || repo.description || repo.name,
          blurb,
          url: `https://${ORG}.github.io/${repo.name}/`,
          archived: repo.archived,
          topics: topics.names || []
        });
      }
    } catch (e) {
      console.warn(`Skipping featured check for ${repo.name}: ${e.message}`);
    }
  }

  const groupedFeatured = {};
  for (const topic of Object.keys(TOPIC_LABELS)) {
    groupedFeatured[topic] = featured
      .filter(repo => repo.topics.includes(topic))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  const sectionsFeatured = Object.entries(groupedFeatured).map(([topic, repos]) => {
    if (!repos.length) return '';
    const items = repos.map(repo => {
      const cls = repo.archived ? 'class="archived"' : '';
      const blurbText = repo.blurb ? `<p class="blurb">${repo.blurb}</p>` : '';
      return `<li>
  <a ${cls} href="${repo.url}" target="_blank" rel="noopener noreferrer">${repo.title}${repo.archived ? ' (archived)' : ''}</a>
  ${blurbText}
</li>`;
    }).join('\n');
    return `<section>
  <h2>${TOPIC_LABELS[topic]}</h2>
  <ul>${items}</ul>
</section>`;
  }).join('\n\n');

  const htmlFeatured = buildHTMLPage(sectionsFeatured);
  fs.writeFileSync('featured_workshops.html', htmlFeatured);
  console.log('✅ featured_workshops.html generated');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

