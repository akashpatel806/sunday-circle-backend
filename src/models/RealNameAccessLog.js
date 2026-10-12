const mongoose = require('mongoose');

const realNameAccessLogSchema = new mongoose.Schema(
  {
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    viewerRole: {
      type: String,
      enum: ['group_owner', 'event_host', 'moderator', 'admin'],
      required: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    contextId: {
      type: String,
      required: true,
    },
    contextType: {
      type: String,
      enum: ['group_members', 'event_attendees', 'report_review'],
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RealNameAccessLog', realNameAccessLogSchema);
