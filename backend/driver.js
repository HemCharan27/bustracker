const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({
    name: String,
    dob: String,
    phone: String,
    licenseImage: String // we store image path or URL
});

module.exports = mongoose.model("Driver", driverSchema);