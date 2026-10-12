const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.getMe);
router.put('/profile', auth, authController.updateProfile);
router.post('/verification-request', auth, authController.requestVerification);
router.get('/users/:id/public', auth, authController.getPublicProfile);
router.post('/users/:id/block', auth, authController.toggleBlockUser);
router.post('/users/:id/restrict', auth, authController.toggleRestrictUser);

module.exports = router;
