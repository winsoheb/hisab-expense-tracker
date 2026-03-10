const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Middleware to check if user is admin
// Note: In a production app, this should verify a JWT token
const isAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.query.adminId;
    if (!adminId) return res.status(401).json({ message: "Admin ID required" });

    try {
        const user = await User.findById(adminId);
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: "Access denied. Admin only." });
        }
    } catch (err) {
        res.status(500).json({ message: "Authorization error" });
    }
};

// Apply to all routes in this file
router.use(isAdmin);

// Get all activity logs
router.get('/activity', async (req, res) => {
    try {
        const logs = await ActivityLog.find().sort({ timestamp: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get global stats
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalTx = await Transaction.countDocuments();
        
        const now = new Date();
        const startOfDay = new Date(now.setHours(0,0,0,0));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const todayTx = await Transaction.countDocuments({ createdAt: { $gte: startOfDay.toISOString() } });
        const monthTx = await Transaction.countDocuments({ createdAt: { $gte: startOfMonth.toISOString() } });

        const totals = await Transaction.aggregate([
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        res.json({
            totalUsers,
            totalTransactions: totalTx,
            todayTransactions: todayTx,
            monthlyTransactions: monthTx,
            totalVolume: totals.length > 0 ? totals[0].total : 0
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
