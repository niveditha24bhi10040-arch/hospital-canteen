const express = require('express');
const path = require('path');
const fs = require('fs'); 
const mongoose = require('mongoose'); 
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require('nodemailer'); 
const crypto = require('crypto'); // Added for highly unique, unpredictable token tracking strings

const app = express();
const PORT = 3000;

// --- DATABASE CONNECTION ---
const atlasURI = "mongodb+srv://nivedithapraveen94_db_user:9496534283@cluster0.vaclozl.mongodb.net/hospitalCanteen?retryWrites=true&w=majority&appName=Cluster0";

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

app.get('/api/get-menu', async (req, res) => {
    try {
        const menu = await Menu.findOne().sort({ updatedAt: -1 });
        res.json(menu || {});
    } catch (err) {
        res.status(500).json({ error: "Fetch failed" });
    }
});

// --- ORDER ROUTES ---
app.post('/submit-order', async (req, res) => {
    try {
        const newOrder = new Order({
            id: Date.now(),
            timestamp: new Date().toLocaleString(),
            patientId: req.body.patientId || "N/A",
            roomNumber: req.body.roomNumber || "N/A",
            patientName: req.body.patientName || "Guest",
            foodItems: req.body.foodItems || "Standard Meal",
            totalPrice: req.body.totalPrice || "0",
            paymentMethod: req.body.paymentMethod || "Cash/Delivery",
            status: 'pending' 
        });
        await newOrder.save();
        res.sendFile(path.join(rootDir, 'order-success.html'));
    } catch (err) {
        res.status(500).send("Cloud Database Error");
    }
});

app.post('/api/save-digital-order', async (req, res) => {
    try {
        const { paymentId, amount, items, patientId, roomNumber, patientName } = req.body;
        const itemsString = items && Array.isArray(items) ? items.map(i => i.name).join(", ") : "Digital Order";
        const newOrder = new Order({
            id: Date.now(),
            timestamp: new Date().toLocaleString(),
            patientId: patientId || "N/A",
            roomNumber: roomNumber || "N/A",
            patientName: patientName || "Guest",
            foodItems: itemsString,
            totalPrice: amount.toString(),
            paymentMethod: 'Online/Razorpay',
            paymentId: paymentId,
            status: 'pending'
        });
        await newOrder.save();
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to notify staff" });
    }
});

app.get('/api/view-orders', async (req, res) => {
    try {
        const orders = await Order.find();
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch data" });
    }
});

app.post('/api/update-order-status', async (req, res) => {
    const { orderId } = req.body;
    try {
        await Order.updateOne({ id: parseInt(orderId) }, { status: 'ready' });
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send("Update failed");
    }
});

app.post('/api/clear-orders', async (req, res) => {
    try {
        await Order.deleteMany({});
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send("Clear failed");
    }
});

// --- DIET & NURSE API ROUTES ---
app.post('/api/save-diet', async (req, res) => {
    const { patientId, allowedFoods, avoidFoods } = req.body;
    try {
        await Diet.findOneAndUpdate({ patientId }, { allowedFoods, avoidFoods, lastUpdated: Date.now() }, { upsert: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).send("Diet save failed");
    }
});

app.get('/api/get-diet/:patientId', async (req, res) => {
    try {
        const diet = await Diet.findOne({ patientId: req.params.patientId });
        res.json(diet || { allowedFoods: "", avoidFoods: "" });
    } catch (err) {
        res.status(500).send("Fetch failed");
    }
});

app.post('/api/save-night-rounds', async (req, res) => {
    const { patientId, rounds } = req.body;
    try {
        await NightRound.findOneAndUpdate({ patientId }, { rounds }, { upsert: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).send("Rounds save failed");
    }
});

app.get('/api/get-night-rounds/:patientId', async (req, res) => {
    try {
        const data = await NightRound.findOne({ patientId: req.params.patientId });
        res.json(data ? data.rounds : []);
    } catch (err) {
        res.status(500).send("Fetch failed");
    }
});

// --- LAB SYSTEM ROUTES ---
app.post('/api/lab-register', async (req, res) => {
    try {
        const reportId = `CB-${Math.floor(1000 + Math.random() * 9000)}`;
        const newLab = new LabReport({
            reportId: reportId,
            patientName: req.body.name,
            phone: req.body.phone,
            testName: req.body.test,
            vialId: (req.body.vialId || 'N/A').toUpperCase().trim()
        });
        await newLab.save();

        const labEnquiry = new Enquiry({
            senderName: req.body.name,
            phoneNumber: req.body.phone,
            subject: `Lab Test Registration - ${req.body.test}`,
            message: `Lab enquiry initiated. Report ID: ${reportId}, Vial ID: ${req.body.vialId || 'N/A'}`
        });
        await labEnquiry.save();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Lab registration failed" });
    }
});

app.get('/api/lab-queue', async (req, res) => {
    try {
        const reports = await LabReport.find().sort({ date: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch queue" });
    }
});

app.post('/api/lab-update-status', async (req, res) => {
    try {
        const { reportId, status } = req.body;
        await LabReport.updateOne({ reportId }, { status });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Status update failed" });
    }
});

app.post('/api/save-lab-report', async (req, res) => {
    try {
        const { vialId, reportData, results } = req.body;
        const finalResults = results || reportData || ""; 
        
        const updatedReport = await LabReport.findOneAndUpdate(
            { vialId: vialId.toUpperCase().trim() },
            { results: finalResults, status: 'Completed' },
            { new: true, upsert: false }
        );

        if (!updatedReport) {
            return res.status(404).json({ success: false, error: "Active vial record assignment mismatch." });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: "Database reporting operational fault." });
    }
});

app.get('/api/get-lab-report/:vialId', async (req, res) => {
    try {
        const vialId = req.params.vialId.toUpperCase().trim();
        const report = await LabReport.findOne({ vialId });
        
        if (report) {
            const accessEnquiry = new Enquiry({
                senderName: report.patientName || "Unknown Patient",
                phoneNumber: report.phone || "N/A",
                subject: `Lab Enquiry Report Lookup`,
                message: `Lab report information retrieved for Test: ${report.testName} via Vial ID: ${vialId}. Current Status: ${report.status}.`
            });
            await accessEnquiry.save();

            res.json({ reportData: report.results, results: report.results, status: report.status, testName: report.testName, patientName: report.patientName });
        } else {
            res.status(404).json({ message: "No report found matching this vial parameter setup." });
        }
    } catch (err) {
        res.status(500).json({ error: "Operational reporting lookup exception." });
    }
});

app.get('/api/check-report/:id', (req, res) => {
    const patientId = req.params.id.toUpperCase();
    const filePath = path.join(__dirname, 'uploads', `Report_${patientId}.pdf`);
    res.json({ available: fs.existsSync(filePath) });
});

app.get('/api/reports/:id', (req, res) => {
    const patientId = req.params.id.toUpperCase();
    const filePath = path.join(__dirname, 'uploads', `Report_${patientId}.pdf`);

    if (fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).send('Report file not found.');
});

// --- GENERAL ENQUIRY ROUTES ---
app.post('/api/external-enquiry', async (req, res) => {
    try {
        const { senderName, phoneNumber, subject, message } = req.body;
        const newEnquiry = new Enquiry({ senderName, phoneNumber, subject, message });
        await newEnquiry.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to log enquiry" });
    }
});

app.get('/api/get-enquiries', async (req, res) => {
    try {
        const enquiries = await Enquiry.find().sort({ timestamp: -1 });
        res.json(enquiries);
    } catch (err) {
        res.status(500).send("Fetch failed");
    }
});

app.post('/api/delete-enquiry', async (req, res) => {
    try {
        await Enquiry.findByIdAndDelete(req.body.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// --- IN-HOUSE TELE-CONSULTATION MAPS ---
app.post('/api/request-consultation', (req, res) => {
    const { room, pId, healthIssues, meetUrl } = req.body;
    const newRequest = { 
        room, pId, healthIssues: healthIssues || "None",
        meetUrl: meetUrl || `https://meet.jit.si/CareBite-Room-${room}`,
        time: new Date().toLocaleTimeString() 
    };
    activeConsultations = activeConsultations.filter(c => c.pId !== pId);
    activeConsultations.push(newRequest);
    res.json({ success: true });
});

app.get('/api/get-consultations', (req, res) => {
    res.json(activeConsultations);
});

app.post('/api/clear-consultation', (req, res) => {
    activeConsultations = activeConsultations.filter(c => c.pId !== req.body.pId);
    res.json({ success: true });
});

// --- CHATBOT GPT ASSISTANT ---
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ reply: "Please type something." });

        const result = await model.generateContent(message);
        res.json({ reply: result.response.text() });
    } catch (error) {
        res.status(500).json({ reply: "I'm having trouble thinking right now." });
    }
});

// --- PRESCRIPTION MATRIX ENDPOINTS ---
app.post('/api/send-prescription', async (req, res) => {
    try {
        const { doctor, patientInfo, clinicalNotes, medications, date, pdfDocumentData } = req.body;
        const newPrescription = new Prescription({
            id: 'RX-' + Date.now(), doctor, patientInfo, clinicalNotes, medications, date, pdfDocumentData
        });
        await newPrescription.save();
        res.status(200).json({ success: true, message: "Prescription document parsed and saved successfully." });
    } catch (err) {
        res.status(500).json({ error: "Internal processing database fault." });
    }
});

app.get('/api/get-prescriptions', async (req, res) => {
    try {
        const data = await Prescription.find().sort({ timestamp: -1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Failed to query prescription stream" });
    }
});

// --- VEHICLE SECURITY PARKING ENDPOINTS ---
app.post('/api/register-vehicle', async (req, res) => {
    try {
        const { ownerName, vehicleNumber, vehicleType, contactNumber } = req.body;
        if (!vehicleNumber) return res.status(400).json({ error: "Vehicle plate number is mandatory." });

        const newVehicle = new Vehicle({
            ownerName: ownerName || "Visitor",
            vehicleNumber: vehicleNumber.toUpperCase().trim(),
            vehicleType: vehicleType || 'Four-Wheeler',
            contactNumber: contactNumber || 'N/A',
            status: 'Inside',
            entryTime: new Date()
        });

        await newVehicle.save();
        res.status(201).json({ success: true, message: "Vehicle details securely saved to database." });
    } catch (err) {
        res.status(500).json({ error: "Failed to commit vehicle registration entry to cluster." });
    }
});

app.get('/api/get-vehicles', async (req, res) => {
    try {
        const vehicles = await Vehicle.find().sort({ entryTime: -1 });
        res.json(vehicles);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch vehicle logs from server database." });
    }
});

app.post('/api/checkout-vehicle', async (req, res) => {
    try {
        const { vehicleNumber } = req.body;
        if (!vehicleNumber) return res.status(400).json({ error: "Missing plate number." });

        const updated = await Vehicle.findOneAndUpdate(
            { vehicleNumber: vehicleNumber.toUpperCase().trim(), status: 'Inside' },
            { status: 'Checked Out', exitTime: new Date() },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Vehicle plate not found inside." });
        res.json({ success: true, message: "Exit time stamp logged." });
    } catch (err) {
        res.status(500).json({ error: "Failed processing departure update." });
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