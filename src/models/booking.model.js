const mongoose = require("mongoose");
const Counter = require("./counter.model");

const bookingSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    event: {
      type: Number,
      ref: "Event",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
    },
    bookingDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ user: 1, event: 1 });

bookingSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { name: "bookingId" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.id = counter.seq;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
