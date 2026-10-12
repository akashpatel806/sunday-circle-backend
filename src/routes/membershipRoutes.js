const express = require('express');
const router = express.Router();
const membershipController = require('../controllers/membershipController');
const { auth, optionalAuth } = require('../middleware/auth');

router.get('/plans', optionalAuth, membershipController.getPlans);
router.post('/subscribe', auth, membershipController.subscribe);
router.post('/webhook', membershipController.webhook);

module.exports = router;
