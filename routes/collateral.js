const express = require('express');
const router = express.Router();
const db = require('../config/db');

// =====================================
// ADD COLLATERAL
// =====================================
router.post('/add', async (req, res) => {
    try {
        const {
            email,
            collateral_type,
            description
        } = req.body;

        // Log the incoming request for debugging
        console.log('Add collateral request:', { email, collateral_type, description });

        if (!email || !collateral_type) {
            return res.status(400).json({
                success: false,
                message: "Email and collateral_type are required"
            });
        }

        // Get profile_id from email - FIXED: Properly handle the query result
        const [rows] = await db.query(`
            SELECT up.profile_id
            FROM user_profiles up
            JOIN users u ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        console.log('Profile query result:', rows);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Profile not found for email: ${email}`
            });
        }

        const profile_id = rows[0].profile_id;

        // Insert collateral
        const [insertResult] = await db.query(`
            INSERT INTO collateral (profile_id, collateral_type, description)
            VALUES (?, ?, ?)
        `, [
            profile_id,
            collateral_type,
            description || null
        ]);

        console.log('Collateral inserted with ID:', insertResult.insertId);

        res.status(201).json({
            success: true,
            message: "Collateral added successfully",
            data: {
                collateral_id: insertResult.insertId,
                profile_id: profile_id,
                collateral_type: collateral_type,
                description: description || null
            }
        });

    } catch (error) {
        console.error('Error in add collateral:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// =====================================
// GET COLLATERAL BY EMAIL
// =====================================
router.get('/get', async (req, res) => {
    try {
        const { email } = req.query;

        console.log('Get collateral request for email:', email);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const [rows] = await db.query(`
            SELECT 
                c.collateral_id,
                c.profile_id,
                c.collateral_type,
                c.description,
                c.created_at,
                c.updated_at,
                u.username,
                u.email
            FROM collateral c
            JOIN user_profiles up ON up.profile_id = c.profile_id
            JOIN users u ON u.user_id = up.user_id
            WHERE u.email = ?
            ORDER BY c.created_at DESC
        `, [email]);

        console.log('Collateral query result count:', rows.length);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No collateral found for this email"
            });
        }

        res.status(200).json({
            success: true,
            message: "Collateral retrieved successfully",
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error('Error in get collateral:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// =====================================
// GET COLLATERAL BY PROFILE ID
// =====================================
router.get('/get-by-profile/:profile_id', async (req, res) => {
    try {
        const { profile_id } = req.params;

        if (!profile_id) {
            return res.status(400).json({
                success: false,
                message: "Profile ID is required"
            });
        }

        const [rows] = await db.query(`
            SELECT 
                collateral_id,
                profile_id,
                collateral_type,
                description,
                created_at,
                updated_at
            FROM collateral
            WHERE profile_id = ?
            ORDER BY created_at DESC
        `, [profile_id]);

        res.status(200).json({
            success: true,
            message: "Collateral retrieved successfully",
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error('Error in get collateral by profile:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// =====================================
// UPDATE COLLATERAL
// =====================================
router.put('/update/:collateral_id', async (req, res) => {
    try {
        const { collateral_id } = req.params;
        const {
            collateral_type,
            description
        } = req.body;

        console.log('Update collateral request:', { collateral_id, collateral_type, description });

        if (!collateral_id) {
            return res.status(400).json({
                success: false,
                message: "collateral_id is required"
            });
        }

        // First check if collateral exists
        const [existingCollateral] = await db.query(`
            SELECT collateral_id FROM collateral WHERE collateral_id = ?
        `, [collateral_id]);

        if (existingCollateral.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Collateral with ID ${collateral_id} not found`
            });
        }

        const fields = [];
        const values = [];

        if (collateral_type) {
            fields.push("collateral_type = ?");
            values.push(collateral_type);
        }

        if (description !== undefined) {
            fields.push("description = ?");
            values.push(description || null);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields provided to update"
            });
        }

        values.push(collateral_id);

        const [updateResult] = await db.query(`
            UPDATE collateral
            SET ${fields.join(', ')}
            WHERE collateral_id = ?
        `, values);

        console.log('Collateral updated:', updateResult);

        res.status(200).json({
            success: true,
            message: "Collateral updated successfully"
        });

    } catch (error) {
        console.error('Error in update collateral:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// =====================================
// DELETE COLLATERAL
// =====================================
router.delete('/delete/:collateral_id', async (req, res) => {
    try {
        const { collateral_id } = req.params;

        if (!collateral_id) {
            return res.status(400).json({
                success: false,
                message: "collateral_id is required"
            });
        }

        // First check if collateral exists
        const [existingCollateral] = await db.query(`
            SELECT collateral_id FROM collateral WHERE collateral_id = ?
        `, [collateral_id]);

        if (existingCollateral.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Collateral with ID ${collateral_id} not found`
            });
        }

        const [deleteResult] = await db.query(`
            DELETE FROM collateral WHERE collateral_id = ?
        `, [collateral_id]);

        console.log('Collateral deleted:', deleteResult);

        res.status(200).json({
            success: true,
            message: "Collateral deleted successfully"
        });

    } catch (error) {
        console.error('Error in delete collateral:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

module.exports = router;