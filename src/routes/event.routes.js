const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { auth, isAdmin } = require("../middleware/auth.middleware");
const Event = require("../models/event.model");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

//  parse event ID
const parseEventId = (id) => {
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) {
    throw new Error("Invalid event ID");
  }
  return parsedId;
};

// add isFavorite field to events
const addIsFavoriteField = (events, userId) => {
  if (!userId)
    return events.map((event) => ({ ...event.toObject(), isFavorite: false }));

  return events.map((event) => {
    const eventObj = event.toObject();
    const userIdStr = userId.toString();
    const isFavorite =
      eventObj.interestedUsers &&
      eventObj.interestedUsers.some((id) => id.toString() === userIdStr);

    const { interestedUsers, ...eventWithoutUsers } = eventObj;

    return {
      ...eventWithoutUsers,
      isFavorite: !!isFavorite,
    };
  });
};

// add isBooked field to events
const addIsBookedField = async (events, userId) => {
  if (!userId) {
    return events.map((event) => ({ ...event, isBooked: false }));
  }

  const Booking = require("../models/booking.model");
  const userBookings = await Booking.find({
    user: userId,
    status: "active",
  }).select("event");

  const bookedEventIds = new Set(userBookings.map((booking) => booking.event));
  return events.map((event) => ({
    ...event,
    isBooked: bookedEventIds.has(event.id),
  }));
};

// Routers
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
    // for future updates to handle more than 1 ticket per user
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

      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI);

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

router.get(
  "/",
  async (req, res, next) => {
    // to allow fetching events without authentication
    auth(
      req,
      res,
      (err) => {
        if (err) {
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

      if (req.query.category) {
        query.category = req.query.category;
      }
      if (req.query.search) {
        query.$or = [
          { name: { $regex: req.query.search, $options: "i" } },
          { description: { $regex: req.query.search, $options: "i" } },
          { venue: { $regex: req.query.search, $options: "i" } },
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

      const eventsWithFavorite = addIsFavoriteField(events, req.user?._id);
      const eventsWithBookingStatus = await addIsBookedField(
        eventsWithFavorite,
        req.user?._id
      );

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

router.get("/favorites", auth, async (req, res) => {
  try {
    const events = await Event.find({ interestedUsers: req.user._id }).populate(
      "createdBy",
      "name email"
    );

    const eventsWithFavorite = addIsFavoriteField(events, req.user._id);
    const eventsWithBookingStatus = await addIsBookedField(
      eventsWithFavorite,
      req.user._id
    );

    res.json(eventsWithBookingStatus);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching favorite events",
      error: error.message,
    });
  }
});

router.get(
  "/:id",
  async (req, res, next) => {
    // to allow fetching event without authentication
    auth(
      req,
      res,
      (err) => {
        if (err) {
          req.user = null;
        }
        next();
      },
      true
    );
  },
  async (req, res) => {
    try {
      const eventId = parseEventId(req.params.id);
      const event = await Event.findOne({ id: eventId }).populate(
        "createdBy",
        "name email"
      );

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const eventWithFavorite = addIsFavoriteField([event], req.user?._id)[0];
      const eventWithBookingStatus = (
        await addIsBookedField([eventWithFavorite], req.user?._id)
      )[0];

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
  }
);

router.put("/:id", auth, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const updates = { ...req.body };

    if (updates.totalTickets) {
      const oldTotalTickets = event.totalTickets;
      const newTotalTickets = parseInt(updates.totalTickets);
      const ticketsDifference = newTotalTickets - oldTotalTickets;
      updates.availableTickets = event.availableTickets + ticketsDifference;

      if (updates.availableTickets < 0) {
        return res.status(400).json({
          message:
            "Cannot reduce total tickets below the number of tickets already booked",
        });
      }
    }

    // Handle tags update
    console.log(updates.tags);
    if (updates.tags !== undefined) {
      if (updates.tags === "") {
        updates.tags = []; // Remove all tags if empty string is provided
      }
    }

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

router.post("/:id/favorite", auth, async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.interestedUsers.includes(req.user._id)) {
      return res.status(400).json({ message: "Event already in favorites" });
    }

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

router.delete("/:id/favorite", auth, async (req, res) => {
  try {
    const eventId = parseEventId(req.params.id);
    const event = await Event.findOne({ id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (!event.interestedUsers.includes(req.user._id)) {
      return res.status(400).json({ message: "Event not in favorites" });
    }

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
