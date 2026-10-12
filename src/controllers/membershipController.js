const Plan = require('../models/Plan');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');

// GET /api/membership/plans
async function getPlans(req, res, next) {
  try {
    let plans = await Plan.find({ isActive: true });
    if (plans.length === 0) {
      // Seed standard plans if not yet populated
      plans = await Plan.create([
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
            'Community feed discussion and comments',
            'Safety & identity protection',
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
            'Priority event RSVPs & early access',
            'Exclusive Verified Member badge',
            'Direct messaging without mutual event gating',
            'Access to curated mentorship circles',
            'Ad-free experience',
          ],
        },
      ]);
    }

    return res.json({
      success: true,
      plans,
      myStatus: req.user?.membershipStatus || 'free',
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/membership/subscribe
async function subscribe(req, res, next) {
  try {
    const { tier, paymentId } = req.body;

    if (tier !== 'circle_plus') {
      return res.status(400).json({ success: false, message: 'Invalid subscription tier.' });
    }

    // Update user status
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { membershipStatus: 'circle_plus', verificationStatus: 'verified' },
      { new: true }
    );

    await PublicProfile.findOneAndUpdate(
      { userId: req.user._id },
      { verifiedBadge: true }
    );

    return res.json({
      success: true,
      message: 'Welcome to Circle Plus! Your membership and verified badge are active.',
      membershipStatus: user.membershipStatus,
      paymentId: paymentId || `razorpay_${Date.now()}`,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/membership/webhook
async function webhook(req, res, next) {
  try {
    const { event, payload } = req.body;
    console.log('[Membership Webhook] Received payment event:', event);

    if (event === 'payment.captured' && payload?.userId) {
      await User.findByIdAndUpdate(payload.userId, {
        membershipStatus: 'circle_plus',
        verificationStatus: 'verified',
      });
      await PublicProfile.findOneAndUpdate(
        { userId: payload.userId },
        { verifiedBadge: true }
      );
    }

    return res.json({ success: true, received: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlans,
  subscribe,
  webhook,
};
