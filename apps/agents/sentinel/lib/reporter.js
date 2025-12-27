function formatFeedback(checks) {
    return checks
        .filter(c => !c.passed)
        .map(c => `[${c.type || 'check'}] ${c.message || 'Check failed'}`);
}

module.exports = {
    formatFeedback
};
