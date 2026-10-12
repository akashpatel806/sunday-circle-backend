const Group = require('../models/Group');
const Event = require('../models/Event');
const PublicProfile = require('../models/PublicProfile');

// GET /api/discovery/feed
async function getDiscoveryFeed(req, res, next) {
  try {
    const blockedList = req.user?.blockedUsers || [];

    // Trending Groups
    const trendingGroups = await Group.find({
      ownerId: { $nin: blockedList },
    })
      .sort({ membersCount: -1, createdAt: -1 })
      .limit(6);

    // Upcoming Events
    const upcomingEvents = await Event.find({
      startsAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
      .sort({ startsAt: 1 })
      .limit(6);

    const hostIds = upcomingEvents.map((e) => e.hostId);
    const hostProfiles = await PublicProfile.find({ userId: { $in: hostIds } });
    const hostMap = {};
    hostProfiles.forEach((h) => {
      hostMap[h.userId.toString()] = h;
    });

    const populatedEvents = upcomingEvents.map((e) => ({
      ...e.toObject(),
      host: hostMap[e.hostId.toString()] || null,
    }));

    // Curated Categories
    const categories = [
      { name: 'Hiking & Outdoors', tag: 'hiking', icon: 'forest' },
      { name: 'Book Clubs & Literature', tag: 'books', icon: 'menu_book' },
      { name: 'Career & Tech Circles', tag: 'tech', icon: 'work' },
      { name: 'Fitness & Running', tag: 'fitness', icon: 'directions_run' },
      { name: 'Wellness & Mindfulness', tag: 'wellness', icon: 'spa' },
      { name: 'Art, Craft & Design', tag: 'art', icon: 'palette' },
      { name: 'Food & Coffee Walks', tag: 'food', icon: 'restaurant' },
    ];

    return res.json({
      success: true,
      trendingGroups,
      upcomingEvents: populatedEvents,
      categories,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/discovery/search
async function searchDiscovery(req, res, next) {
  try {
    const { q, category, mode, radius } = req.query;

    const groupQuery = {};
    const eventQuery = { startsAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } };

    if (q) {
      groupQuery.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
        { location: { $regex: q, $options: 'i' } },
      ];
      eventQuery.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { location: { $regex: q, $options: 'i' } },
      ];
    }

    if (category) {
      groupQuery.tags = { $in: [new RegExp(category, 'i')] };
    }

    if (mode) {
      eventQuery.mode = mode;
    }

    const groups = await Group.find(groupQuery).sort({ membersCount: -1 }).limit(20);
    const events = await Event.find(eventQuery).sort({ startsAt: 1 }).limit(20);

    const hostIds = events.map((e) => e.hostId);
    const hostProfiles = await PublicProfile.find({ userId: { $in: hostIds } });
    const hostMap = {};
    hostProfiles.forEach((h) => {
      hostMap[h.userId.toString()] = h;
    });

    const populatedEvents = events.map((e) => ({
      ...e.toObject(),
      host: hostMap[e.hostId.toString()] || null,
    }));

    return res.json({
      success: true,
      groups,
      events: populatedEvents,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDiscoveryFeed,
  searchDiscovery,
};
