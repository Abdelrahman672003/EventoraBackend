const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth.middleware');
const Booking = require('../models/booking.model');
const Event = require('../models/event.model');

// Helper function to parse booking ID
const parseBookingId = (id) => {
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) {
    throw new Error('Invalid booking ID');
  }
  return parsedId;
};

// Create booking
router.post('/', auth, [
  body('eventId').notEmpty().withMessage('Event ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { eventId, quantity } = req.body;

    // Find event
    const event = await Event.findOne({ id: eventId });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check ticket availability
    if (event.availableTickets < quantity) {
      return res.status(400).json({ message: 'Not enough tickets available' });
    }

    // Create booking
    const booking = new Booking({
      user: req.user._id,
      event: eventId,
      quantity,
      totalPrice: event.price * quantity
    });

    // Update available tickets
    event.availableTickets -= quantity;
    await event.save();
    await booking.save();

    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Error creating booking', error: error.message });
  }
});

// Get user's bookings
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find({ user: req.user._id })
      .sort({ bookingDate: -1 })
      .skip(skip)
      .limit(limit);

    // Manually populate events using the id field
    const populatedBookings = await Promise.all(bookings.map(async (booking) => {
      const bookingObj = booking.toObject();
      const event = await Event.findOne({ id: booking.event }).select('id name date venue image category price isFavorite');
      return {
        ...bookingObj,
        event: event
      };
    }));

    const total = await Booking.countDocuments({ user: req.user._id });

    res.json({
      bookings: populatedBookings,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalBookings: total
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching bookings', error: error.message });
  }
});

// Cancel booking
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const bookingId = parseBookingId(req.params.id);
    const booking = await Booking.findOne({ id: bookingId });
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if booking belongs to user
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this booking' });
    }

    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }

    // Update event's available tickets
    const event = await Event.findOne({ id: booking.event });
    event.availableTickets += booking.quantity;
    await event.save();

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    res.json({ message: 'Booking cancelled successfully', booking });
  } catch (error) {
    if (error.message === 'Invalid booking ID') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error cancelling booking', error: error.message });
  }
});

// Get booking details
router.get('/:id', auth, async (req, res) => {
  try {
    const bookingId = parseBookingId(req.params.id);
    const booking = await Booking.findOne({ id: bookingId })
      .populate({
        path: 'event',
        select: 'name date venue image price'
      });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if booking belongs to user
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }

    res.json(booking);
  } catch (error) {
    if (error.message === 'Invalid booking ID') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching booking', error: error.message });
  }
});

module.exports = router; 