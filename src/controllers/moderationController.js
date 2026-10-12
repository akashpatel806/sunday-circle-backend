const Report = require('../models/Report');
const RealNameAccessLog = require('../models/RealNameAccessLog');
const User = require('../models/User');
const PublicProfile = require('../models/PublicProfile');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');
const { logRealNameAccess } = require('../services/auditLogger');

// POST /api/reports (Any logged-in user can report)
async function createReport(req, res, next) {
  try {
    const { targetUserId, contentType, contentId, reason, details } = req.body;

    if (!targetUserId || !contentType || !contentId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'targetUserId, contentType, contentId, and reason are required.',
      });
    }

    const report = await Report.create({
      reporterId: req.user._id,
      targetUserId,
      contentType,
      contentId,
      reason,
      details: details || '',
      status: 'open',
    });

    return res.status(201).json({
      success: true,
      message: 'Report submitted to the safety and moderation team.',
      reportId: report._id,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/moderation/reports (Moderator/Admin only)
async function getReports(req, res, next) {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const reports = await Report.find(query).sort({ createdAt: -1 });

    const userIds = [
      ...reports.map((r) => r.reporterId),
      ...reports.map((r) => r.targetUserId),
    ];
    const profiles = await PublicProfile.find({ userId: { $in: userIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = reports.map((r) => ({
      ...r.toObject(),
      reporter: profileMap[r.reporterId.toString()] || null,
      targetUser: profileMap[r.targetUserId.toString()] || null,
    }));

    return res.json({
      success: true,
      reports: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/moderation/reports/:id/inspect-real-names (Audited temporary real-name access)
async function inspectReportRealNames(req, res, next) {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    // Set report to 'under_review'
    if (report.status === 'open') {
      report.status = 'under_review';
      await report.save();
    }

    const reporter = await User.findById(report.reporterId).select('realName phone email');
    const target = await User.findById(report.targetUserId).select('realName phone email');

    // 24-hour expiration for temporary access
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Audit Log for Reporter
    if (reporter) {
      await logRealNameAccess({
        viewerId: req.user._id,
        viewerRole: req.user.role === 'admin' ? 'admin' : 'moderator',
        targetUserId: reporter._id,
        reason: `Moderator investigation of Report #${report._id} (Reporter party)`,
        contextId: report._id,
        contextType: 'report_review',
        expiresAt,
      });
    }

    // Audit Log for Target
    if (target) {
      await logRealNameAccess({
        viewerId: req.user._id,
        viewerRole: req.user.role === 'admin' ? 'admin' : 'moderator',
        targetUserId: target._id,
        reason: `Moderator investigation of Report #${report._id} (Target party: ${report.reason})`,
        contextId: report._id,
        contextType: 'report_review',
        expiresAt,
      });
    }

    const reporterProfile = await PublicProfile.findOne({ userId: report.reporterId });
    const targetProfile = await PublicProfile.findOne({ userId: report.targetUserId });

    return res.json({
      success: true,
      message: 'Temporary real-name access granted and logged in the immutable audit trail.',
      reportId: report._id,
      expiresAt,
      parties: {
        reporter: {
          userId: report.reporterId,
          username: reporterProfile?.username || 'unknown',
          realName: reporter?.realName || 'Unknown',
          phone: reporter?.phone || 'Unknown',
          email: reporter?.email || 'Unknown',
        },
        target: {
          userId: report.targetUserId,
          username: targetProfile?.username || 'unknown',
          realName: target?.realName || 'Unknown',
          phone: target?.phone || 'Unknown',
          email: target?.email || 'Unknown',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/moderation/reports/:id/resolve (Take action)
async function resolveReport(req, res, next) {
  try {
    const { action, resolutionNotes } = req.body; // 'dismiss', 'warn', 'delete_content', 'ban_user'
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    report.status = action === 'dismiss' ? 'dismissed' : 'resolved';
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    report.actionTaken = `${action}: ${resolutionNotes || 'Action applied by safety team'}`;
    await report.save();

    if (action === 'warn') {
      // Deduct karma
      await User.findByIdAndUpdate(report.targetUserId, { $inc: { karma: -5 } });
      await PublicProfile.findOneAndUpdate({ userId: report.targetUserId }, { $inc: { karma: -5 } });
    } else if (action === 'delete_content') {
      if (report.contentType === 'post') {
        await Comment.deleteMany({ postId: report.contentId });
        await Post.findByIdAndDelete(report.contentId);
      } else if (report.contentType === 'comment') {
        await Comment.findByIdAndDelete(report.contentId);
      } else if (report.contentType === 'group') {
        await Group.findByIdAndDelete(report.contentId);
      }
    } else if (action === 'ban_user') {
      // Remove public profile and reset user credentials
      await User.findByIdAndUpdate(report.targetUserId, {
        karma: -100,
        verificationStatus: 'rejected',
      });
    }

    return res.json({
      success: true,
      message: `Report resolved with action: ${action}`,
      report,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/moderation/access-logs (View audit trail)
async function getAccessLogs(req, res, next) {
  try {
    const logs = await RealNameAccessLog.find().sort({ viewedAt: -1 }).limit(50);

    const viewerIds = logs.map((l) => l.viewerId);
    const targetIds = logs.map((l) => l.targetUserId);
    const allIds = [...new Set([...viewerIds, ...targetIds])];

    const profiles = await PublicProfile.find({ userId: { $in: allIds } });
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const result = logs.map((l) => ({
      ...l.toObject(),
      viewerUsername: profileMap[l.viewerId.toString()]?.username || 'unknown',
      targetUsername: profileMap[l.targetUserId.toString()]?.username || 'unknown',
    }));

    return res.json({
      success: true,
      logs: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReport,
  getReports,
  inspectReportRealNames,
  resolveReport,
  getAccessLogs,
};
