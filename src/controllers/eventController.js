const crypto = require('crypto');
const Event = require('../models/Event');
const EventRsvp = require('../models/EventRsvp');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');
const { logRealNameAccess } = require('../services/auditLogger');

// POST /api/events
async function createEvent(req, res, next) {
  try {
    const { groupId, title, description, startsAt, endsAt, mode, location, capacity, isRecurring, recurrenceRule } = req.body;

    if (!groupId || !title || !startsAt) {
      return res.status(400).json({
        success: false,
        message: 'Group, title, and startsAt date/time are required.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    // Verify user is a member of the group
    const membership = await GroupMember.findOne({
      groupId,
      userId: req.user._id,
      status: 'approved',
    });

    if (!membership && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You must be an approved member of this group to organize an event.',
      });
    }

    const eventCapacity = parseInt(capacity) || 15;
    const qrCode = `SC_EVENT_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const event = await Event.create({
      groupId,
      title: title.trim(),
      description: description ? description.trim() : '',
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      mode: mode || 'in-person',
      location: location || 'Cubbon Park, Bengaluru',
      capacity: eventCapacity,
      goingCount: 1, // Host goes automatically
      waitlistCount: 0,
      hostId: req.user._id,
      isRecurring: Boolean(isRecurring),
      recurrenceRule: recurrenceRule || '',
      qrCode,
    });

    // Auto RSVP host
    await EventRsvp.create({
      eventId: event._id,
      userId: req.user._id,
      status: 'going',
      checkedIn: true,
      checkedInAt: new Date(),
    });

    // Award karma
    await User.findByIdAndUpdate(req.user._id, { $inc: { karma: 5 } });
    await PublicProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { karma: 5 } });

    return res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      event,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/events
async function getEvents(req, res, next) {
  try {
    const { groupId, mode, upcoming, search } = req.query;
    const query = {};

    if (groupId) query.groupId = groupId;
    if (mode) query.mode = mode;
    if (upcoming === 'true') {
      query.startsAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    const events = await Event.find(query).sort({ startsAt: 1 });

    const hostIds = events.map((e) => e.hostId);
    const hostProfiles = await PublicProfile.find({ userId: { $in: hostIds } });
    const hostMap = {};
    hostProfiles.forEach((h) => {
      hostMap[h.userId.toString()] = h;
    });

    // Get current user's RSVPs if logged in
    const userRsvps = {};
    if (req.user) {
      const rsvps = await EventRsvp.find({
        userId: req.user._id,
        eventId: { $in: events.map((e) => e._id) },
      });
      rsvps.forEach((r) => {
        userRsvps[r.eventId.toString()] = r.status;
      });
    }

    const result = events.map((e) => ({
      ...e.toObject(),
      host: hostMap[e.hostId.toString()] || null,
      myRsvpStatus: userRsvps[e._id.toString()] || null,
    }));

    return res.json({
      success: true,
      events: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id
async function getEventById(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const host = await PublicProfile.findOne({ userId: event.hostId });
    const group = await Group.findById(event.groupId).select('name visibility coverUrl');

    let myRsvp = null;
    if (req.user) {
      myRsvp = await EventRsvp.findOne({
        eventId: event._id,
        userId: req.user._id,
      });
    }

    return res.json({
      success: true,
      event: {
        ...event.toObject(),
        host,
        group,
        myRsvp: myRsvp ? { status: myRsvp.status, checkedIn: myRsvp.checkedIn } : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/events/:id/rsvp
async function rsvpEvent(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // Check existing RSVP
    let existingRsvp = await EventRsvp.findOne({
      eventId: event._id,
      userId: req.user._id,
    });

    if (existingRsvp && existingRsvp.status !== 'cancelled') {
      return res.json({
        success: true,
        message: `You are already RSVPed as: ${existingRsvp.status}`,
        status: existingRsvp.status,
      });
    }

    // Atomic evaluation of capacity
    const isFull = event.goingCount >= event.capacity;
    const newStatus = isFull ? 'waitlist' : 'going';

    if (existingRsvp) {
      existingRsvp.status = newStatus;
      await existingRsvp.save();
    } else {
      existingRsvp = await EventRsvp.create({
        eventId: event._id,
        userId: req.user._id,
        status: newStatus,
      });
    }

    if (newStatus === 'going') {
      await Event.findByIdAndUpdate(event._id, { $inc: { goingCount: 1 } });
    } else {
      await Event.findByIdAndUpdate(event._id, { $inc: { waitlistCount: 1 } });
    }

    await User.findByIdAndUpdate(req.user._id, { $inc: { karma: 1 } });
    await PublicProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { karma: 1 } });

    return res.json({
      success: true,
      message:
        newStatus === 'going'
          ? "You're confirmed for this event!"
          : 'Event is at capacity. You have been added to the waitlist.',
      status: newStatus,
      rsvp: existingRsvp,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/events/:id/cancel-rsvp
async function cancelRsvp(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const rsvp = await EventRsvp.findOne({
      eventId: event._id,
      userId: req.user._id,
    });

    if (!rsvp || rsvp.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'No active RSVP found to cancel.',
      });
    }

    const previousStatus = rsvp.status;
    rsvp.status = 'cancelled';
    await rsvp.save();

    if (previousStatus === 'going') {
      await Event.findByIdAndUpdate(event._id, { $inc: { goingCount: -1 } });

      // Automatically promote first person on the waitlist!
      const waitlistCandidate = await EventRsvp.findOne({
        eventId: event._id,
        status: 'waitlist',
      }).sort({ createdAt: 1 });

      if (waitlistCandidate) {
        waitlistCandidate.status = 'going';
        await waitlistCandidate.save();
        await Event.findByIdAndUpdate(event._id, {
          $inc: { goingCount: 1, waitlistCount: -1 },
        });
        console.log(`[RSVP] Auto-promoted user ${waitlistCandidate.userId} from waitlist to going.`);
      }
    } else if (previousStatus === 'waitlist') {
      await Event.findByIdAndUpdate(event._id, { $inc: { waitlistCount: -1 } });
    }

    return res.json({
      success: true,
      message: 'RSVP cancelled successfully.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id/attendees
async function getEventAttendees(req, res, next) {
  try {
    const rsvps = await EventRsvp.find({
      eventId: req.params.id,
      status: { $in: ['going', 'waitlist'] },
    }).sort({ createdAt: 1 });

    const userIds = rsvps.map((r) => r.userId);
    const profiles = await PublicProfile.find({ userId: { $in: userIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = rsvps.map((r) => ({
      _id: r._id,
      userId: r.userId,
      status: r.status,
      checkedIn: r.checkedIn,
      profile: profileMap[r.userId.toString()] || null,
    }));

    return res.json({
      success: true,
      attendees: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id/attendees/real-names (HOST ONLY - AUDITED)
async function getAttendeeRealNames(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const isHost = event.hostId.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';

    if (!isHost && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access restricted: Only the event host can view attendee real names for in-person accountability.',
      });
    }

    const rsvps = await EventRsvp.find({
      eventId: event._id,
      status: 'going',
    });

    const userIds = rsvps.map((r) => r.userId);
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
          viewerRole: isHost ? 'event_host' : req.user.role,
          targetUserId: u._id,
          reason: `Event host attendee check for event: ${event.title}`,
          contextId: event._id,
          contextType: 'event_attendees',
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
      message: 'Attendee real names retrieved and access logged for audit accountability.',
      roster: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/events/:id/checkin
async function checkInAttendee(req, res, next) {
  try {
    const { userId, qrCode } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // Checkin either by QR code match or host manual checkin
    const isHost = event.hostId.toString() === req.user._id.toString() || req.user.role === 'admin';
    const targetUserId = userId || req.user._id;

    if (!isHost && qrCode !== event.qrCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event QR code.',
      });
    }

    const rsvp = await EventRsvp.findOne({
      eventId: event._id,
      userId: targetUserId,
      status: 'going',
    });

    if (!rsvp) {
      return res.status(404).json({
        success: false,
        message: 'No confirmed "going" RSVP found for this attendee.',
      });
    }

    rsvp.checkedIn = true;
    rsvp.checkedInAt = new Date();
    await rsvp.save();

    // Award checkin karma (+3)
    await User.findByIdAndUpdate(targetUserId, { $inc: { karma: 3 } });
    await PublicProfile.findOneAndUpdate({ userId: targetUserId }, { $inc: { karma: 3 } });

    return res.json({
      success: true,
      message: 'Attendee checked in successfully!',
      checkedIn: true,
      checkedInAt: rsvp.checkedInAt,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  rsvpEvent,
  cancelRsvp,
  getEventAttendees,
  getAttendeeRealNames,
  checkInAttendee,
};
