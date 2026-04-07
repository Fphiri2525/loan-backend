const express = require('express');
const router = express.Router();
const db = require('../config/db');


// ===============================
// ADD NEXT OF KIN API
// ===============================
router.post('/add', async (req, res) => {

    try {

        const {
            email,
            full_name,
            phone,
            relationship
        } = req.body;

        if (!email || !full_name || !phone || !relationship) {
            return res.status(400).json({
                message: "email, full_name, phone and relationship are required"
            });
        }

        // Find profile_id using email
        const [profile] = await db.query(`
            SELECT up.profile_id
            FROM user_profiles up
            JOIN users u ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        if (profile.length === 0) {
            return res.status(404).json({
                message: "User profile not found"
            });
        }

        const profile_id = profile[0].profile_id;

        await db.query(`
            INSERT INTO next_of_kin (profile_id, full_name, phone, relationship)
            VALUES (?, ?, ?, ?)
        `, [profile_id, full_name, phone, relationship]);

        res.status(201).json({
            message: "Next of kin added successfully"
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
// GET NEXT OF KIN BY EMAIL API
// ===============================
router.get('/get', async (req, res) => {

    try {

        const { email } = req.query;

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const [result] = await db.query(`
            SELECT
                u.email,
                u.username,
                nk.kin_id,
                nk.full_name,
                nk.phone,
                nk.relationship
            FROM next_of_kin nk
            JOIN user_profiles up ON up.profile_id = nk.profile_id
            JOIN users u ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        if (result.length === 0) {
            return res.status(404).json({
                message: "Next of kin not found for this user"
            });
        }

        res.status(200).json({
            message: "Next of kin retrieved successfully",
            next_of_kin: result[0]
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
// UPDATE NEXT OF KIN BY EMAIL API
// ===============================
router.put('/update', async (req, res) => {

    try {

        const {
            email,
            full_name,
            phone,
            relationship
        } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required to identify the user"
            });
        }

        // Find profile_id using email
        const [profile] = await db.query(`
            SELECT up.profile_id
            FROM user_profiles up
            JOIN users u ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        if (profile.length === 0) {
            return res.status(404).json({
                message: "User profile not found"
            });
        }

        const profile_id = profile[0].profile_id;

        // Check next of kin record exists
        const [existing] = await db.query(
            "SELECT kin_id FROM next_of_kin WHERE profile_id = ?",
            [profile_id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                message: "Next of kin not found for this user"
            });
        }

        // Dynamically build update query
        const fields = [];
        const values = [];

        if (full_name) {
            fields.push("full_name = ?");
            values.push(full_name);
        }

        if (phone) {
            fields.push("phone = ?");
            values.push(phone);
        }

        if (relationship) {
            fields.push("relationship = ?");
            values.push(relationship);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                message: "No fields provided to update"
            });
        }

        values.push(profile_id);

        await db.query(
            `UPDATE next_of_kin SET ${fields.join(", ")} WHERE profile_id = ?`,
            values
        );

        res.status(200).json({
            message: "Next of kin updated successfully"
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