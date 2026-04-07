const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ===============================
// CREATE USER API
// ===============================
router.post('/add', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        if (!username || !email || !password || !role) {
            return res.status(400).json({
                message: "Username, email, password and role are required"
            });
        }

        const [existing] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
            [username, email, hashedPassword, role]
        );

        res.status(201).json({
            message: "User created successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// ===============================
// LOGIN API
// ===============================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const [user] = await db.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const dbUser = user[0];

        const isMatch = await bcrypt.compare(password, dbUser.password);

        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid password"
            });
        }

        const token = jwt.sign(
            {
                user_id: dbUser.user_id,
                email: dbUser.email,
                username: dbUser.username,
                role: dbUser.role
            },
            process.env.JWT_SECRET || 'your-secret-key-here',
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: "Login successful",
            token: token,
            user: {
                user_id: dbUser.user_id,
                username: dbUser.username,
                email: dbUser.email,
                role: dbUser.role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// ===============================
// GET USER BY EMAIL API
// ===============================
router.get('/get', async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const [user] = await db.query(
            "SELECT user_id, username, email, role FROM users WHERE email = ?",
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            message: "User retrieved successfully",
            user: user[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// ===============================
// GET ALL USERS WITH ROLES API
// ===============================
router.get('/all', async (req, res) => {
    try {
        const { role } = req.query;

        const query = role
            ? "SELECT user_id, username, email, role FROM users WHERE role = ? ORDER BY user_id ASC"
            : "SELECT user_id, username, email, role FROM users ORDER BY user_id ASC";

        const [users] = await db.query(query, role ? [role] : []);

        res.status(200).json({
            message: "Users retrieved successfully",
            count: users.length,
            users: users
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// ===============================
// GET TOTAL CLIENTS API
// ===============================
router.get('/total-clients', async (req, res) => {
    try {
        const [result] = await db.query(
            "SELECT COUNT(*) as total FROM users WHERE role = 'client'"
        );

        const totalClients = result[0].total;

        res.status(200).json({
            message: "Total clients retrieved successfully",
            total: totalClients,
            role: "client"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// ===============================
// UPDATE USER BY EMAIL API
// ===============================
router.put('/update', async (req, res) => {
    try {
        const { email, username, new_email, password, role } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required to identify the user"
            });
        }

        const [existing] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        if (new_email && new_email !== email) {
            const [emailTaken] = await db.query(
                "SELECT user_id FROM users WHERE email = ?",
                [new_email]
            );

            if (emailTaken.length > 0) {
                return res.status(409).json({
                    message: "New email is already in use by another account"
                });
            }
        }

        const fields = [];
        const values = [];

        if (username) {
            fields.push("username = ?");
            values.push(username);
        }

        if (new_email) {
            fields.push("email = ?");
            values.push(new_email);
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fields.push("password = ?");
            values.push(hashedPassword);
        }

        if (role) {
            fields.push("role = ?");
            values.push(role);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                message: "No fields provided to update"
            });
        }

        values.push(email);

        await db.query(
            `UPDATE users SET ${fields.join(", ")} WHERE email = ?`,
            values
        );

        res.status(200).json({
            message: "User updated successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

module.exports = router;