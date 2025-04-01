const fetch = require("node-fetch");
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const HEADERS = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    'X-GitHub-Api-Version': '2022-11-28'
};

async function createPullRequest(owner, repo, title, head, base, body) {
    const API_BASE_URL = `https://api.github.com/repos/${owner}/${repo}`;

    var prBody = {
        title: title,
        body: body,
        head: head,
        base: base
    };

    const response = await fetch(`${API_BASE_URL}/pulls`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(prBody)
    });

    if (!response.ok) {
        var e = await response.text();
        console.log('e', e)
        throw new Error(`Failed to create PR in ${repo}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ PR created in ${repo}: ${data.html_url}`);
    return { repo, number: data.number, url: data.html_url };
}

async function updatePullRequest(owner, repo, prNumber, body) {
    const API_BASE_URL = `https://api.github.com/repos/${owner}/${repo}`;

    const response = await fetch(`${API_BASE_URL}/pulls/${prNumber}`, {
        method: "PATCH",
        headers: HEADERS,
        body: JSON.stringify({ body })
    });

    if (!response.ok) {
        var e = await response.text();
        console.log('e', e)
        throw new Error(`Failed to update PR in ${repo}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✏️ PR updated in ${repo}: ${data.html_url}`);
    return data;
}

module.exports = {
    createPullRequest,
    updatePullRequest
};