const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure repos directory exists
if (!fs.existsSync(config.REPOS_BASE_PATH)) {
    fs.mkdirSync(config.REPOS_BASE_PATH, { recursive: true });
}

async function cloneOrUpdate(repoUrl, ticketId, branchName) {
    const repoDir = path.join(config.REPOS_BASE_PATH, ticketId);
    let authenticatedUrl = repoUrl;

    if (config.GITHUB_TOKEN && repoUrl.startsWith('git@github.com:')) {
        // Convert SSH to HTTPS with token
        const match = repoUrl.match(/git@github\.com:(.+)\.git$/);
        if (match) {
            const repoPath = match[1];
            authenticatedUrl = `https://${config.GITHUB_TOKEN}@github.com/${repoPath}.git`;
            console.log(`[git] Using authenticated HTTPS URL for ${repoPath}`);
        }
    } else if (config.GITHUB_TOKEN && repoUrl.startsWith('https://github.com/')) {
        // Inject token into existing HTTPS URL if not present
        if (!repoUrl.includes('@')) {
            authenticatedUrl = repoUrl.replace('https://github.com/', `https://${config.GITHUB_TOKEN}@github.com/`);
            console.log('[git] Injected token into HTTPS URL');
        }
    }

    if (fs.existsSync(repoDir)) {
        console.log(`[git] Repo exists at ${repoDir}, pulling...`);
        const git = simpleGit(repoDir);
        await git.fetch();
        await git.checkout(branchName);
        await git.pull();
        return repoDir;
    } else {
        console.log(`[git] Cloning ${authenticatedUrl.replace(config.GITHUB_TOKEN, '***')} to ${repoDir}...`);
        await simpleGit().clone(authenticatedUrl, repoDir);
        const git = simpleGit(repoDir);
        await git.checkout(branchName);
        return repoDir;
    }
}

async function getCurrentCommit(repoPath) {
    const git = simpleGit(repoPath);
    const log = await git.log(['-1']);
    return log.latest.hash;
}

module.exports = {
    cloneOrUpdate,
    getCurrentCommit
};
