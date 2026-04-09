const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const db = require("../config/db");

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage — no local disk saving
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload collateral image
router.post("/upload/:collateral_id", upload.single("image"), async (req, res) => {
    try {
        const collateral_id = req.params.collateral_id;

        if (!req.file) {
            return res.status(400).json({
                message: "Image file is required"
            });
        }

        // Check collateral exists
        const [collateral] = await db.query(
            "SELECT collateral_id FROM collateral WHERE collateral_id = ?",
            [collateral_id]
        );

        if (collateral.length === 0) {
            return res.status(404).json({
                message: "Collateral not found"
            });
        }

        console.log("📤 Uploading image to Cloudinary...");

        // Upload buffer directly to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "collateral_images" },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        console.log("✅ Cloudinary upload success:", uploadResult.secure_url);

        // Save Cloudinary URL to database
        await db.query(`
            INSERT INTO collateral_images
            (collateral_id, image_path)
            VALUES (?, ?)
        `, [collateral_id, uploadResult.secure_url]);

        res.status(201).json({
            message: "Collateral image uploaded successfully",
            image_url: uploadResult.secure_url
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