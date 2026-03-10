const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

// Get all for user
router.get('/:userId', async (req, res) => {
    try {
        const txs = await Transaction.find({ userId: req.params.userId });
        res.json(txs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: Get all
router.get('/', async (req, res) => {
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
            // Check if it's a docId (legacy/fallback)
            await Transaction.findOneAndDelete({ docId: req.params.id });
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
        res.json(tx);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
