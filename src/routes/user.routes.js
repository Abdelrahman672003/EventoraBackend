const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth.middleware");
const User = require("../models/user.model");

// Get user profile
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching profile", error: error.message });
  }
});

module.exports = router;
