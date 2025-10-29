const fetch = require("node-fetch");
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
const ORG = process.env.GITHUB_ORG;

// List of users to check (comma-separated in .env)
const USERS = process.env.PR_CHECK_USERS 
    ? process.env.PR_CHECK_USERS.split(',').map(u => u.trim())
    : [];

const HEADERS = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    'X-GitHub-Api-Version': '2022-11-28'
};

async function getOpenPRsForUser(username) {
    const query = `is:pr is:open org:${ORG} author:${username}`;
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`;

    const response = await fetch(url, {
        method: "GET",
        headers: HEADERS
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`Failed to fetch PRs for ${username}:`, error);
        return [];
    }

    const data = await response.json();
    return data.items || [];
}

async function getPRReviews(owner, repo, prNumber) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;

    const response = await fetch(url, {
        method: "GET",
        headers: HEADERS
    });

    if (!response.ok) {
        console.error(`Failed to fetch reviews for PR #${prNumber} in ${repo}`);
        return [];
    }

    const reviews = await response.json();
    return reviews;
}

async function getPRDetails(owner, repo, prNumber) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

    const response = await fetch(url, {
        method: "GET",
        headers: HEADERS
    });

    if (!response.ok) {
        console.error(`Failed to fetch PR details for #${prNumber} in ${repo}`);
        return null;
    }

    const prData = await response.json();
    return prData;
}

function countApprovals(reviews) {
    // Get the latest review from each unique reviewer
    const latestReviews = {};
    
    reviews.forEach(review => {
        const userId = review.user.login;
        if (!latestReviews[userId] || new Date(review.submitted_at) > new Date(latestReviews[userId].submitted_at)) {
            latestReviews[userId] = review;
        }
    });

    // Count approvals from the latest reviews
    const approvals = Object.values(latestReviews).filter(review => review.state === "APPROVED");
    return approvals.length;
}

async function sendToSlack(prsNeedingAttention) {
    if (!SLACK_WEBHOOK_URL) {
        console.log("⚠️  SLACK_WEBHOOK_URL not set. Skipping Slack notification.");
        return;
    }

    // Build Slack message blocks
    const blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": `📋 PRs Needing Attention (${prsNeedingAttention.length})`,
                "emoji": true
            }
        },
        {
            "type": "divider"
        }
    ];

    if (prsNeedingAttention.length === 0) {
        blocks.push({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "✅ *All PRs are approved and ready to merge!*"
            }
        });
    } else {
        prsNeedingAttention.forEach(pr => {
            const statusEmoji = pr.approvals < 2 ? "❌" : "⚠️";
            const statusText = pr.approvals < 2 
                ? `${pr.approvals}/2 approvals` 
                : `${pr.approvals} approvals but BLOCKED`;

            blocks.push({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `${statusEmoji} *${statusText}*\n` +
                            `📁 ${pr.repo}\n` +
                            `👤 ${pr.author}\n` +
                            `📝 ${pr.title}\n` +
                            `🔗 <${pr.url}|View PR>`
                }
            });
            blocks.push({ "type": "divider" });
        });
    }

    // Send to Slack
    try {
        const response = await fetch(SLACK_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blocks })
        });

        if (response.ok) {
            console.log("\n✅ Slack notification sent successfully!");
        } else {
            console.error("❌ Failed to send Slack notification:", response.statusText);
        }
    } catch (err) {
        console.error("❌ Error sending Slack notification:", err.message);
    }
}

async function sendToTeams(prsNeedingAttention) {
    if (!TEAMS_WEBHOOK_URL) {
        console.log("⚠️  TEAMS_WEBHOOK_URL not set. Skipping Teams notification.");
        return;
    }

    // Build Teams message card
    let sections = [];
    
    if (prsNeedingAttention.length === 0) {
        sections.push({
            "activityTitle": "✅ All PRs are approved and ready to merge!",
            "activitySubtitle": "No action needed"
        });
    } else {
        prsNeedingAttention.forEach(pr => {
            const statusEmoji = pr.approvals < 2 ? "❌" : "⚠️";
            const statusText = pr.approvals < 2 
                ? `${pr.approvals}/2 approvals` 
                : `${pr.approvals} approvals but BLOCKED`;

            sections.push({
                "activityTitle": `${statusEmoji} ${statusText}`,
                "activitySubtitle": pr.title,
                "facts": [
                    { "name": "Repository:", "value": pr.repo },
                    { "name": "Author:", "value": pr.author },
                    { "name": "Approvals:", "value": pr.approvals.toString() }
                ],
                "potentialAction": [
                    {
                        "@type": "OpenUri",
                        "name": "View PR",
                        "targets": [
                            { "os": "default", "uri": pr.url }
                        ]
                    }
                ]
            });
        });
    }

    const message = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": `PRs Needing Attention (${prsNeedingAttention.length})`,
        "themeColor": prsNeedingAttention.length === 0 ? "28a745" : "dc3545",
        "title": `📋 PRs Needing Attention (${prsNeedingAttention.length})`,
        "sections": sections
    };

    // Send to Teams
    try {
        const response = await fetch(TEAMS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message)
        });

        if (response.ok) {
            console.log("\n✅ Teams notification sent successfully!");
        } else {
            console.error("❌ Failed to send Teams notification:", response.statusText);
        }
    } catch (err) {
        console.error("❌ Error sending Teams notification:", err.message);
    }
}

async function checkPRs() {
    console.log(`🔍 Checking open PRs for users in ${ORG}...\n`);

    const prsNeedingAttention = [];

    for (const user of USERS) {
        console.log(`Checking PRs for ${user}...`);
        const prs = await getOpenPRsForUser(user);

        for (const pr of prs) {
            // Extract owner and repo from the repository URL
            const [owner, repo] = pr.repository_url.split('/').slice(-2);
            const prNumber = pr.number;

            // Get PR details to check mergeable state
            const prDetails = await getPRDetails(owner, repo, prNumber);
            if (!prDetails) continue;

            // Get reviews
            const reviews = await getPRReviews(owner, repo, prNumber);
            const approvalCount = countApprovals(reviews);

            // Check if PR needs attention:
            // 1. Less than 2 approvals
            // 2. Has 2+ approvals but merging is blocked
            const hasTwoApprovals = approvalCount >= 2;
            const isMergingBlocked = prDetails.mergeable === false || prDetails.mergeable_state === "blocked";

            if (!hasTwoApprovals || (hasTwoApprovals && isMergingBlocked)) {
                prsNeedingAttention.push({
                    url: pr.html_url,
                    title: pr.title,
                    author: user,
                    repo: `${owner}/${repo}`,
                    approvals: approvalCount,
                    blocked: isMergingBlocked
                });
            }
        }
    }

    // Display results
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 PRs Needing Attention (${prsNeedingAttention.length})`);
    console.log('='.repeat(60));

    if (prsNeedingAttention.length === 0) {
        console.log("\n✅ All PRs are approved and ready to merge!\n");
    } else {
        prsNeedingAttention.forEach(pr => {
            const reason = pr.approvals < 2 
                ? `❌ ${pr.approvals}/2 approvals` 
                : `⚠️  ${pr.approvals} approvals but BLOCKED`;
            
            console.log(`\n${reason}`);
            console.log(`  📁 ${pr.repo}`);
            console.log(`  👤 ${pr.author}`);
            console.log(`  📝 ${pr.title}`);
            console.log(`  🔗 ${pr.url}`);
        });
        console.log("");
    }

    // Send to Slack
    await sendToSlack(prsNeedingAttention);
    
    // Send to Teams
    await sendToTeams(prsNeedingAttention);
}

// Run the check
checkPRs().catch(err => {
    console.error("❌ Error checking PRs:", err.message);
});