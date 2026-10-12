const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Group = require('../models/Group');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');

// POST /api/posts/:postId/comments
async function createComment(req, res, next) {
  try {
    const { postId } = req.params;
    const { text, parentCommentId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment text cannot be empty.',
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    if (post.isLocked) {
      return res.status(403).json({
        success: false,
        message: 'This post is locked. New comments cannot be added.',
      });
    }

    const comment = await Comment.create({
      postId,
      groupId: post.groupId,
      authorId: req.user._id,
      text: text.trim(),
      parentCommentId: parentCommentId || null,
      reactions: { heart: [], helpful: [] },
    });

    await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });
    await User.findByIdAndUpdate(req.user._id, { $inc: { karma: 1 } });
    await PublicProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { karma: 1 } });

    const authorProfile = await PublicProfile.findOne({ userId: req.user._id });

    return res.status(201).json({
      success: true,
      message: 'Comment added.',
      comment: {
        ...comment.toObject(),
        author: authorProfile,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/posts/:postId/comments
async function getPostComments(req, res, next) {
  try {
    const { postId } = req.params;

    const query = { postId };

    // Blocked users filtering
    if (req.user) {
      const blockedList = req.user.blockedUsers || [];
      const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id }).select('_id');
      const allBlocked = [
        ...blockedList.map((id) => id.toString()),
        ...usersWhoBlockedMe.map((u) => u._id.toString()),
      ];
      if (allBlocked.length > 0) {
        query.authorId = { $nin: allBlocked };
      }
    }

    const comments = await Comment.find(query).sort({ createdAt: 1 });

    const authorIds = comments.map((c) => c.authorId);
    const profiles = await PublicProfile.find({ userId: { $in: authorIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = comments.map((c) => ({
      ...c.toObject(),
      author: profileMap[c.authorId.toString()] || null,
      myReactions: {
        heart: req.user ? c.reactions.heart.some((id) => id.toString() === req.user._id.toString()) : false,
        helpful: req.user ? c.reactions.helpful.some((id) => id.toString() === req.user._id.toString()) : false,
      },
      reactionCounts: {
        heart: c.reactions.heart?.length || 0,
        helpful: c.reactions.helpful?.length || 0,
      },
    }));

    return res.json({
      success: true,
      comments: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/comments/:id/react
async function reactToComment(req, res, next) {
  try {
    const { type } = req.body; // 'heart' or 'helpful'
    if (!['heart', 'helpful'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Reaction must be heart or helpful.',
      });
    }

    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    const hasReacted = comment.reactions[type].some((id) => id.toString() === req.user._id.toString());
    if (hasReacted) {
      comment.reactions[type] = comment.reactions[type].filter(
        (id) => id.toString() !== req.user._id.toString()
      );
    } else {
      comment.reactions[type].push(req.user._id);
    }

    await comment.save();

    return res.json({
      success: true,
      reacted: !hasReacted,
      reactionCounts: {
        heart: comment.reactions.heart?.length || 0,
        helpful: comment.reactions.helpful?.length || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/comments/:id
async function deleteComment(req, res, next) {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    const group = await Group.findById(comment.groupId);
    const isAuthor = comment.authorId.toString() === req.user._id.toString();
    const isGroupOwner = group && group.ownerId.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';

    if (!isAuthor && !isGroupOwner && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this comment.',
      });
    }

    await Post.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } });
    await Comment.findByIdAndDelete(comment._id);

    return res.json({
      success: true,
      message: 'Comment deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createComment,
  getPostComments,
  reactToComment,
  deleteComment,
};
