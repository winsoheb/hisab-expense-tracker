const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet()); // Sets various HTTP headers for security
app.use(mongoSanitize()); // Prevents NoSQL injection

// Middleware
app.use(cors({
    origin: ['https://hisab.soheb.in', 'https://hisabsoheb.netlify.app', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:8080', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10kb' })); // Body parser with payload size limit

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/emis', require('./routes/emis'));
app.use('/api/admin', require('./routes/admin'));

// MongoDB Connection
console.log('Checking MongoDB URI... exists:', !!process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000 // Timeout early if can't connect
})
    .then(() => console.log('✅ MongoDB connected successfully to Atlas!'))
    .catch(err => {
        console.error('❌ MongoDB connection error on startup:');
        console.error(err.message);
    });

// Basic Route
app.get('/', (req, res) => {
    res.send('Hisab Expense Tracker API is running');
});

// Health check endpoint for debugging connectivity
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
