const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
    },
    mode: {
      type: String,
      enum: ['in-person', 'virtual', 'hybrid'],
      default: 'in-person',
    },
    location: {
      type: String,
      default: 'Cubbon Park, Bengaluru',
    },
    capacity: {
      type: Number,
      required: true,
      default: 15,
      min: 1,
    },
    goingCount: {
      type: Number,
      default: 0,
    },
    waitlistCount: {
      type: Number,
      default: 0,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceRule: {
      type: String,
      default: '',
    },
    qrCode: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

eventSchema.index({ groupId: 1, startsAt: 1 });
eventSchema.index({ startsAt: 1 });
eventSchema.index({ hostId: 1 });

module.exports = mongoose.model('Event', eventSchema);
