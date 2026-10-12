const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { auth, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, eventController.getEvents);
router.post('/', auth, eventController.createEvent);
router.get('/:id', optionalAuth, eventController.getEventById);
router.post('/:id/rsvp', auth, eventController.rsvpEvent);
router.post('/:id/cancel-rsvp', auth, eventController.cancelRsvp);
router.get('/:id/attendees', optionalAuth, eventController.getEventAttendees);
router.get('/:id/attendees/real-names', auth, eventController.getAttendeeRealNames);
router.post('/:id/checkin', auth, eventController.checkInAttendee);

module.exports = router;
