require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const nodemailer = require('nodemailer');

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

const transporter = nodemailer.createTransporter({
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

Your leave request (ID: ${request.id}) has been approved.
Aapka application approve ho gaya hai. (Your application has been approved.)

Leave period: ${request.fromDate} to ${request.toDate}
Room: ${request.roomNumber}

Please carry your printed pass and QR code for verification.

This email was sent from: ${EMAIL_FROM}

Best wishes,
Hostel Administration`;

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: toEmail,
      subject,
      text: body,
    });
    console.log(`Approval email sent to ${toEmail}`);
  } catch (err) {
    console.error('Failed to send approval email:', err);
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

  db.data.requests[idx] = {
    ...db.data.requests[idx],
    status,
    updatedAt: new Date().toISOString(),
  };
  await db.write();

  if (status === 'Approved') {
    await sendApprovalEmail(db.data.requests[idx]);
  }

  return res.json({ ok: true, request: db.data.requests[idx] });
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
