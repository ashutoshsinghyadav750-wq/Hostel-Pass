require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT == 465,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, 'hostelpass.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

async function initDb() {
  await db.read();
  db.data = db.data || { requests: [] };
  if (!Array.isArray(db.data.requests)) {
    db.data.requests = [];
  }
  await db.write();
}

initDb().catch((err) => {
  console.error('Failed to initialize DB', err);
  process.exit(1);
});

function requireApiKey(req, res, next) {
  const header = req.header('x-api-key');
  if (!API_KEY || header !== API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid or missing API key' });
  }
  return next();
}

async function sendApprovalEmail(request) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('Email not configured, skipping send');
    return;
  }
  const toEmail = request.studentEmail;
  if (!toEmail) return;

  const subject = `Hostel Leave Request ${request.id} Approved`;
  const body = `Dear ${request.name},

Your leave request has been approved. You may leave the hostel now.

Approved leave period: ${request.fromDate} to ${request.toDate}
Room: ${request.roomNumber}

Please carry your printed pass and QR code for verification.
The approved application form is attached as a PDF.

We wish you a safe journey and a pleasant trip.

Best regards,
Hostel Administration
${EMAIL_FROM}`;

  try {
    const pdfBuffer = await buildApprovedRequestPdf(request);
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: toEmail,
      subject,
      text: body,
      attachments: [
        {
          filename: `Approved_Leave_Form_${request.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
    console.log(`Approval email sent to ${toEmail}`);
  } catch (err) {
    console.error('Failed to send approval email:', err);
  }
}

function normalizePhoneNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (String(phone).trim().startsWith('+')) return String(phone).trim();
  return '';
}

function buildApprovedRequestPdf(request) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('HOSTEL LEAVE APPLICATION (APPROVED)', { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(10).text(`Request ID: ${request.id || '-'}`);
    doc.text(`Status: ${request.status || 'Approved'}`);
    doc.text(`Approved On: ${new Date().toLocaleString()}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Student Details');
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`Name: ${request.name || '-'}`);
    doc.text(`Roll Number: ${request.rollNumber || '-'}`);
    doc.text(`Branch: ${request.branch || '-'}`);
    doc.text(`Room Number: ${request.roomNumber || '-'}`);
    doc.text(`Student Phone: ${request.studentPhone || '-'}`);
    doc.text(`Student Email: ${request.studentEmail || '-'}`);
    doc.text(`Parent Phone: ${request.parentPhone || '-'}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Leave Details');
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`Leave Type: ${request.leaveType || '-'}`);
    doc.text(`Reason: ${request.reason || '-'}`);
    doc.text(`From Date: ${request.fromDate || '-'}`);
    doc.text(`To Date: ${request.toDate || '-'}`);
    doc.text(`Time (Out): ${request.leaveTime || '-'}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Address During Leave');
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`Address: ${request.address || '-'}`);
    doc.text(`City: ${request.city || '-'}`);
    doc.text(`State: ${request.state || '-'}`);

    doc.end();
  });
}

async function sendApprovalSms(request) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.warn('Twilio SMS not configured, skipping SMS send');
    return;
  }

  const toPhone = normalizePhoneNumber(request.studentPhone);
  if (!toPhone) {
    console.warn('Student phone number missing/invalid, skipping SMS send');
    return;
  }

  const body = `HostelPass: Dear ${request.name || 'Student'}, your leave request ${request.id} is APPROVED. Leave: ${request.fromDate} to ${request.toDate}.`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const payload = new URLSearchParams({
    To: toPhone,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Twilio HTTP ${response.status}: ${errText}`);
    }
    console.log(`Approval SMS sent to ${toPhone}`);
  } catch (err) {
    console.error('Failed to send approval SMS:', err.message || err);
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));

app.post('/api/requests', async (req, res) => {
  const r = req.body;
  if (!r || !r.id || !r.name || !r.rollNumber) {
    return res.status(400).json({ ok: false, message: 'Invalid payload' });
  }
  const now = new Date().toISOString();
  const obj = {
    ...r,
    declarationAccepted: Boolean(r.declarationAccepted),
    status: r.status || 'Pending',
    createdAt: r.createdAt || now,
    updatedAt: now,
  };

  await db.read();
  const existingIndex = db.data.requests.findIndex((x) => x.id === obj.id);
  if (existingIndex !== -1) {
    db.data.requests[existingIndex] = { ...db.data.requests[existingIndex], ...obj };
  } else {
    db.data.requests.unshift(obj);
  }
  await db.write();

  return res.json({ ok: true, request: obj });
});

app.get('/api/requests', requireApiKey, async (req, res) => {
  await db.read();
  const rows = [...db.data.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ ok: true, requests: rows });
});

app.patch('/api/requests/:id/status', requireApiKey, async (req, res) => {
  const id = req.params.id;
  const status = req.body.status;
  if (!id || !status) {
    return res.status(400).json({ ok: false, message: 'Request id and status are required' });
  }
  await db.read();
  const idx = db.data.requests.findIndex((x) => x.id === id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, message: 'Request not found' });
  }

  const previousStatus = db.data.requests[idx].status;
  db.data.requests[idx] = {
    ...db.data.requests[idx],
    status,
    updatedAt: new Date().toISOString(),
  };
  await db.write();

  if (status === 'Approved' && previousStatus !== 'Approved') {
    await Promise.allSettled([
      sendApprovalEmail(db.data.requests[idx]),
      sendApprovalSms(db.data.requests[idx]),
    ]);
  }

  return res.json({ ok: true, request: db.data.requests[idx] });
});

app.delete('/api/requests/:id', requireApiKey, async (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Request id is required' });
  }
  await db.read();
  const before = db.data.requests.length;
  db.data.requests = db.data.requests.filter((x) => x.id !== id);
  if (db.data.requests.length === before) {
    return res.status(404).json({ ok: false, message: 'Request not found' });
  }
  await db.write();
  return res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const body = req.body;
  if (!body || body.username !== ADMIN_USERNAME || body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, message: 'Invalid admin credentials' });
  }
  return res.json({ ok: true, apiKey: API_KEY });
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`HostelPass backend running: http://localhost:${PORT}`);
  console.log(`API key protected endpoints require x-api-key header`);
});
