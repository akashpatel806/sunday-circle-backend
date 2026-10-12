const crypto = require('crypto');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');

// POST /api/groups/:groupId/posts
async function createPost(req, res, next) {
  try {
    const { groupId } = req.params;
    const { text, flair, mediaUrl, poll } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Post text cannot be empty.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    // Check membership
    const membership = await GroupMember.findOne({
      groupId,
      userId: req.user._id,
      status: 'approved',
    });

    if (!membership && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You must be a member of this group to post.',
      });
    }

    let pollData = { question: '', options: [] };
    if (poll && poll.question && Array.isArray(poll.options) && poll.options.length >= 2) {
      pollData = {
        question: poll.question.trim(),
        options: poll.options.map((opt) => ({
          id: crypto.randomBytes(4).toString('hex'),
          text: String(opt).trim(),
          votes: [],
        })),
      };
    }

    const post = await Post.create({
      groupId,
      authorId: req.user._id,
      text: text.trim(),
      flair: flair || 'Discussion',
      mediaUrl: mediaUrl || '',
      poll: pollData,
      reactions: { heart: [], helpful: [], cheer: [] },
      commentsCount: 0,
    });

    // Award karma
    await User.findByIdAndUpdate(req.user._id, { $inc: { karma: 3 } });
    await PublicProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { karma: 3 } });

    const authorProfile = await PublicProfile.findOne({ userId: req.user._id });

    return res.status(201).json({
      success: true,
      message: 'Post published successfully.',
      post: {
        ...post.toObject(),
        author: authorProfile,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups/:groupId/posts
async function getGroupPosts(req, res, next) {
  try {
    const { groupId } = req.params;
    const { sort, flair } = req.query; // sort: 'new', 'top', 'discussed'

    const query = { groupId };
    if (flair) query.flair = flair;

    // Two-way blocked filter
    if (req.user) {
      const blockedList = req.user.blockedUsers || [];
      // Also exclude authors who have blocked req.user
      const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id }).select('_id');
      const allBlocked = [
        ...blockedList.map((id) => id.toString()),
        ...usersWhoBlockedMe.map((u) => u._id.toString()),
      ];
      if (allBlocked.length > 0) {
        query.authorId = { $nin: allBlocked };
      }
    }

    let posts = await Post.find(query).sort({ isPinned: -1, createdAt: -1 });

    // Client/query sort customization
    if (sort === 'top') {
      posts.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const scoreA =
          (a.reactions.heart?.length || 0) +
          (a.reactions.helpful?.length || 0) +
          (a.reactions.cheer?.length || 0);
        const scoreB =
          (b.reactions.heart?.length || 0) +
          (b.reactions.helpful?.length || 0) +
          (b.reactions.cheer?.length || 0);
        return scoreB - scoreA;
      });
    } else if (sort === 'discussed') {
      posts.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (b.commentsCount || 0) - (a.commentsCount || 0);
      });
    }

    const authorIds = posts.map((p) => p.authorId);
    const profiles = await PublicProfile.find({ userId: { $in: authorIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const restrictedList = (req.user?.restrictedUsers || []).map((id) => id.toString());
    const savedList = (req.user?.savedPosts || []).map((id) => id.toString());

    const result = posts.map((p) => {
      const authorIdStr = p.authorId.toString();
      const isRestrictedByMe = restrictedList.includes(authorIdStr);

      let myReactions = {
        heart: req.user ? p.reactions.heart.some((id) => id.toString() === req.user._id.toString()) : false,
        helpful: req.user ? p.reactions.helpful.some((id) => id.toString() === req.user._id.toString()) : false,
        cheer: req.user ? p.reactions.cheer.some((id) => id.toString() === req.user._id.toString()) : false,
      };

      let myPollVote = null;
      if (req.user && p.poll && p.poll.options) {
        for (const opt of p.poll.options) {
          if (opt.votes.some((id) => id.toString() === req.user._id.toString())) {
            myPollVote = opt.id;
            break;
          }
        }
      }

      return {
        ...p.toObject(),
        author: profileMap[authorIdStr] || null,
        isSaved: savedList.includes(p._id.toString()),
        isRestrictedContent: isRestrictedByMe,
        myReactions,
        myPollVote,
        reactionCounts: {
          heart: p.reactions.heart?.length || 0,
          helpful: p.reactions.helpful?.length || 0,
          cheer: p.reactions.cheer?.length || 0,
          total:
            (p.reactions.heart?.length || 0) +
            (p.reactions.helpful?.length || 0) +
            (p.reactions.cheer?.length || 0),
        },
      };
    });

    return res.json({
      success: true,
      posts: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/posts/:id
async function getPostById(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const author = await PublicProfile.findOne({ userId: post.authorId });
    const group = await Group.findById(post.groupId).select('name visibility coverUrl');

    let myReactions = {
      heart: req.user ? post.reactions.heart.some((id) => id.toString() === req.user._id.toString()) : false,
      helpful: req.user ? post.reactions.helpful.some((id) => id.toString() === req.user._id.toString()) : false,
      cheer: req.user ? post.reactions.cheer.some((id) => id.toString() === req.user._id.toString()) : false,
    };

    let myPollVote = null;
    if (req.user && post.poll && post.poll.options) {
      for (const opt of post.poll.options) {
        if (opt.votes.some((id) => id.toString() === req.user._id.toString())) {
          myPollVote = opt.id;
          break;
        }
      }
    }

    return res.json({
      success: true,
      post: {
        ...post.toObject(),
        author,
        group,
        myReactions,
        myPollVote,
        reactionCounts: {
          heart: post.reactions.heart?.length || 0,
          helpful: post.reactions.helpful?.length || 0,
          cheer: post.reactions.cheer?.length || 0,
          total:
            (post.reactions.heart?.length || 0) +
            (post.reactions.helpful?.length || 0) +
            (post.reactions.cheer?.length || 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/posts/:id/react
async function reactToPost(req, res, next) {
  try {
    const { type } = req.body; // 'heart', 'helpful', 'cheer'
    if (!['heart', 'helpful', 'cheer'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Reaction type must be heart, helpful, or cheer.',
      });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const hasReacted = post.reactions[type].some((id) => id.toString() === req.user._id.toString());
    if (hasReacted) {
      post.reactions[type] = post.reactions[type].filter(
        (id) => id.toString() !== req.user._id.toString()
      );
    } else {
      post.reactions[type].push(req.user._id);
      // Award karma to author
      await User.findByIdAndUpdate(post.authorId, { $inc: { karma: 1 } });
      await PublicProfile.findOneAndUpdate({ userId: post.authorId }, { $inc: { karma: 1 } });
    }

    await post.save();

    return res.json({
      success: true,
      reacted: !hasReacted,
      reactionCounts: {
        heart: post.reactions.heart?.length || 0,
        helpful: post.reactions.helpful?.length || 0,
        cheer: post.reactions.cheer?.length || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/posts/:id/poll/vote
async function votePoll(req, res, next) {
  try {
    const { optionId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post || !post.poll || !post.poll.options.length) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }

    // Check if user already voted in any option
    let previousOption = null;
    post.poll.options.forEach((opt) => {
      const idx = opt.votes.findIndex((id) => id.toString() === req.user._id.toString());
      if (idx !== -1) {
        opt.votes.splice(idx, 1);
        previousOption = opt.id;
      }
    });

    const targetOpt = post.poll.options.find((opt) => opt.id === optionId);
    if (!targetOpt) {
      return res.status(404).json({ success: false, message: 'Poll option not found.' });
    }

    targetOpt.votes.push(req.user._id);
    await post.save();

    return res.json({
      success: true,
      message: 'Vote recorded.',
      poll: post.poll,
      myPollVote: optionId,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/posts/:id/save
async function toggleSavePost(req, res, next) {
  try {
    const postId = req.params.id;
    const user = await User.findById(req.user._id);
    const isSaved = (user.savedPosts || []).some((id) => id.toString() === postId);

    let updated;
    if (isSaved) {
      updated = await User.findByIdAndUpdate(
        req.user._id,
        { $pull: { savedPosts: postId } },
        { new: true }
      );
    } else {
      updated = await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { savedPosts: postId } },
        { new: true }
      );
    }

    return res.json({
      success: true,
      isSaved: !isSaved,
      message: isSaved ? 'Post removed from saved.' : 'Post saved to bookmarks.',
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/posts/:id
async function deletePost(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const group = await Group.findById(post.groupId);
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isGroupOwner = group && group.ownerId.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';

    if (!isAuthor && !isGroupOwner && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this post.',
      });
    }

    await Comment.deleteMany({ postId: post._id });
    await Post.findByIdAndDelete(post._id);

    return res.json({
      success: true,
      message: 'Post deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/posts/:id/mod-action
async function modActionOnPost(req, res, next) {
  try {
    const { action } = req.body; // 'pin', 'unpin', 'lock', 'unlock'
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const group = await Group.findById(post.groupId);
    const isGroupOwner = group && group.ownerId.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';

    if (!isGroupOwner && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Only group organizers or moderators can perform this action.',
      });
    }

    if (action === 'pin') post.isPinned = true;
    if (action === 'unpin') post.isPinned = false;
    if (action === 'lock') post.isLocked = true;
    if (action === 'unlock') post.isLocked = false;

    await post.save();

    return res.json({
      success: true,
      message: `Post ${action}ned successfully.`,
      isPinned: post.isPinned,
      isLocked: post.isLocked,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPost,
  getGroupPosts,
  getPostById,
  reactToPost,
  votePoll,
  toggleSavePost,
  deletePost,
  modActionOnPost,
};
