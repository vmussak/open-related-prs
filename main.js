const { createPullRequest, updatePullRequest } = require("./github-pr");

const OWNER = "company-name";
const REPOS = ["test-api", "another-api"];
const BASE_BRANCH = "master";

// 🧾 PR Config
const BRANCH_NAME = "feature/my-branch"; // your branch
const PR_TITLE = "[script-test] - Testing open PR script and cleanup code";
const PR_DESCRIPTION = "This PR cleans and standardizes code, as well as testing a script for creating PRs.";

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
    } catch (err) {
        console.error("❌ Error creating or updating PRs:", err.message);
    }
}

main();
