const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const postSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    flair: {
      type: String,
      enum: ['Discussion', 'Question', 'Event Recap', 'Recommendation'],
      default: 'Discussion',
    },
    mediaUrl: {
      type: String,
      default: '',
    },
    poll: {
      question: { type: String, default: '' },
      options: [pollOptionSchema],
    },
    reactions: {
      heart: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      cheer: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Critical performance indexes
postSchema.index({ groupId: 1, createdAt: -1 }); // main feed query
postSchema.index({ groupId: 1, isPinned: -1, createdAt: -1 }); // pinned-first feed
postSchema.index({ groupId: 1, flair: 1, createdAt: -1 }); // flair filter
postSchema.index({ authorId: 1 });

module.exports = mongoose.model('Post', postSchema);
