const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    location: {
      type: String,
      default: 'Bengaluru, India',
    },
    coordinates: {
      lat: { type: Number, default: 12.9716 },
      lng: { type: Number, default: 77.5946 },
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'invite-only'],
      default: 'public',
    },
    womenOnly: {
      type: Boolean,
      default: true,
    },
    coverUrl: {
      type: String,
      default: '',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    membersCount: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

// Performance indexes
groupSchema.index({ ownerId: 1 });
groupSchema.index({ visibility: 1, womenOnly: 1 });
groupSchema.index({ tags: 1 });
groupSchema.index({ createdAt: -1 });
groupSchema.index({ membersCount: -1 });

module.exports = mongoose.model('Group', groupSchema);
