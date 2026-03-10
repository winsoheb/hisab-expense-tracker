const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EMI = require('../models/EMI');
const { logActivity } = require('../utils/logger');

// Middleware to check if user owns the EMI or is admin
const canAccessUser = (req, res, next) => {
    const requesterId = req.headers['x-user-id'];
    const requesterRole = req.headers['x-user-role'];
    const targetUserId = req.params.userId;

    if (!requesterId) return res.status(401).json({ message: "User ID required" });

    if (requesterRole === 'admin' || requesterId === targetUserId) {
        next();
    } else {
        res.status(403).json({ message: "Access denied. You can only access your own data." });
    }
};

// Get all for user
router.get('/:userId', canAccessUser, async (req, res) => {
    try {
        const emis = await EMI.find({ userId: req.params.userId });
        res.json(emis);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: Get all
router.get('/', async (req, res) => {
    const requesterRole = req.headers['x-user-role'];
    if (requesterRole !== 'admin') return res.status(403).json({ message: "Admin access required" });
    try {
        const emis = await EMI.find();
        res.json(emis);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add
router.post('/', async (req, res) => {
    try {
        const emi = new EMI(req.body);
        await emi.save();
        await logActivity(emi.userId, `Added EMI: ${emi.name}`, req);
        res.json(emi);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        let emi = null;
        if (isValidObjectId) {
            emi = await EMI.findByIdAndUpdate(req.params.id, req.body, { new: true });
        }
        
        if (!emi) {
             emi = await EMI.findOneAndUpdate({ docId: req.params.id }, req.body, { new: true });
        }

        if (emi) {
            await logActivity(emi.userId, `Updated EMI: ${emi.name}`, req);
        }
        res.json(emi);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        let emi = null;
        if (isValidObjectId) {
            emi = await EMI.findByIdAndDelete(req.params.id);
        }
        
        if(!emi) {
            emi = await EMI.findOneAndDelete({ docId: req.params.id });
        }

        if (emi) {
            await logActivity(emi.userId, `Deleted EMI: ${emi.name}`, req);
        }
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
