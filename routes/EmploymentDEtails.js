const express = require('express');
const router = express.Router();
const db = require('../config/db');


// ===============================
// ADD EMPLOYMENT DETAILS API
// ===============================
router.post('/add', async (req, res) => {

    try {

        const {
            email,
            occupation,
            employer_name,
            monthly_income
        } = req.body;

        if (!email || !occupation || !monthly_income) {
            return res.status(400).json({
                message: "email, occupation and monthly_income are required"
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
            INSERT INTO employment_details
            (profile_id, occupation, employer_name, monthly_income)
            VALUES (?, ?, ?, ?)
        `, [
            profile_id,
            occupation,
            employer_name || null,
            monthly_income
        ]);

        res.status(201).json({
            message: "Employment details added successfully"
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
// GET EMPLOYMENT DETAILS BY EMAIL API
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
                ed.employment_id,
                ed.occupation,
                ed.employer_name,
                ed.monthly_income
            FROM employment_details ed
            JOIN user_profiles up ON up.profile_id = ed.profile_id
            JOIN users u ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        if (result.length === 0) {
            return res.status(404).json({
                message: "Employment details not found for this user"
            });
        }

        res.status(200).json({
            message: "Employment details retrieved successfully",
            employment: result[0]
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
// UPDATE EMPLOYMENT DETAILS BY EMAIL API
// ===============================
router.put('/update', async (req, res) => {

    try {

        const {
            email,
            occupation,
            employer_name,
            monthly_income
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

        // Check employment record exists
        const [existing] = await db.query(
            "SELECT employment_id FROM employment_details WHERE profile_id = ?",
            [profile_id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                message: "Employment details not found for this user"
            });
        }

        // Dynamically build update query
        const fields = [];
        const values = [];

        if (occupation) {
            fields.push("occupation = ?");
            values.push(occupation);
        }

        if (employer_name !== undefined) {
            fields.push("employer_name = ?");
            values.push(employer_name || null);
        }

        if (monthly_income) {
            fields.push("monthly_income = ?");
            values.push(monthly_income);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                message: "No fields provided to update"
            });
        }

        values.push(profile_id);

        await db.query(
            `UPDATE employment_details SET ${fields.join(", ")} WHERE profile_id = ?`,
            values
        );

        res.status(200).json({
            message: "Employment details updated successfully"
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