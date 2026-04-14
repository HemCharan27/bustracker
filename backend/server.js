const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bustracker";
const ACTIVE_DRIVER_WINDOW_MS = 20 * 60 * 1000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

mongoose
    .connect(MONGO_URL)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.log(err));

function trimText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value) {
    return trimText(value).replace(/\D/g, "");
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function publicUser(user) {
    const userObject = user.toObject ? user.toObject() : { ...user };
    delete userObject.otp;
    delete userObject.otpExpires;
    return userObject;
}

async function findUserByIdentity({ phone, driverId }) {
    if (driverId && mongoose.Types.ObjectId.isValid(driverId)) {
        const userById = await User.findById(driverId);
        if (userById) {
            return userById;
        }
    }

    const normalizedPhone = normalizePhone(phone || driverId);
    if (!normalizedPhone) {
        return null;
    }

    return User.findOne({ phone: normalizedPhone });
}

app.post("/login", async (req, res) => {
    try {
        const name = trimText(req.body.name);
        const phone = normalizePhone(req.body.phone);

        if (!name || !phone) {
            return res.status(400).json({ success: false, message: "Enter name and phone number" });
        }

        let user = await User.findOne({ phone });

        if (!user) {
            user = new User({ phone, role: "driver" });
        }

        user.role = "driver";
        user.name = name;
        user.driverName = name;
        await user.save();

        res.status(200).json({ success: true, message: "Login successful", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/student-login", async (req, res) => {
    try {
        const regNo = trimText(req.body.regNo);
        const password = trimText(req.body.password);

        if (!regNo || !password) {
            return res
                .status(400)
                .json({ success: false, message: "Enter registration number and password" });
        }

        let user = await User.findOne({ regNo, role: "student" });

        // If user doesn't exist, create new account
        if (!user) {
            user = new User({ 
                regNo, 
                password,
                role: "student",
                name: regNo
            });
            await user.save();
            return res.status(200).json({ success: true, message: "Account created and login successful", user: publicUser(user), isNewUser: true });
        }

        // If user exists, verify password
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }

        res.status(200).json({ success: true, message: "Login successful", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/send-otp", async (req, res) => {
    try {
        const regNo = trimText(req.body.regNo);
        const phone = normalizePhone(req.body.phone);
        const email = trimText(req.body.email).toLowerCase();
        const role = trimText(req.body.role);

        if (!phone && !email) {
            return res.status(400).json({ success: false, message: "Enter phone or email" });
        }

        const otp = generateOTP();
        const identityQuery = [];

        if (phone) {
            identityQuery.push({ phone });
        }

        if (email) {
            identityQuery.push({ email });
        }

        let user = await User.findOne({ $or: identityQuery });

        if (!user) {
            user = new User({ regNo, phone: phone || undefined, email: email || undefined, role });
        }

        user.regNo = regNo || user.regNo;
        user.phone = phone || user.phone;
        user.email = email || user.email;
        user.role = role || user.role;
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);

        await user.save();

        console.log("OTP:", otp);
        res.status(200).json({ success: true, message: "OTP sent" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/verify-otp", async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone);
        const email = trimText(req.body.email).toLowerCase();
        const otp = trimText(req.body.otp);
        const identityQuery = [];

        if (phone) {
            identityQuery.push({ phone });
        }

        if (email) {
            identityQuery.push({ email });
        }

        if (!identityQuery.length) {
            return res.status(400).json({ success: false, message: "Phone or email is required" });
        }

        const user = await User.findOne({ $or: identityQuery });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.otp !== otp) {
            return res.status(401).json({ success: false, message: "Wrong OTP" });
        }

        if (!user.otpExpires || user.otpExpires.getTime() < Date.now()) {
            return res.status(401).json({ success: false, message: "OTP expired" });
        }

        user.otp = null;
        user.otpExpires = null;
        await user.save();

        res.status(200).json({ success: true, message: "Login successful", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/save-driver-info", async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone);
        const driverName = trimText(req.body.driverName);
        const driverDOB = trimText(req.body.driverDOB);
        const driverLicensePhoto = req.body.driverLicensePhoto;

        const user = await findUserByIdentity({ phone });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.role = "driver";
        user.name = driverName || user.name;
        user.driverName = driverName || user.driverName;
        user.driverDOB = driverDOB;
        user.driverLicensePhoto = driverLicensePhoto;

        await user.save();

        res.status(200).json({ success: true, message: "Driver info saved", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/save-bus-details", async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone);
        const busRepresentationNumber = trimText(req.body.busRepresentationNumber);
        const busNumberPlate = trimText(req.body.busNumberPlate);

        const user = await findUserByIdentity({ phone });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.role = "driver";
        user.busRepresentationNumber = busRepresentationNumber;
        user.busNumberPlate = busNumberPlate;

        await user.save();

        res.status(200).json({ success: true, message: "Bus details saved", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/add-driver", async (req, res) => {
    try {
        const name = trimText(req.body.name);
        const dob = trimText(req.body.dob);
        const phone = normalizePhone(req.body.phone);
        const licenseImage = req.body.licenseImage;

        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone number is required" });
        }

        let user = await User.findOne({ phone });

        if (!user) {
            user = new User({ phone, role: "driver" });
        }

        user.role = "driver";
        user.name = name || user.name;
        user.driverName = name || user.driverName;
        user.driverDOB = dob;
        user.driverLicensePhoto = licenseImage;

        await user.save();

        res.status(200).json({ success: true, message: "Driver info saved", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/add-bus", async (req, res) => {
    try {
        const user = await findUserByIdentity({
            phone: req.body.phone,
            driverId: req.body.driverId
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        user.role = "driver";
        user.busRepresentationNumber = trimText(req.body.busName || req.body.busRepresentationNumber);
        user.busNumberPlate = trimText(req.body.numberPlate || req.body.busNumberPlate);

        await user.save();

        res.status(200).json({ success: true, message: "Bus details saved", user: publicUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/update-location", async (req, res) => {
    try {
        const user = await findUserByIdentity({
            phone: req.body.phone,
            driverId: req.body.driverId
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        const latitude = Number(req.body.lat);
        const longitude = Number(req.body.lng);
        const accuracy = Number(req.body.accuracy);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return res.status(400).json({ success: false, message: "Valid latitude and longitude are required" });
        }

        user.currentLocation = {
            latitude,
            longitude,
            accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
            timestamp: new Date()
        };

        await user.save();

        res.status(200).json({
            success: true,
            message: "Location updated",
            location: user.currentLocation
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.get("/active-buses", async (_req, res) => {
    try {
        const drivers = await User.find({ role: "driver" }).sort({ createdAt: -1 });
        const cutoffTime = Date.now() - ACTIVE_DRIVER_WINDOW_MS;

        const buses = drivers
            .filter((driver) => {
                const location = driver.currentLocation || {};
                const hasCoordinates =
                    Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
                const lastSeen = location.timestamp ? new Date(location.timestamp).getTime() : 0;

                return hasCoordinates && lastSeen >= cutoffTime;
            })
            .map((driver) => ({
                id: String(driver._id),
                phone: driver.phone,
                driverName: driver.driverName || driver.name,
                busRepresentationNumber: driver.busRepresentationNumber || "Bus",
                busNumberPlate: driver.busNumberPlate || "Pending",
                currentLocation: driver.currentLocation
            }));

        res.status(200).json({
            success: true,
            buses,
            activeWindowMinutes: ACTIVE_DRIVER_WINDOW_MS / (60 * 1000)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

