const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');
const { logRealNameAccess } = require('../services/auditLogger');

// POST /api/groups
async function createGroup(req, res, next) {
  try {
    const { name, description, tags, location, visibility, womenOnly, coverUrl } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Group name and description are required.',
      });
    }

    // Check tier quota: free tier users capped at 2 groups
    if (req.user.membershipStatus !== 'circle_plus') {
      const ownedCount = await Group.countDocuments({ ownerId: req.user._id });
      if (ownedCount >= 2) {
        return res.status(403).json({
          success: false,
          message: 'Free tier members are limited to creating 2 groups. Upgrade to Circle Plus for unlimited groups.',
        });
      }
    }

    const group = await Group.create({
      name: name.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map((t) => t.trim()) : []),
      location: location || 'Bengaluru, India',
      visibility: visibility || 'public',
      womenOnly: womenOnly !== undefined ? Boolean(womenOnly) : true,
      coverUrl: coverUrl || '',
      ownerId: req.user._id,
      membersCount: 1,
    });

    // Add owner to GroupMember
    await GroupMember.create({
      groupId: group._id,
      userId: req.user._id,
      role: 'owner',
      status: 'approved',
    });

    // Award karma
    await User.findByIdAndUpdate(req.user._id, { $inc: { karma: 5 } });
    await PublicProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { karma: 5 } });

    return res.status(201).json({
      success: true,
      message: 'Group created successfully.',
      group,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups
async function getGroups(req, res, next) {
  try {
    const { search, tag, womenOnly, myGroups } = req.query;
    const query = {};

    // Blocked users filtering
    if (req.user && req.user.blockedUsers && req.user.blockedUsers.length > 0) {
      query.ownerId = { $nin: req.user.blockedUsers };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    if (tag) {
      query.tags = { $in: [new RegExp(tag, 'i')] };
    }

    if (womenOnly !== undefined) {
      query.womenOnly = womenOnly === 'true';
    }

    if (myGroups === 'true' && req.user) {
      const myMemberships = await GroupMember.find({
        userId: req.user._id,
        status: 'approved',
      }).select('groupId');
      const groupIds = myMemberships.map((m) => m.groupId);
      query._id = { $in: groupIds };
    }

    const groups = await Group.find(query).sort({ createdAt: -1 });

    // Populate user's membership status for each group if authenticated
    let userMemberships = {};
    if (req.user) {
      const memberships = await GroupMember.find({
        userId: req.user._id,
        groupId: { $in: groups.map((g) => g._id) },
      });
      memberships.forEach((m) => {
        userMemberships[m.groupId.toString()] = {
          role: m.role,
          status: m.status,
        };
      });
    }

    const result = groups.map((g) => {
      const membership = userMemberships[g._id.toString()];
      return {
        ...g.toObject(),
        myMembership: membership || null,
        isJoined: membership?.status === 'approved',
        isPending: membership?.status === 'pending',
      };
    });

    return res.json({
      success: true,
      groups: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups/:id
async function getGroupById(req, res, next) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    const ownerProfile = await PublicProfile.findOne({ userId: group.ownerId });

    let myMembership = null;
    if (req.user) {
      myMembership = await GroupMember.findOne({
        groupId: group._id,
        userId: req.user._id,
      });
    }

    return res.json({
      success: true,
      group: {
        ...group.toObject(),
        owner: ownerProfile,
        myMembership: myMembership ? { role: myMembership.role, status: myMembership.status } : null,
        isJoined: myMembership?.status === 'approved',
        isPending: myMembership?.status === 'pending',
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/groups/:id/join
async function joinGroup(req, res, next) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    const existingMember = await GroupMember.findOne({
      groupId: group._id,
      userId: req.user._id,
    });

    if (existingMember) {
      if (existingMember.status === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'You are already a member of this group.',
        });
      }
      if (existingMember.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Your join request is pending approval by the group organizer.',
        });
      }
    }

    const status = group.visibility === 'public' ? 'approved' : 'pending';

    const member = await GroupMember.findOneAndUpdate(
      { groupId: group._id, userId: req.user._id },
      { role: 'member', status, joinedAt: new Date() },
      { upsert: true, new: true }
    );

    if (status === 'approved') {
      await Group.findByIdAndUpdate(group._id, { $inc: { membersCount: 1 } });
      await User.findByIdAndUpdate(req.user._id, { $inc: { karma: 2 } });
      await PublicProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { karma: 2 } });
    }

    return res.json({
      success: true,
      message:
        status === 'approved'
          ? 'Successfully joined the group!'
          : 'Join request sent to organizer for review.',
      status,
      member,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/groups/:id/leave
async function leaveGroup(req, res, next) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    if (group.ownerId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Group owners cannot leave their own group. Please transfer ownership or delete group.',
      });
    }

    const member = await GroupMember.findOneAndDelete({
      groupId: group._id,
      userId: req.user._id,
    });

    if (member && member.status === 'approved') {
      await Group.findByIdAndUpdate(group._id, { $inc: { membersCount: -1 } });
    }

    return res.json({
      success: true,
      message: 'You have left the group.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups/:id/members
async function getGroupMembers(req, res, next) {
  try {
    const members = await GroupMember.find({
      groupId: req.params.id,
      status: 'approved',
    }).sort({ joinedAt: 1 });

    const userIds = members.map((m) => m.userId);
    const profiles = await PublicProfile.find({ userId: { $in: userIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = members.map((m) => ({
      _id: m._id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      profile: profileMap[m.userId.toString()] || null,
    }));

    return res.json({
      success: true,
      members: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups/:id/pending-members (Owner only)
async function getPendingMembers(req, res, next) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    if (group.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the group organizer can view pending join requests.',
      });
    }

    const pending = await GroupMember.find({
      groupId: group._id,
      status: 'pending',
    }).sort({ createdAt: -1 });

    const userIds = pending.map((p) => p.userId);
    const profiles = await PublicProfile.find({ userId: { $in: userIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = pending.map((p) => ({
      _id: p._id,
      userId: p.userId,
      role: p.role,
      joinedAt: p.createdAt,
      profile: profileMap[p.userId.toString()] || null,
    }));

    return res.json({
      success: true,
      pendingRequests: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/groups/:id/members/:userId/review (Owner only)
async function reviewPendingMember(req, res, next) {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    if (group.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the group organizer can review member requests.',
      });
    }

    const member = await GroupMember.findOne({
      groupId: group._id,
      userId: req.params.userId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Membership request not found.',
      });
    }

    if (action === 'approve') {
      member.status = 'approved';
      await member.save();
      await Group.findByIdAndUpdate(group._id, { $inc: { membersCount: 1 } });
      await User.findByIdAndUpdate(member.userId, { $inc: { karma: 2 } });
      await PublicProfile.findOneAndUpdate({ userId: member.userId }, { $inc: { karma: 2 } });
      return res.json({ success: true, message: 'Member approved successfully.', member });
    } else {
      member.status = 'rejected';
      await member.save();
      return res.json({ success: true, message: 'Member request rejected.', member });
    }
  } catch (err) {
    next(err);
  }
}

// GET /api/groups/:id/members/real-names (OWNER ONLY - AUDITED)
async function getMemberRealNames(req, res, next) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    const isOwner = group.ownerId.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';

    if (!isOwner && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access restricted: Only the group owner can view member real names for safety accountability.',
      });
    }

    const members = await GroupMember.find({
      groupId: group._id,
      status: 'approved',
    });

    const userIds = members.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id realName phone email');
    const profiles = await PublicProfile.find({ userId: { $in: userIds } });

    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    // Log the access to RealNameAccessLog
    for (const u of users) {
      if (u._id.toString() !== req.user._id.toString()) {
        await logRealNameAccess({
          viewerId: req.user._id,
          viewerRole: isOwner ? 'group_owner' : req.user.role,
          targetUserId: u._id,
          reason: `Group owner safety roster verification for group: ${group.name}`,
          contextId: group._id,
          contextType: 'group_members',
        });
      }
    }

    const result = users.map((u) => ({
      userId: u._id,
      realName: u.realName,
      phone: u.phone,
      email: u.email,
      username: profileMap[u._id.toString()]?.username || 'unknown',
    }));

    return res.json({
      success: true,
      message: 'Member real names retrieved and access logged for audit accountability.',
      roster: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  getPendingMembers,
  reviewPendingMember,
  getMemberRealNames,
};
