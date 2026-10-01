const express = require('express');
const path = require('path');
const fs = require('fs'); 
const mongoose = require('mongoose'); 
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require('nodemailer'); 
const crypto = require('crypto'); // Added for highly unique, unpredictable token tracking strings

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE CONNECTION ---
const atlasURI = process.env.MONGO_URI || "mongodb+srv://nivedithapraveen94_db_user:9496534283@cluster0.vaclozl.mongodb.net/hospitalCanteen?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(atlasURI)
    .then(() => console.log('✅ Connected to MongoDB Atlas (Cloud)'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- SCHEMAS & MODELS ---

// UPDATED CONSULTANT CONNECTION STORAGE SCHEMA WITH TOKEN TRACKING FEATURES
const consultantConnectSchema = new mongoose.Schema({
    doctorName: { type: String, required: true },
    patientName: { type: String, required: true },
    patientPhone: { type: String, default: "Not Provided" },
    appointmentDate: { type: Date, required: true, default: Date.now },
    consultMode: { type: String, required: true, default: "Online" },
    symptoms: { type: String, default: "" },
    tokenNumber: { type: Number, required: true },
    queueStatus: { type: String, enum: ['Waiting', 'Inside', 'Completed'], default: 'Waiting' },
    trackingToken: { type: String, default: null }, // Persists secure individual live track tokens
    tokenGeneratedAt: { type: Date, default: null }, // Logs link dispatch times for analytics
    timestamp: { type: Date, default: Date.now }
}, { collection: 'consultant_connections' });
const ConsultantConnect = mongoose.model('ConsultantConnect', consultantConnectSchema);

// EXPLICIT DAILY DOC SCHEDULE VIEW SCHEMA (Strictly for Find Consultants Layout)
const dailyDocSchema = new mongoose.Schema({
    doctorName: { type: String, required: true },
    department: { type: String, required: true },
    opdTime: { type: String, required: true }
}, { collection: 'dailydoc' }); 
const DailyDoc = mongoose.model('DailyDoc', dailyDocSchema);

const orderSchema = new mongoose.Schema({
    id: Number,
    timestamp: String,
    patientId: String,
    roomNumber: String,
    patientName: String,
    foodItems: String,
    totalPrice: String,
    paymentMethod: { type: String, default: 'Cash/Delivery' },
    paymentId: { type: String, default: null }, 
    status: { type: String, default: 'pending' }
});
const Order = mongoose.model('Order', orderSchema);

const patientSchema = new mongoose.Schema({
    "Patient ID": String,
    "Patient Name": String,
    "Room Number": String, 
    "Disease": String,
    "Doctor Name": String, 
    "Guardian Email": String 
}, { collection: 'patient' }); 
const Patient = mongoose.model('Patient', patientSchema);

const doctorSchema = new mongoose.Schema({
    "Doctor ID": String,
    "Doctor Name": String,
    "Allowed Patient ID": String
}, { collection: 'docters' }); 
const Doctor = mongoose.model('Doctor', doctorSchema);

const dietSchema = new mongoose.Schema({
    patientId: String,
    allowedFoods: String,
    avoidFoods: String,
    lastUpdated: { type: Date, default: Date.now }
});
const Diet = mongoose.model('Diet', dietSchema);

const nightRoundSchema = new mongoose.Schema({
    patientId: String,
    rounds: [{
        id: Number,
        time: String,
        rawTime: String,
        purpose: String,
        notes: String
    }]
});
const NightRound = mongoose.model('NightRound', nightRoundSchema);

const labReportSchema = new mongoose.Schema({
    reportId: { type: String, unique: true },
    patientName: String,
    phone: String,
    testName: String,
    vialId: String,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now },
    results: { type: String, default: "" } 
});
const LabReport = mongoose.model('LabReport', labReportSchema);

const enquirySchema = new mongoose.Schema({
    senderName: String,
    phoneNumber: String,
    subject: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Enquiry = mongoose.model('Enquiry', enquirySchema);

const menuSchema = new mongoose.Schema({
    all: String,
    seasonalTitle: String,
    seasonalValue: String,
    diabetes: String,
    heart: String,
    caretaker: String,
    updatedAt: { type: Date, default: Date.now }
});
const Menu = mongoose.model('Menu', menuSchema);

const prescriptionSchema = new mongoose.Schema({
    id: String,
    doctor: String,
    patientInfo: String,
    clinicalNotes: String,
    medications: String,
    date: String,
    pdfDocumentData: String, 
    timestamp: { type: Date, default: Date.now }
});
const Prescription = mongoose.model('Prescription', prescriptionSchema);

const vehicleSchema = new mongoose.Schema({
    ownerName: { type: String, default: "Visitor" },
    vehicleNumber: { type: String, required: true },
    vehicleType: { type: String, enum: ['Two-Wheeler', 'Four-Wheeler', 'Ambulance', 'Other'], default: 'Four-Wheeler' },
    contactNumber: String,
    entryTime: { type: Date, default: Date.now },
    status: { type: String, enum: ['Inside', 'Checked Out'], default: 'Inside' },
    exitTime: { type: Date, default: null }
});
const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// --- CONSULTATION MEMORY STORAGE ---
let activeConsultations = [];

// --- GEMINI INITIALIZATION ---
const genAI = new GoogleGenerativeAI('AIzaSyB7Vr-4fvj5yZcQNGxhpxOKOmX83WJL8xc');
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    systemInstruction: "You are the Guardian Nutri-Bot, a helpful assistant for hospital nutrition. Provide expert, concise, and friendly advice about diet, health, and meals. Focus on patient wellness."
}); 

// Server payload streaming parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const rootDir = path.join(__dirname, '..');
app.use(express.static(rootDir));

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'nivedithapraveen94@gmail.com', 
        pass: 'yrqn cijt bveh ubto'   
    }
});

// --- HTML ROUTING ---
const serveHtmlFile = (fileName, res) => {
    let targetedPath = path.join(__dirname, fileName); 
    if (!fs.existsSync(targetedPath)) {
        targetedPath = path.join(rootDir, fileName); 
    }
    res.sendFile(targetedPath);
};

app.get('/nutri-hub', (req, res) => serveHtmlFile('nutri-hub.html', res));
app.get('/canteen', (req, res) => serveHtmlFile('canteen-staff.html', res));
app.get('/doctor-hub', (req, res) => serveHtmlFile('doctor-portal.html', res));
app.get('/nurse', (req, res) => serveHtmlFile('nurse.html', res));
app.get('/contact', (req, res) => serveHtmlFile('contact.html', res));
app.get('/vehicle', (req, res) => serveHtmlFile('vehicle.html', res));
app.get('/live', (req, res) => serveHtmlFile('live.html', res));
app.get('/connect', (req, res) => serveHtmlFile('connect.html', res));
app.get('/reception', (req, res) => serveHtmlFile('reception.html', res));
app.get('/live-track', (req, res) => serveHtmlFile('live-track.html', res));
app.get('/staff', (req, res) => serveHtmlFile('staff.html', res));
app.get('/time', (req, res) => serveHtmlFile('time.html', res));

// Default root route fix for Vercel
app.get('/', (req, res) => serveHtmlFile('index.html', res));

// --- EXPLICIT ROUTE INTEGRATING AGGREGATION JOIN ---
app.get('/api/consultants', async (req, res) => {
    try {
        const staffLayoutData = await DailyDoc.aggregate([
            {
                $lookup: {
                    from: "consultant_connections",
                    localField: "doctorName",
                    foreignField: "doctorName",
                    as: "activePatients"
                }
            }
        ]);
        res.json(staffLayoutData);
    } catch (err) {
        console.error("❌ Error fetching from aggregated dailydoc collection:", err);
        res.status(500).json({ error: "Failed to pull consultants board data." });
    }
});

// --- WORKFLOW QUEUE MONITOR STATUS REVISION TARGET ---
app.post('/api/appointments/update-status', async (req, res) => {
    try {
        const { appointmentId, status } = req.body;
        
        const updatedRecord = await ConsultantConnect.findByIdAndUpdate(
            appointmentId,
            { queueStatus: status },
            { new: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ success: false, message: "Appointment record match missing." });
        }

        res.status(200).json({ success: true, record: updatedRecord });
    } catch (error) {
        console.error("❌ Failed processing queue position update operation:", error);
        res.status(500).json({ success: false, message: "Internal tracker workflow fault." });
    }
});

// --- ADMINISTRATOR CONSOLE PORTAL ACTIONS ---
app.post('/api/save-doctor', async (req, res) => {
    try {
        const { doctorId, doctorName, department, opdTime } = req.body;

        if (doctorId) {
            await DailyDoc.findByIdAndUpdate(doctorId, { doctorName, department, opdTime });
            res.json({ success: true, message: "Consultant updated successfully." });
        } else {
            const newDoc = new DailyDoc({ doctorName, department, opdTime });
            await newDoc.save();
            res.json({ success: true, message: "Consultant created successfully." });
        }
    } catch (err) {
        console.error("❌ Administrative operation failure:", err);
        res.status(500).json({ success: false, message: "Failed to apply changes." });
    }
});

// --- APPOINTMENT DIRECT STORAGE WITH AUTOMATED TOKEN CREATION & NOTIFICATION LINKS ---
app.post('/api/consultant-connect', async (req, res) => {
    try {
        const { doctorName, patientName, patientPhone, appointmentDate, consultMode, symptoms } = req.body;

        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);

        const lastActiveRecord = await ConsultantConnect.findOne({
            doctorName,
            appointmentDate: { $gte: todayStart }
        }).sort({ tokenNumber: -1 });

        let assignedToken = 101; 
        if (lastActiveRecord && lastActiveRecord.tokenNumber) {
            assignedToken = lastActiveRecord.tokenNumber + 1;
        }

        const newBooking = new ConsultantConnect({
            doctorName,
            patientName,
            patientPhone: patientPhone || "Not Provided",
            appointmentDate: appointmentDate || new Date(),
            consultMode: consultMode || "Online",
            symptoms: symptoms || "",
            tokenNumber: assignedToken,
            queueStatus: 'Waiting'
        });

        await newBooking.save();

        const runtimeDomain = `http://localhost:${PORT}`;
        const trackingUrlLink = `${runtimeDomain}/time?token=${assignedToken}&doc=${encodeURIComponent(doctorName)}`;

        console.log(`\n--------------------------------------------------------------`);
        console.log(`💬 OUTGOING SMS SYSTEM NOTIFICATION SIMULATOR:`);
        console.log(`To: ${patientPhone}`);
        console.log(`Message: Dear ${patientName}, your reservation is confirmed. Your assigned Token is #${assignedToken}.`);
        console.log(`Track queue live updates here: ${trackingUrlLink}`);
        console.log(`--------------------------------------------------------------\n`);

        res.status(201).json({ 
            success: true, 
            message: "Data written to Atlas cloud collection.",
            token: assignedToken,
            link: trackingUrlLink
        });
    } catch (err) {
        console.error("Error creating booking token sequence:", err);
        res.status(500).json({ success: false, error: "Internal tracking layer error." });
    }
});

// --- SECURE WHATSAPP TRACKING PARAMETER TOKENIZER (Serving time.html) ---
app.post('/api/appointments/generate-tracking', async (req, res) => {
    try {
        const { appointmentId, phone } = req.body;

        if (!appointmentId) {
            return res.status(400).json({ success: false, message: "Missing valid object identifier data parameter." });
        }

        const secureToken = crypto.randomBytes(16).toString('hex');

        const record = await ConsultantConnect.findByIdAndUpdate(
            appointmentId, 
            { 
                trackingToken: secureToken,
                tokenGeneratedAt: new Date()
            },
            { new: true }
        );

        if (!record) {
            return res.status(404).json({ success: false, message: "Active consultation match missing." });
        }

        const domain = `http://localhost:${PORT}`;
        const liveTrackingUrl = `${domain}/time?token=${record.tokenNumber}&doc=${encodeURIComponent(record.doctorName)}&secureAuth=${secureToken}`;

        const cleanPhone = phone.replace(/\D/g, '');

        const textPayload = `Hello ${record.patientName}, your consultation room sequence tracking update is ready! View your live room placement and wait details directly on the MediVerse network dashboard: ${liveTrackingUrl}`;
        const whatsappRedirectUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(textPayload)}`;

        res.status(200).json({
            success: true,
            trackingToken: secureToken,
            whatsappRedirectUrl: whatsappRedirectUrl
        });

    } catch (error) {
        console.error("❌ Token processing failure inside server runtime:", error);
        res.status(500).json({ success: false, message: "Internal tracker system breakdown." });
    }
});

// --- REAL-TIME LIVE QUEUE ANALYTICAL ENDPOINT (UPDATED FOR DYNAMIC THANK YOU MONITORING) ---
app.get('/api/live-queue-status', async (req, res) => {
    try {
        const tokenQuery = parseInt(req.query.token);
        const docQuery = req.query.doc;

        if (!tokenQuery || !docQuery) {
            return res.status(400).json({ error: "Missing parameters. Required fields: token, doc" });
        }

        const baseDoc = await DailyDoc.findOne({ doctorName: docQuery });
        const department = baseDoc ? baseDoc.department : "General Outpatient Division";

        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);

        // CHECK IF THIS PARTICULAR PATIENT IS MARKED AS COMPLETED
        const targetPatient = await ConsultantConnect.findOne({
            doctorName: docQuery,
            tokenNumber: tokenQuery,
            appointmentDate: { $gte: todayStart }
        });

        if (targetPatient && targetPatient.queueStatus === 'Completed') {
            return res.json({ isCompleted: true });
        }

        const insideRecord = await ConsultantConnect.findOne({
            doctorName: docQuery,
            queueStatus: 'Inside',
            appointmentDate: { $gte: todayStart }
        });

        const activeQueue = await ConsultantConnect.find({
            doctorName: docQuery,
            queueStatus: 'Waiting',
            appointmentDate: { $gte: todayStart }
        }).sort({ tokenNumber: 1 });

        let currentInside = insideRecord ? insideRecord.tokenNumber : "None";
        if (currentInside === "None" && activeQueue.length > 0) {
            currentInside = `${activeQueue[0].tokenNumber} (Preparing)`;
        }

        let aheadCount = 0;
        activeQueue.forEach((item) => {
            if (item.tokenNumber < tokenQuery) {
                aheadCount++;
            }
        });

        if (insideRecord && insideRecord.tokenNumber < tokenQuery) {
            aheadCount++;
        }

        const standardTurnMinutes = 12;
        const totalEstimatedWait = aheadCount * standardTurnMinutes;

        res.json({
            isCompleted: false,
            doctorName: docQuery,
            department: department,
            currentInsideToken: currentInside,
            patientsAhead: aheadCount,
            estimatedWaitMinutes: totalEstimatedWait
        });

    } catch (err) {
        console.error("Analytical calculation thread crashed:", err);
        res.status(500).json({ error: "Could not sync runtime live stats structure." });
    }
});

// --- PATIENT ENQUIRY & LOOKUP APIS ---
app.post('/api/verify-patient', async (req, res) => {
    try {
        const { patientId, roomNumber } = req.body;

        if (!patientId || !roomNumber) {
            return res.status(400).json({ valid: false, message: "Patient ID and Room Number are required fields." });
        }

        const activePatient = await Patient.findOne({
            "Patient ID": { $regex: new RegExp("^" + patientId.trim() + "$", "i") },
            "Room Number": { $regex: new RegExp("^" + roomNumber.trim() + "$", "i") }
        });

        if (activePatient) {
            return res.status(200).json({ valid: true });
        } else {
            return res.status(401).json({ valid: false, message: "Access Denied: Record mismatch." });
        }
    } catch (err) {
        return res.status(500).json({ valid: false, message: "Database lookup failure." });
    }
});

app.get('/api/patients', async (req, res) => {
    try {
        const patients = await Patient.find();
        res.json(patients);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch patient data" });
    }
});

app.get('/api/get-patient/:id', async (req, res) => {
    try {
        const patient = await Patient.findOne({ "Patient ID": req.params.id });
        if (patient) res.json(patient);
        else res.status(404).send("Patient not found");
    } catch (err) {
        res.status(500).send("Verification error");
    }
});

app.post('/api/register-patient', async (req, res) => {
    const { name, roomNumber, patientId, guardianEmail, doctorName, illness } = req.body;
    try {
        const newPatient = new Patient({
            "Patient Name": name,
            "Room Number": roomNumber,
            "Patient ID": patientId,
            "Guardian Email": guardianEmail,
            "Disease": illness, 
            "Doctor Name": doctorName 
        });
        
        await newPatient.save(); 

        const doctor = await Doctor.findOne({ "Doctor Name": doctorName });
        if (doctor) {
            let currentIds = doctor["Allowed Patient ID"] || "";
            let idArray = currentIds ? currentIds.split(',').map(s => s.trim()) : [];
            if (!idArray.includes(patientId)) idArray.push(patientId);
            let updatedList = idArray.join(',');
            
            await Doctor.updateOne(
                { "Doctor Name": doctorName },
                { $set: { "Allowed Patient ID": updatedList } }
            );
        }

        const mailOptions = {
            from: 'nivedithapraveen94@gmail.com', 
            to: guardianEmail,
            subject: 'CareBite | Patient Registered Successfully',
            text: `Hello,\n\nPatient ${name} has been successfully registered.\n\nRoom Number: ${roomNumber}\nAccess ID: ${patientId}\n\nAssigned Doctor: ${doctorName}\n\nBest regards,\nCareBite Team`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) console.error("❌ Email Error:", error);
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).send("Registration failed");
    }
});

app.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await Doctor.find();
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch doctor data" });
    }
});

// --- MENU API ROUTES ---
app.post('/api/update-menu', async (req, res) => {
    try {
        await Menu.findOneAndUpdate({}, req.body, { upsert: true, new: true });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update menu" });
    }
});

app.get('/api/vehicle-stats', async (req, res) => {
    try {
        const insideCount = await Vehicle.countDocuments({ status: 'Inside' });
        const totalToday = await Vehicle.countDocuments({ entryTime: { $gte: new Date().setHours(0,0,0,0) } });
        const ambulanceCount = await Vehicle.countDocuments({ status: 'Inside', vehicleType: 'Ambulance' });
        res.json({ currentlyInside: insideCount, totalRegisteredToday: totalToday, activeEmergencyAmbulances: ambulanceCount });
    } catch (err) {
        res.status(500).json({ error: "Analytical summary calculation error." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server active at http://localhost:${PORT}`);
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
});