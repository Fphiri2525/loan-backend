const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const db = require("../config/db");

// Storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Upload collateral image (AUTO collateral detection)
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

        const imagePath = req.file.filename;

        // Insert image record
        await db.query(`
            INSERT INTO collateral_images
            (collateral_id, image_path)
            VALUES (?, ?)
        `, [collateral_id, imagePath]);

        res.status(201).json({
            message: "Collateral image uploaded"
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