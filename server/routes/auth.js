const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { logActivity } = require('../utils/logger');

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, adminKey } = req.body;
        console.log(`Registration attempt for: ${email}`);
        
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: "User already exists" });

        let role = 'user';
        // Simple Admin Key check
        if (adminKey === 'ADMIN123') {
            role = 'admin';
        } else if (adminKey) {
            return res.status(400).json({ message: "Invalid Admin Key" });
        }

        const user = new User({ name, email, password, role });
        await user.save();
        
        await logActivity(user._id, 'User Registered', req);
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

        if (user.status === 'blocked') {
            return res.status(403).json({ message: "Your account has been disabled by administrator." });
        }

        // Update last login
        user.lastLogin = Date.now();
        await user.save();

        console.log(`Login successful for: ${email}`);
        await logActivity(user._id, 'User Login', req);
        res.json(user);
    } catch (err) {
        console.error(`Login error: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
});

// Logout (mostly for logging)
router.post('/logout', async (req, res) => {
    try {
        const { userId } = req.body;
        if (userId) {
            await logActivity(userId, 'User Logout', req);
        }
        res.json({ message: "Logged out" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get all users (admin)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().sort({ lastLogin: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update user status/role (admin)
router.patch('/users/:id', async (req, res) => {
    try {
        const { role, status, password } = req.body;
        const updateData = {};
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (password) updateData.password = password; // Simple password reset

        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(user);
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
