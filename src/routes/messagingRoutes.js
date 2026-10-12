const express = require('express');
const router = express.Router();
const messagingController = require('../controllers/messagingController');
const { auth } = require('../middleware/auth');

router.get('/', auth, messagingController.getConversations);
router.post('/', auth, messagingController.startConversation);
router.get('/:id/messages', auth, messagingController.getMessages);
router.post('/:id/messages', auth, messagingController.sendMessage);

module.exports = router;
