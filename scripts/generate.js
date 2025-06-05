import fs from 'node:fs';
import https from 'node:https';

const TOPIC_LABELS = {
  data: 'Data analysis and visualization',
  geospatial: 'Geographic information systems (GIS) and mapping',
  'digital-scholarship': 'Digital scholarship'
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

async function main() {
  const headers = {
    'User-Agent': 'gh-actions',
    'Accept': 'application/vnd.github.mercy-preview+json'
  };

  const repos = await fetchJSON('https://api.github.com/orgs/ubc-library-rc/repos?per_page=100', headers);

  const enriched = [];
  for (const repo of repos) {
    if (!repo.description) continue;
    try {
      const topics = await fetchJSON(`https://api.github.com/repos/ubc-library-rc/${repo.name}/topics`, headers);
      enriched.push({
        name: repo.name,
        description: repo.description,
        url: `https://ubc-library-rc.github.io/${repo.name}/`,
        archived: repo.archived,
        topics: topics.names || []
      });
    } catch (e) {
      console.warn(`Skipping ${repo.name}: ${e.message}`);
    }
  }

  const grouped = {};
  for (const topic of Object.keys(TOPIC_LABELS)) {
    grouped[topic] = enriched
      .filter(repo => repo.topics.includes(topic))
      .sort((a, b) => a.description.localeCompare(b.description));
  }

  const sections = Object.entries(grouped).map(([topic, repos]) => {
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>UBC Library Research Commons workshops</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; max-width: 800px; margin: auto; }
    h1 { font-size: 1.8rem; color: #003366; }
    h2 { margin-top: 2rem; font-size: 1.4rem; color: #0055aa; }
    ul { list-style: none; padding-left: 0; }
    li { margin-bottom: 1rem; }
    a { color: #0055aa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .archived { font-style: italic; }
  </style>
</head>
<body>
  <h1>UBC Library Research Commons workshops</h1>
  ${sections}
</body>
</html>`;

  fs.writeFileSync('all_test.html', html);
  console.log('✅ all_test.html generated');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
