const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: "User already exists" });
        const user = new User({ name, email, password });
        await user.save();
        res.status(210).json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`Login attempt for: ${email}`);
        const user = await User.findOne({ email, password });
        if (!user) {
            console.log(`Invalid login for: ${email}`);
            return res.status(400).json({ message: "Invalid credentials" });
        }
        console.log(`Login successful for: ${email}`);
        res.json(user);
    } catch (err) {
        console.error(`Login error: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
});

// Get all users (admin)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete user (admin)
router.delete('/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
