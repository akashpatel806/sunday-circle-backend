const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const Event = require('../models/Event');
const EventRsvp = require('../models/EventRsvp');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Plan = require('../models/Plan');

async function seedDatabaseIfEmpty() {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('[Seed] Database already contains records. Skipping seed.');
      return;
    }

    console.log('[Seed] Database is empty. Seeding realistic starter records...');

    const salt = await bcrypt.genSalt(10);
    const modPassword = await bcrypt.hash('mod123456', salt);
    const userPassword = await bcrypt.hash('user123456', salt);

    // 1. Moderator Account
    const modUser = await User.create({
      realName: 'Clara Sharma',
      email: 'moderator@sundaycircle.com',
      phone: '+91 98765 43210',
      passwordHash: modPassword,
      role: 'moderator',
      membershipStatus: 'circle_plus',
      verificationStatus: 'verified',
      karma: 150,
    });

    await PublicProfile.create({
      userId: modUser._id,
      username: 'mod_clara',
      bio: 'Safety & community guardian for Sunday Circle Bangalore.',
      photoUrl: '',
      interests: ['Community', 'Safety', 'Literature'],
      karma: 150,
      verifiedBadge: true,
    });

    // 2. Demo User 1: Ananya
    const user1 = await User.create({
      realName: 'Ananya Rao',
      email: 'ananya@sundaycircle.com',
      phone: '+91 98111 22334',
      passwordHash: userPassword,
      role: 'user',
      membershipStatus: 'circle_plus',
      verificationStatus: 'verified',
      karma: 45,
    });

    await PublicProfile.create({
      userId: user1._id,
      username: 'ananya_reads',
      bio: 'Avid fiction reader, weekend trail walker, and coffee lover.',
      photoUrl: '',
      interests: ['Books', 'Hiking', 'Coffee', 'Fiction'],
      karma: 45,
      verifiedBadge: true,
    });

    // 3. Demo User 2: Priya
    const user2 = await User.create({
      realName: 'Priya Patel',
      email: 'priya@sundaycircle.com',
      phone: '+91 99222 33445',
      passwordHash: userPassword,
      role: 'user',
      membershipStatus: 'free',
      verificationStatus: 'verified',
      karma: 28,
    });

    await PublicProfile.create({
      userId: user2._id,
      username: 'priya_trails',
      bio: 'Outdoor enthusiast, marathon runner, and UX designer in BLR.',
      photoUrl: '',
      interests: ['Hiking', 'Tech', 'Running', 'Fitness'],
      karma: 28,
      verifiedBadge: true,
    });

    // 4. Plans
    await Plan.create([
      {
        name: 'Sunday Circle Free',
        tier: 'free',
        price: 0,
        currency: 'INR',
        interval: 'lifetime',
        perks: [
          'Create up to 2 groups',
          'Join unlimited community groups',
          'Standard event RSVPs',
          'Feed discussions and threaded comments',
          'Pseudonymous identity protection',
        ],
      },
      {
        name: 'Circle Plus (Premium)',
        tier: 'circle_plus',
        price: 299,
        currency: 'INR',
        interval: 'month',
        perks: [
          'Unlimited group creation',
          'Priority event RSVPs & waitlist skip',
          'Exclusive Verified Member badge',
          'Direct messaging without mutual event gating',
          'Access to curated mentorship circles',
          'Ad-free experience',
        ],
      },
    ]);

    // 5. Groups
    const group1 = await Group.create({
      name: 'Bangalore Women Hikers',
      description: 'A welcoming circle of women discovering scenic trails, morning treks, and green getaways around Bangalore.',
      tags: ['hiking', 'outdoors', 'fitness', 'nature'],
      location: 'Bengaluru, India',
      visibility: 'public',
      womenOnly: true,
      ownerId: user2._id,
      membersCount: 2,
    });

    const group2 = await Group.create({
      name: 'Cubbon Park Weekend Book Club',
      description: 'Casual Sunday morning book exchanges and discussions under the bamboo groves at Cubbon Park.',
      tags: ['books', 'reading', 'literature', 'coffee'],
      location: 'Cubbon Park, Bengaluru',
      visibility: 'public',
      womenOnly: true,
      ownerId: user1._id,
      membersCount: 2,
    });

    const group3 = await Group.create({
      name: 'Women in Tech & Design Circles',
      description: 'Peer mentorship, portfolio reviews, and startup conversations for women shaping tech and product design.',
      tags: ['tech', 'career', 'design', 'mentorship'],
      location: 'Indiranagar, Bengaluru',
      visibility: 'private',
      womenOnly: true,
      ownerId: modUser._id,
      membersCount: 2,
    });

    // Add memberships
    await GroupMember.create([
      { groupId: group1._id, userId: user2._id, role: 'owner', status: 'approved' },
      { groupId: group1._id, userId: user1._id, role: 'member', status: 'approved' },
      { groupId: group2._id, userId: user1._id, role: 'owner', status: 'approved' },
      { groupId: group2._id, userId: user2._id, role: 'member', status: 'approved' },
      { groupId: group3._id, userId: modUser._id, role: 'owner', status: 'approved' },
      { groupId: group3._id, userId: user1._id, role: 'member', status: 'approved' },
    ]);

    // 6. Events
    const nextSunday = new Date();
    nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7 || 7));
    nextSunday.setHours(7, 30, 0, 0);

    const event1 = await Event.create({
      groupId: group1._id,
      title: 'Sunrise Walk at Turahalli Forest',
      description: 'Easy 5km trail walk followed by breakfast at a local cafe. Bring a water bottle and comfortable walking shoes!',
      startsAt: nextSunday,
      mode: 'in-person',
      location: 'Turahalli Forest Viewpoint, Bengaluru',
      capacity: 10,
      goingCount: 2,
      waitlistCount: 0,
      hostId: user2._id,
      isRecurring: true,
      recurrenceRule: 'Weekly on Sundays',
      qrCode: 'SC_EVENT_TURAHALLI_SUNRISE',
    });

    const nextSundayNoon = new Date(nextSunday);
    nextSundayNoon.setHours(11, 0, 0, 0);

    const event2 = await Event.create({
      groupId: group2._id,
      title: 'October Book Discussion: Jhumpa Lahiri Collection',
      description: 'Bring your favorite passage or thoughts on short stories and diaspora narratives. Picnic mats provided!',
      startsAt: nextSundayNoon,
      mode: 'in-person',
      location: 'Near Bandstand, Cubbon Park, Bengaluru',
      capacity: 12,
      goingCount: 2,
      waitlistCount: 0,
      hostId: user1._id,
      isRecurring: true,
      recurrenceRule: 'Monthly',
      qrCode: 'SC_EVENT_CUBBON_BOOKCLUB',
    });

    // Event RSVPs
    await EventRsvp.create([
      { eventId: event1._id, userId: user2._id, status: 'going', checkedIn: true, checkedInAt: new Date() },
      { eventId: event1._id, userId: user1._id, status: 'going' },
      { eventId: event2._id, userId: user1._id, status: 'going', checkedIn: true, checkedInAt: new Date() },
      { eventId: event2._id, userId: user2._id, status: 'going' },
    ]);

    // 7. Posts with Flair and Poll
    const post1 = await Post.create({
      groupId: group2._id,
      authorId: user1._id,
      text: 'What book helped you most during a major life transition? Would love to put together a recommended reading shelf for our next circle gathering!',
      flair: 'Question',
      reactions: {
        heart: [user2._id],
        helpful: [modUser._id],
        cheer: [],
      },
      commentsCount: 2,
    });

    const pollOption1 = crypto.randomBytes(4).toString('hex');
    const pollOption2 = crypto.randomBytes(4).toString('hex');
    const pollOption3 = crypto.randomBytes(4).toString('hex');

    const post2 = await Post.create({
      groupId: group1._id,
      authorId: user2._id,
      text: 'Poll for next weekend trail: which location should we explore?',
      flair: 'Discussion',
      poll: {
        question: 'Which trail would you prefer for next Sunday?',
        options: [
          { id: pollOption1, text: 'Nandi Hills Trail (Moderate)', votes: [user1._id] },
          { id: pollOption2, text: 'Makalidurga Trek (Adventurous)', votes: [] },
          { id: pollOption3, text: 'Avalabetta Sunrise Walk (Scenic)', votes: [user2._id] },
        ],
      },
      reactions: {
        heart: [user1._id],
        helpful: [],
        cheer: [user1._id],
      },
      commentsCount: 1,
    });

    // 8. Comments
    const comment1 = await Comment.create({
      postId: post1._id,
      groupId: group2._id,
      authorId: user2._id,
      text: '"Tiny Beautiful Things" by Cheryl Strayed. It felt like a warm cup of chai on a difficult rainy day.',
      reactions: { heart: [user1._id], helpful: [] },
    });

    await Comment.create({
      postId: post1._id,
      groupId: group2._id,
      authorId: user1._id,
      parentCommentId: comment1._id,
      text: 'Such a heartfelt recommendation, Priya! Adding that to our list right away.',
      reactions: { heart: [], helpful: [] },
    });

    await Comment.create({
      postId: post2._id,
      groupId: group1._id,
      authorId: user1._id,
      text: 'Voted for Nandi Hills! The weather should be perfect around 6:30 AM.',
      reactions: { heart: [user2._id], helpful: [] },
    });

    console.log('[Seed] Database successfully seeded with groups, events, posts, comments, and users!');
    console.log('[Seed] Accounts available:');
    console.log('       1) Moderator: moderator@sundaycircle.com / mod123456');
    console.log('       2) Ananya:    ananya@sundaycircle.com    / user123456');
    console.log('       3) Priya:     priya@sundaycircle.com     / user123456');
  } catch (err) {
    if (err.code === 11000) {
      console.log('[Seed] Starter records already populated.');
      return;
    }
    console.error('[Seed] Error seeding database:', err);
  }
}

module.exports = { seedDatabaseIfEmpty };
