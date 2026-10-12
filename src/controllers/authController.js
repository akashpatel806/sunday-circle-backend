const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const { email, password, realName, username, phone } = req.body;

    if (!email || !password || !realName || !username || !phone) {
      return res.status(400).json({
        success: false,
        message: 'All fields (email, password, realName, username, phone) are required.',
      });
    }

    const cleanUsername = username.toLowerCase().trim();
    if (cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters long.',
      });
    }

    // Check username uniqueness
    const existingUsername = await PublicProfile.findOne({ username: cleanUsername });
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: 'Username is already taken. Please choose another.',
      });
    }

    // Check email uniqueness
    const cleanEmail = email.toLowerCase().trim();
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user record
    const user = await User.create({
      realName: realName.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      passwordHash,
      role: 'user',
      membershipStatus: 'free',
      verificationStatus: 'none',
      karma: 10,
    });

    // Create public profile record
    const profile = await PublicProfile.create({
      userId: user._id,
      username: cleanUsername,
      bio: '',
      photoUrl: '',
      interests: [],
      karma: 10,
      verifiedBadge: false,
    });

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: {
        id: user._id,
        email: user.email,
        realName: user.realName,
        phone: user.phone,
        role: user.role,
        membershipStatus: user.membershipStatus,
        verificationStatus: user.verificationStatus,
        karma: user.karma,
      },
      profile: {
        userId: profile.userId,
        username: profile.username,
        bio: profile.bio,
        photoUrl: profile.photoUrl,
        interests: profile.interests,
        karma: profile.karma,
        verifiedBadge: profile.verifiedBadge,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const profile = await PublicProfile.findOne({ userId: user._id });
    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user._id,
        email: user.email,
        realName: user.realName,
        phone: user.phone,
        role: user.role,
        membershipStatus: user.membershipStatus,
        verificationStatus: user.verificationStatus,
        karma: user.karma,
        blockedUsers: user.blockedUsers || [],
        restrictedUsers: user.restrictedUsers || [],
        savedPosts: user.savedPosts || [],
      },
      profile: profile
        ? {
            userId: profile.userId,
            username: profile.username,
            bio: profile.bio,
            photoUrl: profile.photoUrl,
            interests: profile.interests,
            karma: profile.karma,
            verifiedBadge: profile.verifiedBadge,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me
async function getMe(req, res, next) {
  try {
    const user = req.user;
    const profile = await PublicProfile.findOne({ userId: user._id });

    return res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        realName: user.realName,
        phone: user.phone,
        role: user.role,
        membershipStatus: user.membershipStatus,
        verificationStatus: user.verificationStatus,
        karma: user.karma,
        blockedUsers: user.blockedUsers || [],
        restrictedUsers: user.restrictedUsers || [],
        savedPosts: user.savedPosts || [],
      },
      profile: profile
        ? {
            userId: profile.userId,
            username: profile.username,
            bio: profile.bio,
            photoUrl: profile.photoUrl,
            interests: profile.interests,
            karma: profile.karma,
            verifiedBadge: profile.verifiedBadge,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/profile
async function updateProfile(req, res, next) {
  try {
    const { bio, photoUrl, interests } = req.body;
    const updateData = {};
    if (bio !== undefined) updateData.bio = bio;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
    if (interests !== undefined) updateData.interests = interests;

    const profile = await PublicProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updateData },
      { new: true }
    );

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      profile,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verification-request
async function requestVerification(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { verificationStatus: 'pending' },
      { new: true }
    );

    return res.json({
      success: true,
      message: 'ID verification request submitted for review.',
      verificationStatus: user.verificationStatus,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/:id/public
async function getPublicProfile(req, res, next) {
  try {
    const profile = await PublicProfile.findOne({ userId: req.params.id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Public profile not found.',
      });
    }

    return res.json({
      success: true,
      profile,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/users/:id/block
async function toggleBlockUser(req, res, next) {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot block yourself.',
      });
    }

    const isBlocked = req.user.blockedUsers.some((id) => id.toString() === targetId);
    let updated;
    if (isBlocked) {
      updated = await User.findByIdAndUpdate(
        req.user._id,
        { $pull: { blockedUsers: targetId } },
        { new: true }
      );
    } else {
      updated = await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { blockedUsers: targetId } },
        { new: true }
      );
    }

    return res.json({
      success: true,
      message: isBlocked ? 'User unblocked.' : 'User blocked successfully.',
      blocked: !isBlocked,
      blockedUsers: updated.blockedUsers,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/users/:id/restrict
async function toggleRestrictUser(req, res, next) {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot restrict yourself.',
      });
    }

    const isRestricted = req.user.restrictedUsers.some((id) => id.toString() === targetId);
    let updated;
    if (isRestricted) {
      updated = await User.findByIdAndUpdate(
        req.user._id,
        { $pull: { restrictedUsers: targetId } },
        { new: true }
      );
    } else {
      updated = await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { restrictedUsers: targetId } },
        { new: true }
      );
    }

    return res.json({
      success: true,
      message: isRestricted ? 'Restriction removed.' : 'User restricted silently.',
      restricted: !isRestricted,
      restrictedUsers: updated.restrictedUsers,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  requestVerification,
  getPublicProfile,
  toggleBlockUser,
  toggleRestrictUser,
};
