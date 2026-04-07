const express = require('express');
const router = express.Router();
const db = require('../config/db');

// =====================================
// CREATE USER PROFILE
// =====================================
router.post('/create', async (req, res) => {
    try {
        const {
            email,
            date_of_birth,
            national_id,
            phone,
            alternative_phone,
            city,
            street,
            house_number
        } = req.body;

        if (!email || !date_of_birth || !national_id || !phone) {
            return res.status(400).json({
                message: "Email, date_of_birth, national_id and phone are required"
            });
        }

        const [user] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const user_id = user[0].user_id;

        await db.query(`
            INSERT INTO user_profiles
            (user_id, date_of_birth, national_id, phone, alternative_phone, city, street, house_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            user_id,
            date_of_birth,
            national_id,
            phone,
            alternative_phone || null,
            city || null,
            street || null,
            house_number || null
        ]);

        res.status(201).json({
            message: "Profile created successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});


// =====================================
// GET USER PROFILE BY EMAIL
// =====================================
router.get('/get', async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const [profile] = await db.query(`
            SELECT 
                u.user_id,
                u.username,
                u.email,
                u.role,
                up.profile_id,
                up.date_of_birth,
                up.national_id,
                up.phone,
                up.alternative_phone,
                up.city,
                up.street,
                up.house_number
            FROM users u
            INNER JOIN user_profiles up ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        if (profile.length === 0) {
            return res.status(404).json({
                message: "Profile not found"
            });
        }

        res.status(200).json({
            message: "Profile retrieved successfully",
            profile: profile[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});


// =====================================
// UPDATE USER PROFILE
// =====================================
router.put('/update', async (req, res) => {
    try {
        const {
            email,
            date_of_birth,
            national_id,
            phone,
            alternative_phone,
            city,
            street,
            house_number
        } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email required"
            });
        }

        const [user] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const user_id = user[0].user_id;

        await db.query(`
            UPDATE user_profiles
            SET
                date_of_birth = ?,
                national_id = ?,
                phone = ?,
                alternative_phone = ?,
                city = ?,
                street = ?,
                house_number = ?
            WHERE user_id = ?
        `, [
            date_of_birth,
            national_id,
            phone,
            alternative_phone,
            city,
            street,
            house_number,
            user_id
        ]);

        res.status(200).json({
            message: "Profile updated successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});


// =====================================
// GET ALL USER FULL DETAILS (FIXED COLLATERAL LOGIC)
// =====================================
router.get('/all-details', async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT 
                u.user_id,
                u.username,
                u.email,
                u.role,
                u.is_active,
                up.profile_id,
                up.date_of_birth,
                up.national_id,
                up.phone,
                up.alternative_phone,
                up.city,
                up.street,
                up.house_number
            FROM users u
            LEFT JOIN user_profiles up ON u.user_id = up.user_id
            ORDER BY u.user_id DESC
        `);

        const results = [];

        for (const user of users) {
            const profile_id = user.profile_id;

            const userData = {
                user,
                employment: null,
                next_of_kin: null,
                id_images: [],
                collateral: [], // Collateral now sits directly at user level
                loans: []
            };

            if (profile_id) {
                // Employment
                const [employment] = await db.query(
                    "SELECT * FROM employment_details WHERE profile_id = ?",
                    [profile_id]
                );
                userData.employment = employment[0] || null;

                // Next of kin
                const [kin] = await db.query(
                    "SELECT * FROM next_of_kin WHERE profile_id = ?",
                    [profile_id]
                );
                userData.next_of_kin = kin[0] || null;

                // ID images
                const [idImages] = await db.query(
                    "SELECT * FROM id_images WHERE profile_id = ?",
                    [profile_id]
                );
                userData.id_images = idImages;

                // --- FIXED COLLATERAL SECTION ---
                // Query collateral using profile_id since loan_id was removed
                const [collateral] = await db.query(
                    "SELECT * FROM collateral WHERE profile_id = ?",
                    [profile_id]
                );

                for (const item of collateral) {
                    // Fetch images for each collateral item
                    const [images] = await db.query(
                        "SELECT * FROM collateral_images WHERE collateral_id = ?",
                        [item.collateral_id]
                    );
                    item.images = images;
                }
                userData.collateral = collateral;

                // --- LOANS SECTION ---
                const [loans] = await db.query(
                    "SELECT * FROM loans WHERE profile_id = ?",
                    [profile_id]
                );
                userData.loans = loans;
            }

            results.push(userData);
        }

        res.status(200).json({
            message: "All details retrieved successfully",
            total_users: results.length,
            data: results
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