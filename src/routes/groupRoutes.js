const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const postController = require('../controllers/postController');
const { auth, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, groupController.getGroups);
router.post('/', auth, groupController.createGroup);
router.get('/:id', optionalAuth, groupController.getGroupById);
router.post('/:id/join', auth, groupController.joinGroup);
router.post('/:id/leave', auth, groupController.leaveGroup);
router.get('/:id/members', optionalAuth, groupController.getGroupMembers);
router.get('/:id/pending-members', auth, groupController.getPendingMembers);
router.post('/:id/members/:userId/review', auth, groupController.reviewPendingMember);
router.get('/:id/members/real-names', auth, groupController.getMemberRealNames);

// Group Posts
router.get('/:groupId/posts', optionalAuth, postController.getGroupPosts);
router.post('/:groupId/posts', auth, postController.createPost);

module.exports = router;
