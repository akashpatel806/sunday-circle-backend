const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const GroupMember = require('../models/GroupMember');
const EventRsvp = require('../models/EventRsvp');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');

// GET /api/conversations
async function getConversations(req, res, next) {
  try {
    const blockedList = (req.user.blockedUsers || []).map((id) => id.toString());

    const conversations = await Conversation.find({
      participants: req.user._id,
    }).sort({ updatedAt: -1 });

    // Filter out conversations with blocked users
    const filtered = conversations.filter((c) => {
      const other = c.participants.find((p) => p.toString() !== req.user._id.toString());
      return !other || !blockedList.includes(other.toString());
    });

    // Populate participant profiles
    const otherUserIds = filtered.flatMap((c) =>
      c.participants.filter((p) => p.toString() !== req.user._id.toString())
    );
    const profiles = await PublicProfile.find({ userId: { $in: otherUserIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = filtered.map((c) => {
      const otherId = c.participants.find((p) => p.toString() !== req.user._id.toString());
      return {
        ...c.toObject(),
        otherParticipant: otherId ? profileMap[otherId.toString()] : null,
      };
    });

    return res.json({
      success: true,
      conversations: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/conversations (Start DM with safety gating check)
async function startConversation(req, res, next) {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Target user ID is required.' });
    }

    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot start conversation with yourself.' });
    }

    // Check block list
    const isBlocked = (req.user.blockedUsers || []).some((id) => id.toString() === targetUserId);
    if (isBlocked) {
      return res.status(403).json({ success: false, message: 'You cannot message a blocked user.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const targetBlockedMe = (targetUser.blockedUsers || []).some(
      (id) => id.toString() === req.user._id.toString()
    );
    if (targetBlockedMe) {
      return res.status(403).json({ success: false, message: 'Cannot send message to this user.' });
    }

    // Safety Gating Check: User must share a group OR have mutual event attendance
    const myGroups = await GroupMember.find({ userId: req.user._id, status: 'approved' }).select('groupId');
    const myGroupIds = myGroups.map((m) => m.groupId);

    const mutualGroup = await GroupMember.findOne({
      userId: targetUserId,
      groupId: { $in: myGroupIds },
      status: 'approved',
    });

    let allowed = Boolean(mutualGroup);

    if (!allowed) {
      // Check mutual event attendance
      const myEvents = await EventRsvp.find({ userId: req.user._id, status: 'going' }).select('eventId');
      const myEventIds = myEvents.map((r) => r.eventId);

      const mutualEvent = await EventRsvp.findOne({
        userId: targetUserId,
        eventId: { $in: myEventIds },
        status: 'going',
      });

      allowed = Boolean(mutualEvent);
    }

    // Circle Plus members or moderators get flexible messaging
    if (req.user.membershipStatus === 'circle_plus' || req.user.role === 'admin' || req.user.role === 'moderator') {
      allowed = true;
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Safety rule: You can only message members who share a group or event with you.',
      });
    }

    // Find existing conversation
    let conv = await Conversation.findOne({
      type: 'direct',
      participants: { $all: [req.user._id, targetUserId], $size: 2 },
    });

    if (!conv) {
      conv = await Conversation.create({
        type: 'direct',
        participants: [req.user._id, targetUserId],
        lastMessage: { text: 'Conversation started', senderId: req.user._id, sentAt: new Date() },
      });
    }

    const otherProfile = await PublicProfile.findOne({ userId: targetUserId });

    return res.json({
      success: true,
      conversation: {
        ...conv.toObject(),
        otherParticipant: otherProfile,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/conversations/:id/messages
async function getMessages(req, res, next) {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const isParticipant = conv.participants.some((p) => p.toString() === req.user._id.toString());
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const messages = await Message.find({ conversationId: conv._id }).sort({ createdAt: 1 });

    const senderIds = [...new Set(messages.map((m) => m.senderId.toString()))];
    const profiles = await PublicProfile.find({ userId: { $in: senderIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = messages.map((m) => ({
      ...m.toObject(),
      sender: profileMap[m.senderId.toString()] || null,
      isMine: m.senderId.toString() === req.user._id.toString(),
    }));

    return res.json({
      success: true,
      messages: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/conversations/:id/messages
async function sendMessage(req, res, next) {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text cannot be empty.' });
    }

    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const isParticipant = conv.participants.some((p) => p.toString() === req.user._id.toString());
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const message = await Message.create({
      conversationId: conv._id,
      senderId: req.user._id,
      text: text.trim(),
      readBy: [req.user._id],
    });

    conv.lastMessage = {
      text: text.trim(),
      senderId: req.user._id,
      sentAt: new Date(),
    };
    await conv.save();

    const senderProfile = await PublicProfile.findOne({ userId: req.user._id });

    return res.status(201).json({
      success: true,
      message: {
        ...message.toObject(),
        sender: senderProfile,
        isMine: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConversations,
  startConversation,
  getMessages,
  sendMessage,
};
