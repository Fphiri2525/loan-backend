const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');


// Storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });


// Upload ID Image
router.post('/upload', upload.single('image'), async (req, res) => {

    try {

        const { email, image_type } = req.body;

        if (!email || !image_type || !req.file) {
            return res.status(400).json({
                message: "email, image_type and image are required"
            });
        }

        // 1️⃣ Find profile_id using email
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

        // 2️⃣ Insert image record
        const imagePath = req.file.filename;

        await db.query(`
            INSERT INTO id_images (profile_id, image_type, image_path)
            VALUES (?, ?, ?)
        `, [profile_id, image_type, imagePath]);

        res.status(201).json({
            message: "ID image uploaded successfully",
            image: imagePath
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