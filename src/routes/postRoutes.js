const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const commentController = require('../controllers/commentController');
const { auth, optionalAuth } = require('../middleware/auth');

// Post endpoints
router.get('/:id', optionalAuth, postController.getPostById);
router.post('/:id/react', auth, postController.reactToPost);
router.post('/:id/poll/vote', auth, postController.votePoll);
router.post('/:id/save', auth, postController.toggleSavePost);
router.delete('/:id', auth, postController.deletePost);
router.post('/:id/mod-action', auth, postController.modActionOnPost);

// Comments nested under post
router.get('/:postId/comments', optionalAuth, commentController.getPostComments);
router.post('/:postId/comments', auth, commentController.createComment);

// Direct comment actions
router.post('/comments/:id/react', auth, commentController.reactToComment);
router.delete('/comments/:id', auth, commentController.deleteComment);

module.exports = router;
