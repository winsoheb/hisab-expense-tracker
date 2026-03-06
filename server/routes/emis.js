const express = require('express');
const router = express.Router();
const EMI = require('../models/EMI');

// Get all for user
router.get('/:userId', async (req, res) => {
    try {
        const emis = await EMI.find({ userId: req.params.userId });
        res.json(emis);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: Get all
router.get('/', async (req, res) => {
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
        res.json(emi);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        const emi = await EMI.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!emi) {
             // Fallback for docId
             const updated = await EMI.findOneAndUpdate({ docId: req.params.id }, req.body, { new: true });
             return res.json(updated);
        }
        res.json(emi);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        const emi = await EMI.findByIdAndDelete(req.params.id);
        if(!emi) {
            await EMI.findOneAndDelete({ docId: req.params.id });
        }
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
