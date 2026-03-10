const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { logActivity } = require('../utils/logger');

// Middleware to check if user owns the transaction or is admin
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
        const txs = await Transaction.find({ userId: req.params.userId });
        res.json(txs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: Get all (Protected in main index.js or via separate check)
router.get('/', async (req, res) => {
    const requesterRole = req.headers['x-user-role'];
    if (requesterRole !== 'admin') return res.status(403).json({ message: "Admin access required" });
    try {
        const txs = await Transaction.find();
        res.json(txs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add
router.post('/', async (req, res) => {
    try {
        const tx = new Transaction(req.body);
        await tx.save();
        await logActivity(tx.userId, `Added Transaction: ${tx.name}`, req, `Amount: ${tx.amount}`);
        res.json(tx);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        let tx = null;
        if (isValidObjectId) {
            tx = await Transaction.findByIdAndDelete(req.params.id);
        }

        if (!tx) {
            tx = await Transaction.findOneAndDelete({ docId: req.params.id });
        }

        if (tx) {
            await logActivity(tx.userId, `Deleted Transaction: ${tx.name}`, req);
        }
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        let tx = null;
        if (isValidObjectId) {
            tx = await Transaction.findByIdAndUpdate(req.params.id, req.body, { new: true });
        }

        if (!tx) {
            tx = await Transaction.findOneAndUpdate({ docId: req.params.id }, req.body, { new: true });
        }

        if (tx) {
            await logActivity(tx.userId, `Updated Transaction: ${tx.name}`, req);
        }
        res.json(tx);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
