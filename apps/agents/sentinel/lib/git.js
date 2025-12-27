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

    if (fs.existsSync(repoDir)) {
        console.log(`[git] Repo exists at ${repoDir}, pulling...`);
        const git = simpleGit(repoDir);
        await git.fetch();
        await git.checkout(branchName);
        await git.pull();
        return repoDir;
    } else {
        console.log(`[git] Cloning ${repoUrl} to ${repoDir}...`);
        await simpleGit().clone(repoUrl, repoDir);
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
