const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');

async function logActivity(userId, action, req, details = '') {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user = await User.findById(userId);
        await new ActivityLog({
            userId,
            userName: user ? user.name : 'Unknown User',
            action,
            ipAddress: ip,
            details
        }).save();
    } catch (err) {
        console.error("Logging failed:", err);
    }
}

module.exports = { logActivity };
