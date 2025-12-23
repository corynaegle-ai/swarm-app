const express = require('express');
const router = express.Router();
const commentsRouter = require('./comments');

// Mount comments router under tickets
router.use('/:ticketId/comments', commentsRouter);

// ... existing ticket routes would be here ...

module.exports = router;