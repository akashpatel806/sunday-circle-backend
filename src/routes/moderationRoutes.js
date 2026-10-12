const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderationController');
const { auth } = require('../middleware/auth');
const { requireModerator } = require('../middleware/roles');

// Reporting (any user)
router.post('/reports', auth, moderationController.createReport);

// Moderator queue
router.get('/moderation/reports', auth, requireModerator, moderationController.getReports);
router.get('/moderation/reports/:id/inspect-real-names', auth, requireModerator, moderationController.inspectReportRealNames);
router.post('/moderation/reports/:id/resolve', auth, requireModerator, moderationController.resolveReport);
router.get('/moderation/access-logs', auth, requireModerator, moderationController.getAccessLogs);

module.exports = router;
