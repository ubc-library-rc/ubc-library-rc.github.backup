import fs from 'node:fs';
import https from 'node:https';

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

	let nonRepoWorkshops = '';
	try {
  nonRepoWorkshops = fs.readFileSync('non_repo_workshops.html', 'utf8');
} catch (err) {
  console.warn('⚠️ Could not load non_repo_workshops.html:', err.message);
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
  <title>UBC Library Research Commons - Open Educational Materials</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="header">
  	<div id="header-img">
		<img src="images/rc-logo-square.png" alt="UBC Research Commons logo"/>
	</div>
	<div id="header-text">
		UBC Library Research Commons
	</div>
	<div id="header-link">
		<a href="https://github.com/ubc-library-rc/">github.com/ubc-library-rc</a>
	</div>
  </div>
  <p class="large">Past and present workshops offered by the Research Commons</p>
  <p>For currently scheduled workshops visit <a href="https://researchcommons.library.ubc.ca/events/">https://researchcommons.library.ubc.ca/events/</a></p>
  <h1>UBC Library Research Commons workshops</h1>
  ${sections}
  ${nonRepoWorkshops}
</body>
</html>`;

  fs.writeFileSync('all_test.html', html);
  console.log('✅ all_test.html generated');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
