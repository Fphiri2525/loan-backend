const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Memory storage — no local disk saving
const storage = multer.memoryStorage();
const upload = multer({ storage });

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

        console.log("📤 Uploading ID image to Cloudinary...");

        // 2️⃣ Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "id_images" },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        console.log("✅ Cloudinary upload success:", uploadResult.secure_url);

        // 3️⃣ Insert image record with Cloudinary URL
        await db.query(`
            INSERT INTO id_images (profile_id, image_type, image_path)
            VALUES (?, ?, ?)
        `, [profile_id, image_type, uploadResult.secure_url]);

        res.status(201).json({
            message: "ID image uploaded successfully",
            image: uploadResult.secure_url
        });

    } catch (error) {
        console.error("❌ Upload error:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

module.exports = router;