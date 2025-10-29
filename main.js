const { createPullRequest, updatePullRequest } = require("./github-pr");
require('dotenv').config();

// Load configuration from environment variables
const OWNER = process.env.PR_OWNER ;
const REPOS = process.env.PR_REPOS 
    ? process.env.PR_REPOS.split(',').map(r => r.trim()) 
    : [];
const BASE_BRANCH = process.env.PR_BASE_BRANCH || "master";

// 🧾 PR Config
const BRANCH_NAME = process.env.PR_BRANCH_NAME || "feature/example";
const PR_TITLE = process.env.PR_TITLE || "Example PR Title";
const PR_DESCRIPTION = process.env.PR_DESCRIPTION || "Example PR Description";

async function main() {
    try {
        const createdPRs = [];

        for (const repo of REPOS) {
            const pr = await createPullRequest(
                OWNER,
                repo,
                PR_TITLE,
                BRANCH_NAME,
                BASE_BRANCH,
                PR_DESCRIPTION
            );
            createdPRs.push(pr);
        }

        const relatedPRsText = createdPRs
            .map(pr => `- Related PR: [${pr.repo}](${pr.url})`)
            .join("\n");

        for (const pr of createdPRs) {
            const fullBody = `${PR_DESCRIPTION}\n\n${relatedPRsText}`;
            await updatePullRequest(OWNER, pr.repo, pr.number, fullBody);
        }

        console.log("\n🚀 All PRs created and updated with related links.");

        console.log("\n");
        console.log(`${BRANCH_NAME} PRs:`);
        createdPRs.forEach(pr => {
            console.log(`- ${pr.repo}: ${pr.url}`);
        });

    } catch (err) {
        console.error("❌ Error creating or updating PRs:", err.message);
    }
}

main();