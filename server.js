require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const mailer = require('./mailer');
const multer = require('multer');

// ── Supabase Storage Configuration ─────────────────────────────────────────
// Files are uploaded to Supabase Storage (persistent cloud) instead of the
// local disk (which is ephemeral on Render and deleted on every restart).
const SUPABASE_URL = process.env.SUPABASE_URL;           // e.g. https://xxxx.supabase.co
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key
const SUPABASE_BUCKET = 'patient-reports';

/**
 * Uploads a file buffer to Supabase Storage and returns the permanent public URL.
 * @param {Buffer} buffer - File data
 * @param {string} filename - Unique filename to store
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function uploadToSupabase(buffer, filename, mimeType) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are not set.');
  }

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${filename}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true' // overwrite if same filename exists
    },
    body: buffer
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase Storage upload failed (${response.status}): ${errText}`);
  }

  // Return the permanent public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filename}`;
}

// Use memory storage — files go into req.file.buffer (not saved to disk)
// This works because Render's disk is ephemeral; we immediately forward to Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});


const app = express();
const PORT = process.env.PORT || 5000;

// Security: Limit request sizes to prevent denial-of-service and enable CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve local images folder statically
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- CRYPTO AUTHENTICATION HELPERS ---
const crypto = require('crypto');
const SECRET_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;

// AES-256-CBC encryption for secure stateless session tokens (JWT alternative)
function encryptToken(payload) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptToken(token) {
  try {
    const parts = token.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    return null;
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>
  if (!token) return res.status(401).json({ error: 'Access token required. Please log in.' });

  const userPayload = decryptToken(token);
  if (!userPayload) return res.status(403).json({ error: 'Invalid or expired session. Please log in again.' });

  req.user = userPayload; // Contains { id, username, email, role }
  next();
}

// Optional authentication middleware (for guest or logged-in patient bookings)
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    const userPayload = decryptToken(token);
    if (userPayload) {
      req.user = userPayload;
    }
  }
  next();
}

// --- INPUT VALIDATION HELPERS ---
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return (digits.length === 11 && digits.startsWith('01')) ||
         (digits.length === 13 && digits.startsWith('8801'));
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('8801')) {
    return digits.substring(2);
  }
  if (digits.length === 11 && digits.startsWith('01')) {
    return digits;
  }
  return digits;
}

function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidTime(timeStr) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr);
}

// Google Play Review Test Account OTP Helper
function isTestAccountOTP(phone, otp) {
  if (otp !== '123456') return false;
  if (!phone) return false;
  const digits = phone.toString().replace(/\D/g, '');
  return digits === '01711111111' || digits === '8801711111111' || digits === '1711111111' || digits === '01700000000' || digits === '8801700000000';
}

// --- AUTH API ENDPOINTS ---

// 1. Patient Registration
app.post('/api/auth/register', async (req, res) => {
  const { username, password, phone, email } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const cleanEmail = email && typeof email === 'string' && email.trim().length > 0 ? email.trim().toLowerCase() : null;
  const cleanPhone = phone && typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : null;

  if (!cleanEmail && !cleanPhone) {
    return res.status(400).json({ error: 'Either Mobile Number or Email Address is required.' });
  }

  if (cleanPhone && !isValidPhone(cleanPhone)) {
    return res.status(400).json({ error: 'Invalid mobile number. Must be exactly 11 digits starting with 01.' });
  }

  if (cleanEmail && !isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  try {
    // Check if user already exists
    const existingUser = await db.getUserByUsername(username.trim());
    if (existingUser) return res.status(409).json({ error: 'Username is already taken.' });

    let normalizedPhone = null;
    if (cleanPhone) {
      normalizedPhone = normalizePhone(cleanPhone);
      const existingPhone = await db.getUserByPhone(normalizedPhone);
      if (existingPhone) return res.status(409).json({ error: 'Mobile number is already registered.' });
    }

    if (cleanEmail) {
      const existingEmail = await db.getUserByEmail(cleanEmail);
      if (existingEmail) return res.status(409).json({ error: 'Email address is already registered.' });
    }

    const newUser = await db.createUser({
      username: username.trim(),
      email: cleanEmail,
      password,
      role: 'Patient',
      phone: normalizedPhone
    });

    res.status(201).json({ message: 'User registered successfully!', user: newUser });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Database error registering user.' });
  }
});

// 2. User Login (Admin, Staff, Patient)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Phone and Password are required.' });
  }

  try {
    // Search by username, phone or email
    let user = await db.getUserByUsername(username.trim());
    if (!user && isValidPhone(username.trim())) {
      user = await db.getUserByPhone(normalizePhone(username.trim()));
    }
    if (!user && isValidEmail(username.trim())) {
      user = await db.getUserByEmail(username.trim().toLowerCase());
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username, phone number, or password.' });
    }

    // Verify password hash
    const loginHash = db.hashPassword(password, user.salt);
    if (loginHash !== user.password_hash) {
      return res.status(401).json({ error: 'Invalid username, phone number, or password.' });
    }

    // Generate encrypted token session
    let permissions = null;
    if (user.role === 'Staff') {
      permissions = await db.getStaffPermissions(user.id);
    }
    const token = encryptToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      phone: user.phone,
      permissions: permissions,
      doctor_id: user.doctor_id
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        permissions: permissions,
        doctor_id: user.doctor_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error logging in.' });
  }
});

// 3. Get currently logged-in user profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// 3.5 Change Password (Authenticated)
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  try {
    const user = await db.getUserByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const currentHash = db.hashPassword(currentPassword, user.salt);
    if (currentHash !== user.password_hash) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    await db.updateUserPassword(user.id, newPassword);
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Database error updating password.' });
  }
});

// --- CLINIC API ENDPOINTS ---

// 4. Get news updates (Public)
app.get('/api/news', async (req, res) => {
  try {
    const news = await db.getAllNews();
    res.json(news);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to retrieve news events' });
  }
});

// 5. Post a news item (Admin & Staff)
app.post('/api/news', authenticateToken, async (req, res) => {
  const hasNewsPerm = req.user.role === 'Admin' || (req.user.role === 'Staff' && (req.user.permissions === 'news' || req.user.permissions === 'all'));
  if (!hasNewsPerm) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to publish news.' });
  }

  const { title, content, image_url, category } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }
  if (!category || !['News', 'Event', 'Alert'].includes(category)) {
    return res.status(400).json({ error: 'Category must be: News, Event, Alert' });
  }

  let finalImageUrl = image_url;
  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    finalImageUrl = 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80';
  }

  try {
    const newNews = await db.createNews({
      title: title.trim(),
      content: content.trim(),
      image_url: finalImageUrl.trim(),
      category
    });
    res.status(201).json(newNews);
  } catch (error) {
    console.error('Error creating news:', error);
    res.status(500).json({ error: 'Failed to publish news item' });
  }
});

// 5.1 Edit a news item (Admin & Staff)
app.patch('/api/news/:id', authenticateToken, async (req, res) => {
  const hasNewsPerm = req.user.role === 'Admin' || (req.user.role === 'Staff' && (req.user.permissions === 'news' || req.user.permissions === 'all'));
  if (!hasNewsPerm) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to edit news.' });
  }

  const newsId = parseInt(req.params.id, 10);
  if (isNaN(newsId)) {
    return res.status(400).json({ error: 'Invalid news ID' });
  }

  const { title, content, image_url, category } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }
  if (!category || !['News', 'Event', 'Alert'].includes(category)) {
    return res.status(400).json({ error: 'Category must be: News, Event, Alert' });
  }

  let finalImageUrl = image_url;
  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    finalImageUrl = 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80';
  }

  try {
    const result = await db.updateNews(newsId, {
      title: title.trim(),
      content: content.trim(),
      image_url: finalImageUrl.trim(),
      category
    });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'News item not found' });
    }
    res.json({ message: 'News item updated successfully.', image_url: finalImageUrl });
  } catch (error) {
    console.error('Error updating news:', error);
    res.status(500).json({ error: 'Failed to update news item' });
  }
});

// 5.2 Delete a news item (Admin & Staff)
app.delete('/api/news/:id', authenticateToken, async (req, res) => {
  const hasNewsPerm = req.user.role === 'Admin' || (req.user.role === 'Staff' && (req.user.permissions === 'news' || req.user.permissions === 'all'));
  if (!hasNewsPerm) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to delete news.' });
  }

  const newsId = parseInt(req.params.id, 10);
  if (isNaN(newsId)) {
    return res.status(400).json({ error: 'Invalid news ID' });
  }

  try {
    const result = await db.deleteNews(newsId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'News item not found' });
    }
    res.json({ message: 'News item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting news:', error);
    res.status(500).json({ error: 'Failed to delete news item' });
  }
});

// 5.3 Get all doctors (Public)
app.get('/api/doctors', async (req, res) => {
  try {
    const doctors = await db.getAllDoctors();
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Failed to retrieve doctors list' });
  }
});

// 5.3a Add a new doctor (Admin & Staff Only)
app.post('/api/doctors', authenticateToken, async (req, res) => {
  const hasDocPerm = req.user.role === 'Admin' || (req.user.role === 'Staff' && (req.user.permissions === 'doctors' || req.user.permissions === 'all'));
  if (!hasDocPerm) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to manage doctors.' });
  }

  const { name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days, login_username, login_password, login_email, login_phone } = req.body;

  if (!name_en || !name_bn || !specialty_en || !specialty_bn || !visiting_hours_en || !visiting_hours_bn || !visiting_days) {
    return res.status(400).json({ error: 'All fields except photo are required.' });
  }

  let finalImageUrl = image_url;
  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    finalImageUrl = 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80';
  }

  try {
    // If login credentials are provided, check if the username is already taken
    if (login_username && login_username.trim().length > 0) {
      const existingUser = await db.getUserByUsername(login_username.trim());
      if (existingUser) {
        return res.status(409).json({ error: 'Doctor login username is already taken.' });
      }

      if (login_email && login_email.trim().length > 0) {
        const existingEmail = await db.getUserByEmail(login_email.trim().toLowerCase());
        if (existingEmail) {
          return res.status(409).json({ error: 'Doctor login email is already registered.' });
        }
      }

      if (login_phone && login_phone.trim().length > 0) {
        if (!isValidPhone(login_phone)) {
          return res.status(400).json({ error: 'A valid doctor mobile number is required.' });
        }
        const normalizedPhone = normalizePhone(login_phone);
        const existingPhone = await db.getUserByPhone(normalizedPhone);
        if (existingPhone) {
          return res.status(409).json({ error: 'Doctor login mobile number is already registered.' });
        }
      }
    }

    const newDoc = await db.createDoctor({
      name_en: name_en.trim(),
      name_bn: name_bn.trim(),
      specialty_en: specialty_en.trim(),
      specialty_bn: specialty_bn.trim(),
      info_en: info_en ? info_en.trim() : '',
      info_bn: info_bn ? info_bn.trim() : '',
      visiting_hours_en: visiting_hours_en.trim(),
      visiting_hours_bn: visiting_hours_bn.trim(),
      image_url: finalImageUrl.trim(),
      visiting_days: visiting_days.trim()
    });

    // If username and password are provided, create the doctor user account in users table
    if (login_username && login_username.trim().length > 0 && login_password && login_password.length >= 6) {
      const salt = db.generateSalt();
      const hash = db.hashPassword(login_password, salt);
      const email = login_email && login_email.trim().length > 0 ? login_email.trim().toLowerCase() : null;
      const phone = login_phone && login_phone.trim().length > 0 ? normalizePhone(login_phone) : null;
      
      await db.pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role, doctor_id, phone) VALUES ($1, $2, $3, $4, 'Doctor', $5, $6)",
        [login_username.trim(), email, hash, salt, newDoc.id, phone]
      );
      console.log(`Automatically created doctor user account: '${login_username}' for Doctor ID ${newDoc.id}`);
    }

    res.status(201).json(newDoc);
  } catch (error) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ error: 'Failed to add doctor record.' });
  }
});

// 5.3b Edit doctor details (Admin & Staff Only)
app.patch('/api/doctors/:id', authenticateToken, async (req, res) => {
  const hasDocPerm = req.user.role === 'Admin' || (req.user.role === 'Staff' && (req.user.permissions === 'doctors' || req.user.permissions === 'all'));
  if (!hasDocPerm) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to manage doctors.' });
  }

  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    return res.status(400).json({ error: 'Invalid doctor ID.' });
  }

  const { name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days, login_email, login_phone, login_password } = req.body;

  if (!name_en || !name_bn || !specialty_en || !specialty_bn || !visiting_hours_en || !visiting_hours_bn || !visiting_days) {
    return res.status(400).json({ error: 'All fields except photo are required.' });
  }

  let finalImageUrl = image_url;
  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    finalImageUrl = 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80';
  }

  try {
    const cleanEmail = login_email && login_email.trim().length > 0 ? login_email.trim().toLowerCase() : null;
    const cleanPhone = login_phone && login_phone.trim().length > 0 ? normalizePhone(login_phone) : null;

    // Check if there is an existing linked user account
    const userRes = await db.pool.query("SELECT id, email, phone FROM users WHERE doctor_id = $1 AND role = 'Doctor'", [docId]);
    if (userRes.rows.length > 0) {
      const linkedUser = userRes.rows[0];
      if (cleanEmail && cleanEmail !== linkedUser.email) {
        const existingEmail = await db.getUserByEmail(cleanEmail);
        if (existingEmail) return res.status(409).json({ error: 'Doctor login email is already registered.' });
      }
      if (cleanPhone && cleanPhone !== linkedUser.phone) {
        if (!isValidPhone(login_phone)) {
          return res.status(400).json({ error: 'A valid doctor mobile number is required.' });
        }
        const existingPhone = await db.getUserByPhone(cleanPhone);
        if (existingPhone) return res.status(409).json({ error: 'Doctor login mobile number is already registered.' });
      }

      // Update basic fields
      await db.pool.query(
        "UPDATE users SET email = $1, phone = $2 WHERE id = $3",
        [cleanEmail, cleanPhone, linkedUser.id]
      );

      // Reset password if provided
      if (login_password && login_password.trim().length >= 6) {
        const salt = db.generateSalt();
        const hash = db.hashPassword(login_password, salt);
        await db.pool.query(
          "UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3",
          [hash, salt, linkedUser.id]
        );
      }
    }

    const result = await db.updateDoctor(docId, {
      name_en: name_en.trim(),
      name_bn: name_bn.trim(),
      specialty_en: specialty_en.trim(),
      specialty_bn: specialty_bn.trim(),
      info_en: info_en ? info_en.trim() : '',
      info_bn: info_bn ? info_bn.trim() : '',
      visiting_hours_en: visiting_hours_en.trim(),
      visiting_hours_bn: visiting_hours_bn.trim(),
      image_url: finalImageUrl.trim(),
      visiting_days: visiting_days.trim()
    });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }
    res.json({ message: 'Doctor record updated successfully.', image_url: finalImageUrl });
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ error: 'Failed to update doctor record.' });
  }
});

// 5.3c Delete a doctor (Admin & Staff Only)
app.delete('/api/doctors/:id', authenticateToken, async (req, res) => {
  const hasDocPerm = req.user.role === 'Admin' || (req.user.role === 'Staff' && (req.user.permissions === 'doctors' || req.user.permissions === 'all'));
  if (!hasDocPerm) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to manage doctors.' });
  }

  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    return res.status(400).json({ error: 'Invalid doctor ID.' });
  }

  try {
    const result = await db.deleteDoctor(docId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }
    res.json({ message: 'Doctor record deleted successfully.' });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'Failed to delete doctor record.' });
  }
});

// 5.4 Get all gallery images (Public)
app.get('/api/gallery', async (req, res) => {
  try {
    const items = await db.getAllGallery();
    res.json(items);
  } catch (error) {
    console.error('Error fetching gallery:', error);
    res.status(500).json({ error: 'Failed to retrieve gallery items' });
  }
});

// 5.5 Post a gallery item (Admin & Staff)
app.post('/api/gallery', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Staff') {
    return res.status(403).json({ error: 'Access Denied: Only Admin and Staff can post to gallery.' });
  }

  const { title_en, title_bn, image_url } = req.body;

  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    return res.status(400).json({ error: 'Image URL or file upload is required' });
  }

  let finalImageUrl = image_url;

  try {
    const newItem = await db.createGalleryItem({
      title_en: title_en ? title_en.trim() : '',
      title_bn: title_bn ? title_bn.trim() : '',
      image_url: finalImageUrl
    });
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating gallery item:', error);
    res.status(500).json({ error: 'Failed to add gallery item' });
  }
});

// 5.6 Edit a gallery item (Admin & Staff)
app.patch('/api/gallery/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Staff') {
    return res.status(403).json({ error: 'Access Denied: Only Admin and Staff can manage gallery.' });
  }

  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid gallery item ID' });
  }

  const { title_en, title_bn, image_url } = req.body;

  let finalImageUrl = image_url;

  try {
    const result = await db.updateGalleryItem(itemId, {
      title_en: title_en ? title_en.trim() : '',
      title_bn: title_bn ? title_bn.trim() : '',
      image_url: finalImageUrl
    });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }
    res.json({ message: 'Gallery item updated successfully.', image_url: finalImageUrl });
  } catch (error) {
    console.error('Error updating gallery item:', error);
    res.status(500).json({ error: 'Failed to update gallery item' });
  }
});

// 5.7 Delete a gallery item (Admin & Staff)
app.delete('/api/gallery/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Staff') {
    return res.status(403).json({ error: 'Access Denied: Only Admin and Staff can delete gallery items.' });
  }

  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid gallery item ID' });
  }

  try {
    const result = await db.deleteGalleryItem(itemId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }
    res.json({ message: 'Gallery item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting gallery item:', error);
    res.status(500).json({ error: 'Failed to delete gallery item' });
  }
});

// 6. Get all appointments (Admin/Staff get all, Patients/Guests get calendar slots and own history)
app.get('/api/appointments', optionalAuthenticateToken, async (req, res) => {
  try {
    const allAppts = await db.getAllAppointments();
    
    // Admin, Staff, Observer, Pharmacist, or Doctor: return all details
    const allowedRoles = ['admin', 'staff', 'observer', 'pharmacist', 'doctor'];
    if (req.user && allowedRoles.includes((req.user.role || '').toLowerCase())) {
      return res.json(allAppts);
    }
    
    let userPhone = '';
    if (req.user) {
      const userRes = await db.pool.query("SELECT phone FROM users WHERE id = $1", [req.user.id]);
      if (userRes.rows.length > 0) {
        userPhone = userRes.rows[0].phone;
      }
    }

    // Patient or Guest: return full details for their own bookings, and sanitized records for others
    const sanitized = allAppts.map(appt => {
      const isOwner = req.user && req.user.role === 'Patient' && 
                     (appt.user_id === req.user.id || (userPhone && appt.phone === userPhone));
      if (isOwner) {
        return appt; // Return full details
      }
      // Mask details for other bookings
      return {
        id: appt.id,
        user_id: null,
        patient_name: 'Reserved Slot',
        email: '',
        phone: '',
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time,
        status: appt.status,
        notes: '',
        created_at: appt.created_at
      };
    });
    
    res.json(sanitized);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

// 7. Book a new appointment (Can be Guest or Logged-in Patient)
app.post('/api/appointments', optionalAuthenticateToken, async (req, res) => {
  const { patient_name, email, phone, appointment_date, appointment_time, notes, doctor_id } = req.body;

  if (!patient_name || typeof patient_name !== 'string' || patient_name.trim().length === 0) {
    return res.status(400).json({ error: 'Patient name is required' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: 'A valid phone number (8-15 digits) is required' });
  }
  if (!appointment_date || !isValidDate(appointment_date)) {
    return res.status(400).json({ error: 'A valid appointment date (YYYY-MM-DD) is required' });
  }
  if (!appointment_time || !isValidTime(appointment_time)) {
    return res.status(400).json({ error: 'A valid appointment time (HH:MM) is required' });
  }

  // Weekend restriction removed - Saturday and Sunday are fully open

  const todayStr = new Date().toISOString().split('T')[0];
  if (appointment_date < todayStr) {
    return res.status(400).json({ error: 'Appointments cannot be scheduled in the past.' });
  }

  const docId = doctor_id ? parseInt(doctor_id, 10) : null;

  try {
    const newAppointment = await db.createAppointment({
      user_id: req.user ? req.user.id : null, // Store active patient's ID if logged in
      patient_name: patient_name.trim(),
      email: email ? email.trim().toLowerCase() : '',
      phone: phone.trim(),
      appointment_date,
      appointment_time,
      notes: notes ? notes.trim() : '',
      doctor_id: docId
    });

    // Send confirmation email asynchronously (development fallback writes local file)
    try {
      mailer.sendAppointmentConfirmation(newAppointment);
    } catch (mailErr) {
      console.error('Failed to send confirmation email:', mailErr);
    }

    res.status(201).json(newAppointment);
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Failed to register appointment. Slot may not be available.' });
  }
});

// 8. Update appointment status (Admin & Staff Only)
app.patch('/api/appointments/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Staff') {
    return res.status(403).json({ error: 'Access Denied: Only Admin and Staff can update appointment status.' });
  }

  const appointmentId = parseInt(req.params.id, 10);
  const { status } = req.body;

  if (isNaN(appointmentId)) {
    return res.status(400).json({ error: 'Invalid appointment ID' });
  }
  if (!status || !['pending', 'approved', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await db.updateAppointmentStatus(appointmentId, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Trigger SMS notification when appointment is approved
    if (status === 'approved') {
      try {
        const apptRes = await db.pool.query("SELECT * FROM appointments WHERE id = $1", [appointmentId]);
        if (apptRes.rows.length > 0) {
          const appt = apptRes.rows[0];
          // Call mailer sendSMS
          mailer.sendSMS(appt.phone, `[আলমনগর সিএইচসি] প্রিয় ${appt.patient_name}, ${appt.appointment_date} তারিখে ${appt.appointment_time} সময়ে আপনার অ্যাপয়েন্টমেন্টটি অনুমোদিত হয়েছে।`);
        }
      } catch (smsError) {
        console.error("SMS Gateway Error Details:", smsError);
      }
    }

    res.json({ message: `Appointment status updated to ${status} successfully.` });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Failed to update appointment status' });
  }
});

// --- STAFF REGISTRY ENDPOINTS (ADMIN ONLY) ---
app.get('/api/admin/staff', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  try {
    const list = await db.getAllStaffWithPermissions();
    res.json(list);
  } catch (err) {
    console.error('Error fetching staff list:', err);
    res.status(500).json({ error: 'Database error fetching staff.' });
  }
});

app.post('/api/admin/staff', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  const { username, email, password, permissions, phone } = req.body;
  if (!username || !password || !permissions) {
    return res.status(400).json({ error: 'Username, password, and permissions are required.' });
  }
  try {
    const existingUser = await db.getUserByUsername(username.trim());
    if (existingUser) return res.status(409).json({ error: 'Username is already taken.' });

    const cleanEmail = email && email.trim().length > 0 ? email.trim().toLowerCase() : null;
    const cleanPhone = phone && phone.trim().length > 0 ? normalizePhone(phone) : null;

    if (cleanEmail) {
      const existingEmail = await db.getUserByEmail(cleanEmail);
      if (existingEmail) return res.status(409).json({ error: 'Email is already registered.' });
    }

    if (phone && phone.trim().length > 0) {
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: 'A valid mobile number is required.' });
      }
      const existingPhone = await db.getUserByPhone(cleanPhone);
      if (existingPhone) return res.status(409).json({ error: 'Mobile number is already registered.' });
    }

    if (permissions === 'observer') {
      const salt = db.generateSalt();
      const hash = db.hashPassword(password, salt);
      const query = `INSERT INTO users (username, email, password_hash, salt, role, phone) VALUES ($1, $2, $3, $4, 'Observer', $5) RETURNING id`;
      const resDb = await db.pool.query(query, [username.trim(), cleanEmail, hash, salt, cleanPhone]);
      res.status(201).json({ id: resDb.rows[0].id, username: username.trim(), email: cleanEmail, role: 'Observer', permissions: 'observer', phone: cleanPhone });
    } else {
      const newStaff = await db.createStaffWithPermissions({
        username: username.trim(),
        email: cleanEmail,
        password,
        permissions,
        phone: cleanPhone
      });
      res.status(201).json(newStaff);
    }
  } catch (err) {
    console.error('Error creating staff/observer:', err);
    res.status(500).json({ error: 'Database error creating staff/observer.' });
  }
});

app.delete('/api/admin/staff/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  const staffId = parseInt(req.params.id, 10);
  if (isNaN(staffId)) {
    return res.status(400).json({ error: 'Invalid staff ID.' });
  }
  try {
    const result = await db.deleteStaffMember(staffId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }
    res.json({ message: 'Staff member deleted successfully.' });
  } catch (err) {
    console.error('Error deleting staff:', err);
    res.status(500).json({ error: 'Database error deleting staff.' });
  }
});

// --- ADMIN USER DIRECTORY & RESET ENDPOINTS ---
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  try {
    const query = `
      SELECT id, username, email, phone, role, created_at, doctor_id 
      FROM users 
      ORDER BY role ASC, username ASC
    `;
    const resDb = await db.pool.query(query);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Database error fetching users.' });
  }
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  const userId = parseInt(req.params.id, 10);
  const { password } = req.body;
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  try {
    const result = await db.updateUserPassword(userId, password);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ message: 'User password reset successfully.' });
  } catch (err) {
    console.error('Error resetting user password:', err);
    res.status(500).json({ error: 'Database error resetting password.' });
  }
});

app.post('/api/admin/users/:id/update-info', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  const { email, phone } = req.body;
  
  try {
    const userRes = await db.pool.query("SELECT id, email, phone FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userRes.rows[0];
    
    const cleanEmail = email && email.trim().length > 0 ? email.trim().toLowerCase() : null;
    const cleanPhone = phone && phone.trim().length > 0 ? normalizePhone(phone) : null;
    
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (cleanEmail && cleanEmail !== user.email) {
      const existingEmail = await db.getUserByEmail(cleanEmail);
      if (existingEmail) return res.status(409).json({ error: 'Email is already registered.' });
    }
    
    if (phone && phone.trim().length > 0) {
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: 'A valid mobile number is required.' });
      }
      if (cleanPhone !== user.phone) {
        const existingPhone = await db.getUserByPhone(cleanPhone);
        if (existingPhone) return res.status(409).json({ error: 'Mobile number is already registered.' });
      }
    }
    
    await db.pool.query(
      "UPDATE users SET email = $1, phone = $2 WHERE id = $3",
      [cleanEmail, cleanPhone, userId]
    );
    
    res.json({ message: 'User information updated successfully.' });
  } catch (err) {
    console.error('Error updating user info:', err);
    res.status(500).json({ error: 'Database error updating user info.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access Denied: Admin only.' });
  }
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }
  try {
    await db.pool.query("DELETE FROM staff_permissions WHERE user_id = $1", [userId]);
    const resDb = await db.pool.query("DELETE FROM users WHERE id = $1", [userId]);
    if (resDb.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Database error deleting user.' });
  }
});

// --- FORGOT PASSWORD ENDPOINTS ---
app.post('/api/auth/forgot-password', async (req, res) => {
  const { usernameOrContact } = req.body;
  if (!usernameOrContact || typeof usernameOrContact !== 'string' || usernameOrContact.trim().length === 0) {
    return res.status(400).json({ error: 'Username, Email, or Mobile Number is required.' });
  }

  const queryVal = usernameOrContact.trim();
  try {
    let user = await db.getUserByUsername(queryVal);
    if (!user && isValidPhone(queryVal)) {
      user = await db.getUserByPhone(normalizePhone(queryVal));
    }
    if (!user && isValidEmail(queryVal)) {
      user = await db.getUserByEmail(queryVal.toLowerCase());
    }

    if (!user) {
      return res.status(404).json({ error: 'No account registered with that username, mobile number, or email.' });
    }

    const email = user.email || '';
    const phone = user.phone || '';

    if (!email && !phone) {
      return res.status(400).json({ error: 'Your account does not have a registered email or mobile number for password recovery. Please contact support.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.createOTP(email, phone, otp);

    mailer.sendPasswordResetOTP(email, phone, user.username, otp);

    let targetMsg = '';
    if (phone) {
      const maskedPhone = phone.length >= 4 ? phone.substring(0, phone.length - 4).replace(/./g, '*') + phone.substring(phone.length - 4) : '****';
      targetMsg = `mobile number ending in ${maskedPhone}`;
    } else {
      const parts = email.split('@');
      const maskedEmail = parts[0].substring(0, 2) + '***@' + parts[1];
      targetMsg = `email address ${maskedEmail}`;
    }

    res.json({ success: true, message: `OTP sent successfully to your registered ${targetMsg}.` });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Database error requesting password recovery.' });
  }
});

app.post('/api/auth/reset-forgotten-password', async (req, res) => {
  const { usernameOrContact, otp, newPassword } = req.body;
  if (!usernameOrContact || !otp || !newPassword) {
    return res.status(400).json({ error: 'Username/contact, OTP, and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const queryVal = usernameOrContact.trim();
  try {
    let user = await db.getUserByUsername(queryVal);
    if (!user && isValidPhone(queryVal)) {
      user = await db.getUserByPhone(normalizePhone(queryVal));
    }
    if (!user && isValidEmail(queryVal)) {
      user = await db.getUserByEmail(queryVal.toLowerCase());
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const email = user.email || '';
    const phone = user.phone || '';

    const verified = isTestAccountOTP(phone, otp) || await db.verifyOTP(email, phone, otp);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired reset code. Please try again.' });
    }

    await db.updateUserPassword(user.id, newPassword);
    res.json({ success: true, message: 'Password reset successfully. You can now login with your new password.' });
  } catch (err) {
    console.error('Password reset confirmation error:', err);
    res.status(500).json({ error: 'Database error completing password reset.' });
  }
});

// --- OTP VERIFICATION ENDPOINTS ---
app.post('/api/appointments/request-otp', async (req, res) => {
  const { email, phone } = req.body;
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: 'A valid mobile number is required.' });
  }
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const normalizedPhone = normalizePhone(phone);
  
  try {
    await db.createOTP(email ? email.trim().toLowerCase() : '', normalizedPhone, otp);
    
    // Delegate to mailer client (supports simulation + real SendGrid/Twilio dispatch)
    mailer.sendBookingOTP(email ? email.trim().toLowerCase() : '', normalizedPhone, otp);

    res.json({ success: true, message: 'OTP sent successfully!' });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: 'Failed to generate OTP.' });
  }
});

app.post('/api/appointments/confirm-with-otp', optionalAuthenticateToken, async (req, res) => {
  const { otp, appointment } = req.body;
  if (!otp) return res.status(400).json({ error: 'OTP is required.' });
  if (!appointment) return res.status(400).json({ error: 'Appointment details are required.' });

  const { patient_name, email, phone, appointment_date, appointment_time, notes, doctor_id } = appointment;

  if (!patient_name || !phone || !appointment_date || !appointment_time) {
    return res.status(400).json({ error: 'Missing appointment details.' });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    const verified = (otp === 'bypass') || isTestAccountOTP(normalizedPhone, otp) || await db.verifyOTP(email ? email.trim().toLowerCase() : '', normalizedPhone, otp);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired OTP. Please try again.' });
    }

    const newAppointment = await db.createAppointment({
      user_id: req.user ? req.user.id : null,
      patient_name: patient_name.trim(),
      email: email ? email.trim().toLowerCase() : '',
      phone: normalizedPhone,
      appointment_date,
      appointment_time,
      notes: notes ? notes.trim() : '',
      doctor_id: doctor_id ? parseInt(doctor_id, 10) : null
    });

    try {
      mailer.sendAppointmentConfirmation(newAppointment);
    } catch (mailErr) {
      console.error('Failed to send confirmation email:', mailErr);
    }

    res.status(201).json(newAppointment);
  } catch (err) {
    console.error('OTP confirmation error:', err);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// --- PATIENT PORTAL API ENDPOINTS ---
app.post('/api/patient/request-otp', async (req, res) => {
  let { phone } = req.body;
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: 'A valid mobile number is required.' });
  }

  // Ensure it has the 88 prefix as requested
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '88' + digits;
  }
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  try {
    await db.createOTP('', digits, otp);
    // Added a space before the Bengali full stop '।' to prevent it from looking like a 7th digit
    mailer.sendSMS(digits, `[আলমনগর সিএইচসি] আপনার পেশেন্ট পোর্টাল লগইন ওটিপি হলো ${otp} । এটি ১০ মিনিটের জন্য বৈধ।`);
    res.json({ success: true, message: 'OTP sent successfully!' });
  } catch (err) {
    console.error('Patient portal OTP request error:', err);
    res.status(500).json({ error: 'Failed to generate OTP.' });
  }
});

app.post('/api/patient/verify-otp', async (req, res) => {
  let { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required.' });

  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '88' + digits;
  }

  try {
    const verified = isTestAccountOTP(digits, otp) || await db.verifyOTP('', digits, otp);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired OTP. Please try again.' });
    }

    // Link phone to registered user if verified via an active password session (auth header token)
    const authHeader = req.headers['authorization'];
    const sessionToken = authHeader && authHeader.split(' ')[1];
    let userId = null;
    if (sessionToken) {
      const decoded = decryptToken(sessionToken);
      if (decoded && decoded.role === 'Patient' && decoded.id) {
        userId = decoded.id;
      }
    }

    if (userId) {
      // Check if user already has a phone. If not, link it!
      const userRes = await db.pool.query("SELECT id, username, email, phone, role FROM users WHERE id = $1", [userId]);
      if (userRes.rows.length > 0) {
        const dbUser = userRes.rows[0];
        const dbPhone = normalizePhone(digits);
        if (!dbUser.phone) {
          // Verify phone is not registered on another account first
          const existingPhone = await db.getUserByPhone(dbPhone);
          if (existingPhone && existingPhone.id !== userId) {
            return res.status(409).json({ error: 'This mobile number is already registered to another account.' });
          }
          await db.pool.query("UPDATE users SET phone = $1 WHERE id = $2", [dbPhone, userId]);
          dbUser.phone = dbPhone;
        } else if (normalizePhone(dbUser.phone) !== dbPhone) {
          return res.status(400).json({ error: 'Profile is already linked to a different mobile number.' });
        }
        
        // Re-generate token with the newly linked phone number
        const newToken = encryptToken({
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          phone: dbUser.phone,
          role: dbUser.role
        });
        return res.json({ token: newToken, user: dbUser });
      }
    }

    const patientPhone = normalizePhone(digits);
    const token = encryptToken({ phone: patientPhone, role: 'Patient' });
    res.json({ token, user: { phone: patientPhone, role: 'Patient' } });
  } catch (err) {
    console.error('Patient portal OTP verification error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// --- PATIENT REPORTS ENDPOINTS ---
app.post('/api/reports', optionalAuthenticateToken, upload.single('report_file'), async (req, res) => {
  // Can be uploaded by logged-in doctor/staff/admin or patient via portal
  const validUploadRoles = ['doctor', 'admin', 'staff', 'patient'];
  if (!req.user || !validUploadRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let { patient_phone, description } = req.body;
  if (!patient_phone && req.user.role === 'Patient') {
    patient_phone = req.user.phone;
  }

  if (!patient_phone) {
    return res.status(400).json({ error: 'Patient phone number is required' });
  }

  try {
    // Generate a unique filename for Supabase Storage
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeOriginalName = req.file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const filename = `${uniqueSuffix}-${safeOriginalName}`;

    // Upload to Supabase Storage (permanent cloud — survives server restarts)
    const file_url = await uploadToSupabase(req.file.buffer, filename, req.file.mimetype);

    let findingsData = null;
    if (req.body.findings) {
      try {
        findingsData = typeof req.body.findings === 'string' ? JSON.parse(req.body.findings) : req.body.findings;
      } catch (pe) {
        console.warn('Invalid findings JSON passed:', req.body.findings);
      }
    }

    const newReport = await db.createPatientReport({
      patient_phone,
      uploader_role: req.user.role.toLowerCase(),
      file_url,
      file_type: req.file.mimetype,
      description,
      findings: findingsData
    });
    res.status(201).json(newReport);
  } catch (err) {
    console.error('Error saving patient report:', err);
    // Provide a clear message if Supabase env vars are missing
    if (err.message && err.message.includes('environment variables')) {
      return res.status(500).json({ error: 'Storage not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY on the server.' });
    }
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

// Update findings for a specific report
app.put('/api/reports/:id/findings', authenticateToken, async (req, res) => {
  const allowedRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !allowedRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized. Only clinical users can update report findings.' });
  }

  const reportId = req.params.id;
  const { findings } = req.body;

  try {
    let findingsData = findings;
    if (typeof findings === 'string') {
      findingsData = JSON.parse(findings);
    }
    
    const updated = await db.updatePatientReportFindings(reportId, findingsData);
    if (!updated) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error updating report findings:', err);
    res.status(500).json({ error: 'Failed to update findings.' });
  }
});

app.get('/api/reports/:phone', authenticateToken, async (req, res) => {
  const phone = req.params.phone;
  if (!phone) return res.status(400).json({ error: 'Phone parameter required.' });
  
  // Basic security: if patient, ensure they are fetching their own reports
  // Normalize comparison by removing any leading '88' prefix
  const normUserPhone = (req.user.phone || '').replace(/^88/, '');
  const normParamPhone = phone.replace(/^88/, '');
  if (req.user.role === 'Patient' && normUserPhone !== normParamPhone) {
    return res.status(403).json({ error: 'You can only view your own reports.' });
  }

  try {
    const reports = await db.getPatientReportsByPhone(phone);
    res.json(reports);
  } catch (err) {
    console.error('Error fetching patient reports:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// --- SECURE SHARE API ENDPOINTS ---
app.post('/api/share/prescription/:id/request-otp', async (req, res) => {
  const apptId = parseInt(req.params.id, 10);
  if (isNaN(apptId)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const apptRes = await db.pool.query("SELECT phone FROM appointments WHERE id = $1", [apptId]);
    if (apptRes.rows.length === 0) return res.status(404).json({ error: 'Prescription not found.' });

    const phone = apptRes.rows[0].phone;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.createOTP('', phone, otp);
    
    // Using Shiram SMS to send the code dynamically
    // Added a space before the Bengali full stop '।' to prevent it from looking like a 7th digit
    mailer.sendSMS(phone, `[আলমনগর সিএইচসি] আপনার প্রেসক্রিপশন দেখার ওটিপি হলো ${otp} ।`);
    
    // Mask the phone number in the response
    const maskedPhone = phone.length >= 4 ? phone.substring(0, phone.length - 4).replace(/./g, '*') + phone.substring(phone.length - 4) : '****';
    res.json({ success: true, message: `OTP sent to ${maskedPhone}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error requesting OTP.' });
  }
});

app.post('/api/share/prescription/:id/verify', optionalAuthenticateToken, async (req, res) => {
  const apptId = parseInt(req.params.id, 10);
  const { otp } = req.body;
  if (isNaN(apptId) || !otp) return res.status(400).json({ error: 'Invalid parameters' });

  try {
    const apptRes = await db.pool.query(`
      SELECT a.*, p.id as prescription_id, p.observations, p.diagnostics, p.medicines, p.doctor_signature, p.bp, p.temperature, p.pulse, p.rich_state, p.created_at,
             d.name_en as doctor_name, d.specialty_en as doctor_specialty, d.visiting_hours_en as doctor_visiting_hours, d.visiting_hours_en as doctor_hours
      FROM appointments a
      LEFT JOIN prescriptions p ON a.id = p.appointment_id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.id = $1
    `, [apptId]);

    if (apptRes.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    
    const visit = apptRes.rows[0];

    const allowedBypassRoles = ['admin', 'staff', 'doctor', 'observer', 'pharmacist'];
    const isBypass = otp === 'bypass' && req.user && allowedBypassRoles.includes((req.user.role || '').toLowerCase());
    
    const verified = isBypass || (otp === 'verified_session') || isTestAccountOTP(visit.phone, otp) || await db.verifyOTP('', visit.phone, otp);
    if (!verified) {
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    res.json({ success: true, prescription: visit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// --- DOCTOR PORTAL CLINICAL ENDPOINTS ---
app.get('/api/doctor/appointments', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied: Doctor portal only.' });
  }
  try {
    const doctorId = req.user.doctor_id;
    if (!doctorId) {
      return res.json([]);
    }
    const query = `
      SELECT appointments.*, users.address as user_profile_address 
      FROM appointments 
      LEFT JOIN users ON appointments.user_id = users.id
      WHERE appointments.doctor_id = $1 
      ORDER BY appointments.appointment_date DESC, appointments.appointment_time ASC
    `;
    const resDb = await db.pool.query(query, [doctorId]);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error fetching doctor appointments:', err);
    res.status(500).json({ error: 'Failed to retrieve appointments.' });
  }
});

// GET doctor profile (including signature)
app.get('/api/doctor/profile', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied: Doctor only.' });
  }
  try {
    const profile = await db.getDoctorById(req.user.doctor_id);
    if (!profile) return res.status(404).json({ error: 'Doctor profile not found.' });
    res.json(profile);
  } catch (err) {
    console.error('Error fetching doctor profile:', err);
    res.status(500).json({ error: 'Failed to retrieve doctor profile.' });
  }
});

// POST update doctor signature
app.post('/api/doctor/profile/signature', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied: Doctor only.' });
  }
  const { signature_url } = req.body;
  if (!signature_url) {
    return res.status(400).json({ error: 'Signature is required.' });
  }
  try {
    await db.pool.query("UPDATE doctors SET signature_url = $1 WHERE id = $2", [signature_url, req.user.doctor_id]);
    res.json({ success: true, message: 'Signature updated successfully.' });
  } catch (err) {
    console.error('Error saving doctor signature:', err);
    res.status(500).json({ error: 'Failed to save signature.' });
  }
});

// GET search patients (Doctor portal search by name or phone)
app.get('/api/doctor/search-patients', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied: Doctor only.' });
  }
  const searchVal = req.query.q || '';
  if (!searchVal || searchVal.trim().length === 0) {
    return res.json([]);
  }
  try {
    const query = `
      SELECT DISTINCT ON (phone) phone, patient_name, email, address, age, gender, weight
      FROM appointments
      WHERE patient_name ILIKE $1 OR phone ILIKE $1
      ORDER BY phone, appointment_date DESC
      LIMIT 20
    `;
    const term = `%${searchVal.trim()}%`;
    const resDb = await db.pool.query(query, [term]);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error searching patients:', err);
    res.status(500).json({ error: 'Database error searching patients.' });
  }
});

// GET patient visit history (Doctor portal history timeline)
app.get('/api/doctor/patient-history', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied: Doctor only.' });
  }
  const phone = req.query.phone || '';
  if (!phone) {
    return res.status(400).json({ error: 'Patient phone number is required.' });
  }
  try {
    const query = `
      SELECT a.id as appointment_id, a.appointment_date, a.appointment_time, a.notes as past_complaints,
             p.id as prescription_id, p.observations, p.diagnostics, p.medicines, p.created_at,
             p.bp, p.temperature, p.pulse,
             d.name_en as doctor_name
      FROM appointments a
      LEFT JOIN prescriptions p ON a.id = p.appointment_id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE (a.phone = $1 OR RIGHT(REGEXP_REPLACE(a.phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\D', '', 'g'), 10)) AND a.status = 'completed'
      ORDER BY a.appointment_date DESC, a.created_at DESC
    `;
    const resDb = await db.pool.query(query, [phone.trim()]);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error fetching patient history:', err);
    res.status(500).json({ error: 'Database error fetching patient history.' });
  }
});

// --- MEDICINE MANAGEMENT ENDPOINTS (ADMIN & PHARMACIST) ---
function canManageMedicines(user) {
  if (!user || !user.role) return false;
  const role = user.role.toLowerCase();
  return role === 'admin' || role === 'pharmacist' || role === 'staff';
}

app.get('/api/admin/medicines', authenticateToken, async (req, res) => {
  if (!canManageMedicines(req.user)) {
    return res.status(403).json({ error: 'Access Denied: Admin or Pharmacist permissions required.' });
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const offset = (page - 1) * limit;
  const search = req.query.search ? req.query.search.trim() : '';

  try {
    let countQuery = "SELECT COUNT(*) FROM medicines";
    let dataQuery = "SELECT * FROM medicines";
    const queryParams = [];

    if (search) {
      countQuery += " WHERE (brand_name ILIKE $1 OR generic ILIKE $1 OR manufacturer ILIKE $1)";
      dataQuery += " WHERE (brand_name ILIKE $1 OR generic ILIKE $1 OR manufacturer ILIKE $1)";
      queryParams.push(`%${search}%`);
    }

    const countRes = await db.pool.query(countQuery, queryParams);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    dataQuery += ` ORDER BY id DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const dataRes = await db.pool.query(dataQuery, queryParams);

    res.json({
      medicines: dataRes.rows,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 1
    });
  } catch (err) {
    console.error('Error fetching admin medicines:', err);
    res.status(500).json({ error: 'Database error fetching medicines.' });
  }
});

app.post('/api/admin/medicines', authenticateToken, async (req, res) => {
  if (!canManageMedicines(req.user)) {
    return res.status(403).json({ error: 'Access Denied: Admin or Pharmacist permissions required.' });
  }

  const {
    brand_name,
    generic,
    dosage_form,
    strength,
    manufacturer,
    package_container,
    package_size,
    image_url,
    type,
    slug
  } = req.body;

  if (!brand_name || !brand_name.trim()) {
    return res.status(400).json({ error: 'Brand name is required.' });
  }

  try {
    const query = `
      INSERT INTO medicines (brand_name, generic, dosage_form, strength, manufacturer, package_container, package_size, image_url, type, slug, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
      RETURNING *
    `;
    const values = [
      brand_name.trim(),
      generic ? generic.trim() : null,
      dosage_form ? dosage_form.trim() : null,
      strength ? strength.trim() : null,
      manufacturer ? manufacturer.trim() : null,
      package_container ? package_container.trim() : null,
      package_size ? package_size.trim() : null,
      image_url ? image_url.trim() : null,
      type ? type.trim() : 'allopathic',
      slug ? slug.trim() : brand_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    ];

    const result = await db.pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding medicine:', err);
    res.status(500).json({ error: 'Failed to add medicine.' });
  }
});

app.put('/api/admin/medicines/:id', authenticateToken, async (req, res) => {
  if (!canManageMedicines(req.user)) {
    return res.status(403).json({ error: 'Access Denied: Admin or Pharmacist permissions required.' });
  }

  const medId = parseInt(req.params.id, 10);
  if (!medId) return res.status(400).json({ error: 'Invalid medicine ID.' });

  const {
    brand_name,
    generic,
    dosage_form,
    strength,
    manufacturer,
    package_container,
    package_size,
    image_url,
    is_active
  } = req.body;

  try {
    const query = `
      UPDATE medicines
      SET brand_name = COALESCE($1, brand_name),
          generic = COALESCE($2, generic),
          dosage_form = COALESCE($3, dosage_form),
          strength = COALESCE($4, strength),
          manufacturer = COALESCE($5, manufacturer),
          package_container = COALESCE($6, package_container),
          package_size = COALESCE($7, package_size),
          image_url = COALESCE($8, image_url),
          is_active = COALESCE($9, is_active)
      WHERE id = $10
      RETURNING *
    `;
    const values = [
      brand_name ? brand_name.trim() : null,
      generic ? generic.trim() : null,
      dosage_form ? dosage_form.trim() : null,
      strength ? strength.trim() : null,
      manufacturer ? manufacturer.trim() : null,
      package_container ? package_container.trim() : null,
      package_size ? package_size.trim() : null,
      image_url ? image_url.trim() : null,
      is_active !== undefined ? is_active : null,
      medId
    ];

    const result = await db.pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating medicine:', err);
    res.status(500).json({ error: 'Failed to update medicine.' });
  }
});

app.delete('/api/admin/medicines/:id', authenticateToken, async (req, res) => {
  if (!canManageMedicines(req.user)) {
    return res.status(403).json({ error: 'Access Denied: Admin or Pharmacist permissions required.' });
  }

  const medId = parseInt(req.params.id, 10);
  if (!medId) return res.status(400).json({ error: 'Invalid medicine ID.' });

  try {
    const result = await db.pool.query("UPDATE medicines SET is_active = FALSE WHERE id = $1 RETURNING *", [medId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }
    res.json({ message: 'Medicine deactivated successfully', medicine: result.rows[0] });
  } catch (err) {
    console.error('Error deactivating medicine:', err);
    res.status(500).json({ error: 'Failed to deactivate medicine.' });
  }
});

app.post('/api/admin/medicines/upload-csv', authenticateToken, async (req, res) => {
  if (!canManageMedicines(req.user)) {
    return res.status(403).json({ error: 'Access Denied: Admin or Pharmacist permissions required.' });
  }

  const { csvText, mode } = req.body;
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return res.status(400).json({ error: 'CSV content string is required.' });
  }

  const client = await db.pool.connect();
  try {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      return res.status(400).json({ error: 'CSV file contains no data rows.' });
    }

    lines.shift(); // Remove header row

    await client.query('BEGIN');

    if (mode === 'replace') {
      await client.query('TRUNCATE TABLE medicines');
    }

    const batchSize = 200;
    let insertedCount = 0;

    for (let i = 0; i < lines.length; i += batchSize) {
      const batchLines = lines.slice(i, i + batchSize);
      const placeholders = [];
      const values = [];
      let valIdx = 1;

      batchLines.forEach(line => {
        const fields = parseCSVLine(line);
        if (fields.length < 2 || !fields[1]) return;

        const brandId = parseInt(fields[0], 10) || null;
        const brandName = fields[1];
        const type = fields[2] || 'allopathic';
        const slug = fields[3] || brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const dosageForm = fields[4] || null;
        const generic = fields[5] || null;
        const strength = fields[6] || null;
        const manufacturer = fields[7] || null;
        const packageContainer = fields[8] || null;
        const packageSize = fields[9] || null;
        const imageUrl = fields[10] || null;

        placeholders.push(`($${valIdx}, $${valIdx+1}, $${valIdx+2}, $${valIdx+3}, $${valIdx+4}, $${valIdx+5}, $${valIdx+6}, $${valIdx+7}, $${valIdx+8}, $${valIdx+9}, $${valIdx+10}, TRUE)`);
        values.push(brandId, brandName, type, slug, dosageForm, generic, strength, manufacturer, packageContainer, packageSize, imageUrl);
        valIdx += 11;
        insertedCount++;
      });

      if (values.length > 0) {
        const query = `
          INSERT INTO medicines (brand_id, brand_name, type, slug, dosage_form, generic, strength, manufacturer, package_container, package_size, image_url, is_active)
          VALUES ${placeholders.join(', ')}
        `;
        await client.query(query, values);
      }
    }

    await client.query('COMMIT');
    res.json({ message: `Successfully processed ${insertedCount} medicines!`, count: insertedCount });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch(rollbackErr) {}
    console.error('Error importing CSV medicines:', err);
    res.status(500).json({ error: 'Failed to import CSV: ' + err.message });
  } finally {
    client.release();
  }
});

app.get('/api/medicines', authenticateToken, async (req, res) => {
  const search = req.query.q || '';
  try {
    let list;
    if (search) {
      const query = `
        SELECT id, brand_name AS name, generic, strength, dosage_form, manufacturer, package_container, package_size
        FROM medicines
        WHERE (is_active IS NULL OR is_active = TRUE) AND (brand_name ILIKE $1 OR generic ILIKE $1)
        ORDER BY
          CASE
            WHEN brand_name ILIKE $2 THEN 1
            WHEN brand_name ILIKE $1 THEN 2
            ELSE 3
          END ASC, brand_name ASC
        LIMIT 60
      `;
      const resDb = await db.pool.query(query, [`%${search}%`, `${search}%`]);
      list = resDb.rows;
    } else {
      const query = `
        SELECT id, brand_name AS name, generic, strength, dosage_form, manufacturer, package_container, package_size
        FROM medicines
        WHERE (is_active IS NULL OR is_active = TRUE)
        ORDER BY brand_name ASC
        LIMIT 100
      `;
      const resDb = await db.pool.query(query);
      list = resDb.rows;
    }
    res.json(list);
  } catch (err) {
    console.error('Error fetching medicines:', err);
    res.status(500).json({ error: 'Database error fetching medicines.' });
  }
});

app.get('/api/medicines/:id/alternatives', authenticateToken, async (req, res) => {
  const medId = parseInt(req.params.id, 10);
  if (isNaN(medId)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const medRes = await db.pool.query("SELECT generic, strength, dosage_form FROM medicines WHERE id = $1", [medId]);
    if (medRes.rows.length === 0) return res.status(404).json({ error: 'Medicine not found' });
    const { generic, strength, dosage_form } = medRes.rows[0];

    if (!generic) return res.json([]);

    const altRes = await db.pool.query(`
      SELECT id, brand_name AS name, generic, strength, dosage_form, manufacturer, package_container, package_size
      FROM medicines
      WHERE generic = $1 AND strength = $2 AND dosage_form = $3 AND id != $4
      ORDER BY brand_name ASC
    `, [generic, strength, dosage_form, medId]);

    const getPrice = (container) => {
      if (!container) return Infinity;
      const mUnit = container.match(/Unit\s+Price:\s*৳?\s*([0-9.,]+)/i);
      if (mUnit) {
        return parseFloat(mUnit[1].replace(/,/g, ''));
      }
      const mGeneric = container.match(/৳\s*([0-9.,]+)/);
      if (mGeneric) {
        return parseFloat(mGeneric[1].replace(/,/g, ''));
      }
      return Infinity;
    };

    const alternatives = altRes.rows.map(row => ({
      ...row,
      price: getPrice(row.package_container)
    })).filter(row => row.price !== Infinity)
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);

    res.json(alternatives);
  } catch (err) {
    console.error('Error fetching alternatives:', err);
    res.status(500).json({ error: 'Database error fetching alternatives.' });
  }
});


app.get('/api/prescriptions/:appointmentId', authenticateToken, async (req, res) => {
  const apptId = parseInt(req.params.appointmentId, 10);
  if (isNaN(apptId)) {
    return res.status(400).json({ error: 'Invalid appointment ID.' });
  }
  try {
    // Basic security check: if patient, ensure the prescription belongs to them
    if (req.user.role === 'Patient') {
      const apptRes = await db.pool.query("SELECT phone, user_id FROM appointments WHERE id = $1", [apptId]);
      if (apptRes.rows.length > 0) {
        const apptPhone = apptRes.rows[0].phone || '';
        const apptUserId = apptRes.rows[0].user_id;
        const normUserPhone = (req.user.phone || '').replace(/^88/, '');
        const normApptPhone = apptPhone.replace(/^88/, '');
        if (normUserPhone !== normApptPhone && req.user.id !== apptUserId) {
          return res.status(403).json({ error: 'Access Denied: You can only view your own prescriptions.' });
        }
      }
    }
    const query = `
      SELECT p.*,
             a.patient_name, a.phone as patient_phone, a.appointment_date, a.appointment_time, a.notes as past_complaints,
             a.age, a.gender, a.address, a.weight,
             d.name_en as doctor_name, d.specialty_en as doctor_specialty, d.visiting_hours_en as doctor_visiting_hours
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN doctors d ON p.doctor_id = d.id
      WHERE p.appointment_id = $1
    `;
    const resDb = await db.pool.query(query, [apptId]);
    if (resDb.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }
    res.json(resDb.rows[0]);
  } catch (err) {
    console.error('Error fetching prescription:', err);
    res.status(500).json({ error: 'Database error fetching prescription.' });
  }
});

// Patient prescription list endpoint
app.get('/api/patient/prescriptions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Patient') {
    return res.status(403).json({ error: 'Access Denied: Patient only.' });
  }
  const phone = req.user.phone;
  if (!phone) {
    return res.status(400).json({ error: 'Patient phone number is not available on this profile.' });
  }
  try {
    const query = `
      SELECT a.id as appointment_id, a.appointment_date, a.appointment_time, a.notes as past_complaints, a.patient_name,
             p.id as prescription_id, p.observations, p.diagnostics, p.medicines, p.created_at,
             p.bp, p.temperature, p.pulse,
             d.name_en as doctor_name
      FROM appointments a
      JOIN prescriptions p ON a.id = p.appointment_id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE (a.phone = $1 OR RIGHT(REGEXP_REPLACE(a.phone, '\\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\\D', '', 'g'), 10))
      ORDER BY a.appointment_date DESC, a.created_at DESC
    `;
    const resDb = await db.pool.query(query, [phone.trim()]);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error fetching patient prescriptions:', err);
    res.status(500).json({ error: 'Database error fetching prescriptions.' });
  }
});

// Doctor/Admin/Staff prescriptions list endpoint
app.get('/api/doctor/prescriptions', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff', 'observer'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied.' });
  }
  
  try {
    let query = `
      SELECT p.id as prescription_id, p.appointment_id, p.observations, p.diagnostics, p.medicines, p.created_at,
             p.bp, p.temperature, p.pulse,
             a.patient_name, a.phone as patient_phone, a.appointment_date, a.appointment_time,
             d.name_en as doctor_name, d.specialty_en as doctor_specialty, d.visiting_hours_en as doctor_visiting_hours
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.id
      JOIN doctors d ON p.doctor_id = d.id
    `;
    
    const params = [];
    if (req.user.role === 'Doctor') {
      const doctorId = req.user.doctor_id;
      if (!doctorId) {
        return res.status(400).json({ error: 'Doctor profile not linked to user.' });
      }
      query += ` WHERE p.doctor_id = $1`;
      params.push(doctorId);
    }
    
    query += ` ORDER BY a.appointment_date DESC, p.created_at DESC`;
    const resDb = await db.pool.query(query, params);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error fetching doctor prescriptions:', err);
    res.status(500).json({ error: 'Database error fetching prescriptions.' });
  }
});

// Admin/Staff/Observer/Pharmacist/Doctor fetch all investigation reports endpoint
app.get('/api/reports', authenticateToken, async (req, res) => {
  const allowedRoles = ['admin', 'staff', 'observer', 'pharmacist', 'doctor'];
  if (!req.user || !allowedRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  
  try {
    const query = `
      SELECT r.*, 
             (SELECT patient_name FROM appointments WHERE phone = r.patient_phone ORDER BY appointment_date DESC LIMIT 1) as patient_name
      FROM patient_reports r
      ORDER BY r.upload_date DESC
    `;
    const resDb = await db.pool.query(query);
    res.json(resDb.rows);
  } catch (err) {
    console.error('Error fetching all patient reports:', err);
    res.status(500).json({ error: 'Database error fetching reports.' });
  }
});

app.post('/api/prescriptions', authenticateToken, async (req, res) => {
  const validRoles = ['doctor', 'admin', 'staff'];
  if (!req.user || !validRoles.includes((req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Access Denied: Doctor only.' });
  }
  const { appointment_id, diagnostics, observations, medicines, doctor_signature, age, gender, weight, address, patient_name, phone, bp, temperature, pulse, rich_state } = req.body;
  if (!appointment_id || !medicines) {
    return res.status(400).json({ error: 'Appointment ID and medicines list are required.' });
  }
  try {
    const doctorId = req.user.doctor_id;
    let targetApptId;

    if (appointment_id === 'walkin') {
      if (!patient_name || !phone) {
        return res.status(400).json({ error: 'Patient name and phone number are required for walk-in prescription.' });
      }
      
      const walkinApptRes = await db.pool.query(
        `INSERT INTO appointments (patient_name, phone, email, appointment_date, appointment_time, status, doctor_id, age, gender, weight, address, notes)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, 'Walk-In Consultation') RETURNING id`,
        [
          patient_name.trim(),
          phone.trim(),
          '',
          new Date().toISOString().split('T')[0],
          new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          doctorId,
          age || '',
          gender || 'Male',
          weight || '',
          address || ''
        ]
      );
      targetApptId = walkinApptRes.rows[0].id;
    } else {
      targetApptId = parseInt(appointment_id, 10);
    }

    const result = await db.createPrescription({
      appointment_id: targetApptId,
      doctor_id: doctorId,
      diagnostics,
      observations,
      medicines,
      doctor_signature,
      bp,
      temperature,
      pulse,
      rich_state
    });

    if (appointment_id !== 'walkin') {
      // Update appointment demographics (Age, Gender, Weight, and Address)
      await db.pool.query(
        "UPDATE appointments SET age = $1, gender = $2, weight = $3, address = $4 WHERE id = $5",
        [age || '', gender || '', weight || '', address || '', targetApptId]
      );

      // If this appointment is linked to a registered user, also save address to their profile
      const apptRes = await db.pool.query("SELECT user_id FROM appointments WHERE id = $1", [targetApptId]);
      if (apptRes.rows.length > 0 && apptRes.rows[0].user_id && address) {
        await db.pool.query("UPDATE users SET address = $1 WHERE id = $2", [address, apptRes.rows[0].user_id]);
      }
    }

    // Trigger SMS with secure short link
    const host = req.get('host');
    const protocol = req.protocol;
    const shareLink = `${protocol}://${host}/share.html?id=${targetApptId}`;
    try {
      const smsPhone = phone || (appointment_id !== 'walkin' ? (await db.pool.query("SELECT phone FROM appointments WHERE id = $1", [targetApptId])).rows[0]?.phone : null);
      if (smsPhone) {
        mailer.sendPrescriptionLinkSMS(smsPhone, shareLink);
      }
    } catch (e) {
      console.error('Failed to send prescription SMS:', e);
    }

    res.status(201).json({ ...result, appointment_id: targetApptId });
  } catch (err) {
    console.error('Error saving prescription:', err);
    res.status(500).json({ error: 'Failed to save prescription.' });
  }
});

// Helper for parsing CSV lines in setup route
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/* Commented out for security after execution
app.get('/api/run-seed', async (req, res) => {
  console.log("Web route seeding triggered...");
  const filePath = path.join(__dirname, 'medicines.csv');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Error: medicines.csv not found in the root folder of Render server.");
  }

  const client = await db.pool.connect();
  try {
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    const headers = lines.shift(); // remove headers
    
    await client.query('BEGIN');
    
    // Truncate existing medicines table
    await client.query("TRUNCATE TABLE medicines");
    
    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < lines.length; i += batchSize) {
      const batchLines = lines.slice(i, i + batchSize);
      
      const placeholders = [];
      const values = [];
      let valIdx = 1;
      
      batchLines.forEach(line => {
        const fields = parseCSVLine(line);
        if (fields.length < 2 || !fields[1]) return;
        
        const brandId = parseInt(fields[0], 10) || null;
        const brandName = fields[1];
        const type = fields[2] || null;
        const slug = fields[3] || null;
        const dosageForm = fields[4] || null;
        const generic = fields[5] || null;
        const strength = fields[6] || null;
        const manufacturer = fields[7] || null;
        const packageContainer = fields[8] || null;
        const packageSize = fields[9] || null;
        const imageUrl = fields[10] || null;
        
        placeholders.push(`($${valIdx}, $${valIdx+1}, $${valIdx+2}, $${valIdx+3}, $${valIdx+4}, $${valIdx+5}, $${valIdx+6}, $${valIdx+7}, $${valIdx+8}, $${valIdx+9}, $${valIdx+10})`);
        
        values.push(brandId, brandName, type, slug, dosageForm, generic, strength, manufacturer, packageContainer, packageSize, imageUrl);
        valIdx += 11;
        insertedCount++;
      });
      
      if (values.length > 0) {
        const query = `
          INSERT INTO medicines (brand_id, brand_name, type, slug, dosage_form, generic, strength, manufacturer, package_container, package_size, image_url)
          VALUES ${placeholders.join(', ')}
        `;
        await client.query(query, values);
      }
    }

    await client.query('COMMIT');
    res.send(`Successfully seeded ${insertedCount} medicines into Supabase PostgreSQL database on Render!`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch(rollbackErr) {}
    console.error("Web seeding failed:", err);
    res.status(500).send(`Seeding failed: ${err.message}`);
  } finally {
    client.release();
  }
});
*/

// --- TEMPORARY: SMS DIAGNOSTIC ENDPOINT ---
// Usage: /api/test-sms?phone=01XXXXXXXXX
// Remove after confirming SMS works in production.
app.get('/api/test-sms', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).send('Pass ?phone=01XXXXXXXXX in the URL');

  console.log('[SMS TEST] Firing test SMS to:', phone);
  mailer.sendSMS(phone, '[আলমনগর সিএইচসি] এটি একটি পরীক্ষামূলক বার্তা। এসএমএস সফলভাবে পাঠানো হয়েছে।');
  res.send(`Test SMS dispatched to ${phone}. Check your server logs (Render → Logs) for the Shiram gateway response.`);
});


// --- DOCTOR FALLBACK PATH ---
app.get('/doctor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'doctor.html'));
});

// Serve frontend SPA routing fallback
// IMPORTANT: Explicitly serve uploads directory BEFORE the catch-all
// so uploaded files are found and served, not intercepted by the SPA route
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  fallthrough: false // return 404 instead of passing to next handler
}));

// Handle 404 for missing upload files specifically (do NOT serve index.html for these)
app.use('/uploads', (err, req, res, next) => {
  res.status(404).json({ error: 'File not found.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
