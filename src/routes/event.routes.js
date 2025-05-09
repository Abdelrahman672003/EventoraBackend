const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { auth, isAdmin } = require("../middleware/auth.middleware");
const Event = require("../models/event.model");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

/**
 * @swagger
 * components:
 *   schemas:
 *     Event:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - category
 *         - date
 *         - time
 *         - venue
 *         - price
 *         - image
 *         - totalTickets
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-incrementing unique identifier
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         category:
 *           type: string
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         date:
 *           type: string
 *           format: date
 *         time:
 *           type: string
 *           format: time
 *           description: Event time in HH:mm format
 *         venue:
 *           type: string
 *         price:
 *           type: number
 *         image:
 *           type: string
 *         totalTickets:
 *           type: integer
 *         availableTickets:
 *           type: integer
 *         createdBy:
 *           type: string
 *           format: uuid
 */

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer for image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Helper function to parse event ID
const parseEventId = (id) => {
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) {
    throw new Error("Invalid event ID");
  }
  return parsedId;
};

// Helper function to add isFavorite field to events
const addIsFavoriteField = (events, userId) => {
  if (!userId)
    return events.map((event) => ({ ...event.toObject(), isFavorite: false }));

  return events.map((event) => {
    const eventObj = event.toObject();
    // Convert both IDs to strings for comparison
    const userIdStr = userId.toString();
    const isFavorite =
      eventObj.interestedUsers &&
      eventObj.interestedUsers.some((id) => id.toString() === userIdStr);

    // Create a new object without interestedUsers
    const { interestedUsers, ...eventWithoutUsers } = eventObj;

    return {
      ...eventWithoutUsers,
      isFavorite: !!isFavorite,
    };
  });
};

// Helper function to add isBooked field to events
const addIsBookedField = async (events, userId) => {
  if (!userId) {
    return events.map(event => ({ ...event, isBooked: false }));
  }

  // Get all active bookings for the user
  const Booking = require('../models/booking.model');
  const userBookings = await Booking.find({ 
    user: userId,
    status: 'active'
  }).select('event');

  // Create a set of booked event IDs for faster lookup
  const bookedEventIds = new Set(userBookings.map(booking => booking.event));

  // Add isBooked field to each event
  return events.map(event => ({
    ...event,
    isBooked: bookedEventIds.has(event.id)
  }));
};

/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create a new event (Admin only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - category
 *               - date
 *               - time
 *               - venue
 *               - price
 *               - totalTickets
 *               - image
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *                 format: time
 *                 description: Event time in HH:mm format
 *               venue:
 *                 type: string
 *               price:
 *                 type: number
 *               totalTickets:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Event created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  "/",
  auth,
  isAdmin,
  upload.single("image"),
  [
    body("name").notEmpty().withMessage("Event name is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("category").notEmpty().withMessage("Category is required"),
    body("date").isDate().withMessage("Valid date is required"),
    body("time")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Valid time in HH:mm format is required"),
    body("venue").notEmpty().withMessage("Venue is required"),
    body("price").isNumeric().withMessage("Valid price is required"),
    body("totalTickets")
      .isInt({ min: 1 })
      .withMessage("Total tickets must be at least 1"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Event image is required" });
      }

      // Upload image to Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI);

      // Create event with time field
      const event = new Event({
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        date: req.body.date,
        time: req.body.time,
        venue: req.body.venue,
        price: req.body.price,
        totalTickets: req.body.totalTickets,
        image: result.secure_url,
        availableTickets: req.body.totalTickets,
        createdBy: req.user._id,
        tags: req.body.tags
          ? req.body.tags.split(",").map((tag) => tag.trim())
          : [],
      });

      await event.save();
      res.status(201).json(event);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating event", error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get all events with pagination and filters
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date
 *     responses:
 *       200:
 *         description: List of events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalEvents:
 *                   type: integer
 */
router.get(
  "/",
  async (req, res, next) => {
    // Try to authenticate but don't require it
    auth(
      req,
      res,
      (err) => {
        if (err) {
          // If authentication fails, continue without user info
          req.user = null;
        }
        next();
      },
      true
    );
  },
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const query = {};

      // Add filters
      if (req.query.category) {
        query.category = req.query.category;
      }
      if (req.query.search) {
        // Case-insensitive search using regex
        query.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
          { venue: { $regex: req.query.search, $options: 'i' } }
        ];
      }
      if (req.query.minPrice) {
        query.price = { ...query.price, $gte: parseFloat(req.query.minPrice) };
      }
      if (req.query.maxPrice) {
        query.price = { ...query.price, $lte: parseFloat(req.query.maxPrice) };
      }
      if (req.query.date) {
        query.date = { $gte: new Date(req.query.date) };
      }

      const events = await Event.find(query)
        .sort({ date: 1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "name email");

      const total = await Event.countDocuments(query);

      // Add isFavorite field to each event
      const eventsWithFavorite = addIsFavoriteField(events, req.user?._id);
      
      // Add isBooked field to each event
      const eventsWithBookingStatus = await addIsBookedField(eventsWithFavorite, req.user?._id);

      res.json({
        events: eventsWithBookingStatus,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalEvents: total,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching events",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/events/favorites:
 *   get:
 *     summary: Get user's favorite events
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of favorite events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Event'
 *       401:
 *         description: Unauthorized
 */
router.get("/favorites", auth, async (req, res) => {
  try {
    const events = await Event.find({ interestedUsers: req.user._id }).populate(
      "createdBy",
      "name email"
    );

    // Add isFavorite field to each event (will all be true since they're favorites)
    const eventsWithFavorite = addIsFavoriteField(events, req.user._id);

    // Add isBooked field to each event
    const eventsWithBookingStatus = await addIsBookedField(eventsWithFavorite, req.user._id);

    res.json(eventsWithBookingStatus);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching favorite events",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Get a single event by ID
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID (numeric)
 *     responses:
 *       200:
 *         description: Event details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Event not found
 */
router.get("/:id", async (req, res, next) => {
  // Try to authenticate but don't require it
  auth(
    req,
    res,
    (err) => {
      if (err) {
        // If authentication fails, continue without user info
        req.user = null;
      }
      next();
    },
    true
  );
}, async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId }).populate(
      "createdBy",
      "name email"
    );

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Add isFavorite field to the event
    const eventWithFavorite = addIsFavoriteField([event], req.user?._id)[0];

    // Add isBooked field to the event
    const eventWithBookingStatus = (await addIsBookedField([eventWithFavorite], req.user?._id))[0];

    res.json(eventWithBookingStatus);
  } catch (error) {
    if (error.message === "Invalid event ID") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({
      message: "Error fetching event",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   put:
 *     summary: Update an event (Admin only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID (numeric)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *                 format: time
 *                 description: Event time in HH:mm format
 *               venue:
 *                 type: string
 *               price:
 *                 type: number
 *               totalTickets:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Event updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Event not found
 */
router.put("/:id", auth, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const updates = { ...req.body };

    // Handle total tickets and available tickets update
    if (updates.totalTickets) {
      const oldTotalTickets = event.totalTickets;
      const newTotalTickets = parseInt(updates.totalTickets);
      const ticketsDifference = newTotalTickets - oldTotalTickets;

      // Update available tickets by adding the difference
      updates.availableTickets = event.availableTickets + ticketsDifference;

      // Ensure available tickets doesn't go below 0
      if (updates.availableTickets < 0) {
        return res.status(400).json({
          message:
            "Cannot reduce total tickets below the number of tickets already booked",
        });
      }
    }

    // Only update image if a new one is provided
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI);
      updates.image = result.secure_url;
    } else {
      // Keep the existing image
      updates.image = event.image;
    }

    Object.assign(event, updates);
    await event.save();

    res.json(event);
  } catch (error) {
    if (error.message === "Invalid event ID") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({
      message: "Error updating event",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Delete an event (Admin only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID (numeric)
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Event not found
 */
router.delete("/:id", auth, isAdmin, async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOneAndDelete({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    if (error.message === "Invalid event ID") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({
      message: "Error deleting event",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/events/{id}/favorite:
 *   post:
 *     summary: Add an event to favorites
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event added to favorites successfully
 *       400:
 *         description: Event already in favorites
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event not found
 */
router.post("/:id/favorite", auth, async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user already has this event in favorites
    if (event.interestedUsers.includes(req.user._id)) {
      return res.status(400).json({ message: "Event already in favorites" });
    }

    // Add user to interested users and increment count
    event.interestedUsers.push(req.user._id);
    event.interestedCount += 1;
    await event.save();

    res.json({
      message: "Event added to favorites",
      interestedCount: event.interestedCount,
    });
  } catch (error) {
    if (error.message === "Invalid event ID") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({
      message: "Error adding event to favorites",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/events/{id}/favorite:
 *   delete:
 *     summary: Remove an event from user's favorites
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event removed from favorites successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 interestedCount:
 *                   type: integer
 *       400:
 *         description: Event not in favorites
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event not found
 */
router.delete("/:id/favorite", auth, async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user has this event in favorites
    if (!event.interestedUsers.includes(req.user._id)) {
      return res.status(400).json({ message: "Event not in favorites" });
    }

    // Remove user from interested users and decrement count
    event.interestedUsers = event.interestedUsers.filter(
      (userId) => userId.toString() !== req.user._id.toString()
    );
    event.interestedCount -= 1;
    await event.save();

    res.json({
      message: "Event removed from favorites",
      interestedCount: event.interestedCount,
    });
  } catch (error) {
    if (error.message === "Invalid event ID") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({
      message: "Error removing event from favorites",
      error: error.message,
    });
  }
});

module.exports = router;
