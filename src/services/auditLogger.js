const RealNameAccessLog = require('../models/RealNameAccessLog');

async function logRealNameAccess({ viewerId, viewerRole, targetUserId, reason, contextId, contextType, expiresAt }) {
  try {
    return await RealNameAccessLog.create({
      viewerId,
      viewerRole,
      targetUserId,
      reason,
      contextId: String(contextId),
      contextType,
      expiresAt: expiresAt || null,
      viewedAt: new Date(),
    });
  } catch (err) {
    console.error('[AuditLogger] Failed to write access log:', err);
    // Don't crash caller if logging fails, but log error prominently
  }
}

module.exports = { logRealNameAccess };
