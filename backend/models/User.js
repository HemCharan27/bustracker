const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: String,
    regNo: { type: String }, // only for students
    password: { type: String }, // for student authentication
    phone: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true },
    otp: String,
    otpExpires: Date,
    role: { type: String, enum: ["student", "driver"] },
    // Driver fields
    driverName: String,
    driverDOB: String,
    driverLicensePhoto: String, // base64 or URL
    // Bus fields
    busRepresentationNumber: String,
    busNumberPlate: String,
    // Location tracking
    currentLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        timestamp: Date
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
