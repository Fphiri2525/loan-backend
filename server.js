// ==========================
// server.js
// ==========================
require('dotenv').config();

const express = require('express');
const cors = require('cors');

// ==========================
// Connect Database
// ==========================
const db = require('./config/db');

const app = express();

// ==========================
// Middlewares
// ==========================
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // ✅ PATCH added — fixes "Failed to fetch" on loan status update
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================
// Serve Uploaded Files
// ==========================
app.use('/uploads', express.static('uploads'));

// ==========================
// Register Email Test Route
// ==========================
const testRoute = require('./routes/test');
app.use('/api', testRoute);

// ==========================
// ✅ Register Admin Notification Route
// ==========================
const emailNotificationRoute = require('./routes/emailNotification');
app.use('/api/email', emailNotificationRoute);

// ==========================
// Test Endpoint
// ==========================
app.get('/api/test', (req, res) => {
    res.json({
        message: "Server is running",
        timestamp: new Date().toISOString(),
        status: "OK",
        routes: {
            users: "/api/users",
            loans: "/api/loans",
            profile: "/api/profile",
            employment: "/api/employment",
            nextOfKin: "/api/next-of-kin",
            idImages: "/api/id-images",
            collateral: "/api/collateral",
            collateralImages: "/api/collateral-images",
            loanPayments: "/api/loan-payments",
            emailTest: "/api/test-email",
            adminNotification: "/api/email/admin-notification"
        }
    });
});

// ==========================
// Register Main Routes
// ==========================

// User System
app.use('/api/users', require('./routes/user'));

// Profile System
app.use('/api/profile', require('./routes/user_profile'));

// Employment System
app.use('/api/employment', require('./routes/EmploymentDEtails'));

// Next of Kin System
app.use('/api/next-of-kin', require('./routes/next_of_kin'));

// ID Image System
app.use('/api/id-images', require('./routes/image'));

// Loans System
app.use('/api/loans', require('./routes/loan'));

// Collateral System
app.use('/api/collateral', require('./routes/collateral'));

// Collateral Image System
app.use('/api/collateral-images', require('./routes/collateralimage'));

// Loan Payments System
app.use('/api/loan-payments', require('./routes/loan_payment'));

// ==========================
// Default Route
// ==========================
app.get('/', (req, res) => {
    res.json({
        message: 'Loan Management Backend is Running...',
        endpoints: {
            test: '/api/test',
            emailTest: '/api/test-email',
            adminNotification: '/api/email/admin-notification',
            users: '/api/users',
            loans: '/api/loans',
            profile: '/api/profile',
            loanPayments: '/api/loan-payments'
        }
    });
});

// ==========================
// 404 Handler
// ==========================
app.use((req, res) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.originalUrl
    });
});

// ==========================
// Global Error Handler
// ==========================
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development'
            ? err.message
            : 'Internal server error'
    });
});

// ==========================
// Start Server
// ==========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Test endpoint:      http://localhost:${PORT}/api/test`);
    console.log(`📩 Email test route:   http://localhost:${PORT}/api/test-email`);
    console.log(`📧 Admin notification: http://localhost:${PORT}/api/email/admin-notification`);
    console.log(`🧪 Test admin email:   http://localhost:${PORT}/api/email/test-admin-notification`);
    console.log(`🔑 Login endpoint:     http://localhost:${PORT}/api/users/login`);
    console.log(`📊 Loans endpoint:     http://localhost:${PORT}/api/loans`);
    console.log(`💳 Loan Payments:      http://localhost:${PORT}/api/loan-payments`);
});