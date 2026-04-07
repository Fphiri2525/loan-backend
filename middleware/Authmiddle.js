module.exports = (req, res, next) => {
    try {
        // Example middleware check

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "Unauthorized - No token provided"
            });
        }

        // If you are using JWT → verify token here

        next();

    } catch (error) {
        res.status(500).json({
            message: "Middleware error",
            error: error.message
        });
    }
};