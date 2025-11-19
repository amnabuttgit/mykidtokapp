require("dotenv").config();
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Fetch all uploaded videos from Cloudinary
 */
const fetchVideosFromCloudinary = async () => {
  try {
    const response = await cloudinary.api.resources({
      type: "upload",
      resource_type: "video", // Fetch only videos
    });

    // Extract and return video URLs
    return response.resources.map((video) => video.secure_url);
  } catch (error) {
    console.error("Error fetching videos:", error);
    return [];
  }
};

module.exports = fetchVideosFromCloudinary; // ✅ Correct export