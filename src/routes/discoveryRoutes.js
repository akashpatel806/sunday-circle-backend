const express = require('express');
const router = express.Router();
const discoveryController = require('../controllers/discoveryController');
const { optionalAuth } = require('../middleware/auth');

router.get('/feed', optionalAuth, discoveryController.getDiscoveryFeed);
router.get('/search', optionalAuth, discoveryController.searchDiscovery);

module.exports = router;
