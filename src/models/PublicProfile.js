const mongoose = require('mongoose');

const publicProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    bio: {
      type: String,
      default: '',
      maxLength: 300,
    },
    photoUrl: {
      type: String,
      default: '',
    },
    interests: {
      type: [String],
      default: [],
    },
    karma: {
      type: Number,
      default: 10,
    },
    verifiedBadge: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PublicProfile', publicProfileSchema);
