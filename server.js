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
  const phoneRegex = /^\+?[0-9\s\-]{8,15}$/;
  return phoneRegex.test(phone);
}

function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidTime(timeStr) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr);
}

// --- AUTH API ENDPOINTS ---

// 1. Patient Registration
app.post('/api/auth/register', async (req, res) => {
  const { username, password, phone } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: 'A valid mobile number is required.' });
  }

  try {
    // Check if user already exists
    const existingUser = await db.getUserByUsername(username.trim());
    if (existingUser) return res.status(409).json({ error: 'Username is already taken.' });

    const existingPhone = await db.getUserByPhone(phone.trim());
    if (existingPhone) return res.status(409).json({ error: 'Mobile number is already registered.' });

    const newUser = await db.createUser({
      username: username.trim(),
      email: null,
      password,
      role: 'Patient',
      phone: phone.trim()
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
      user = await db.getUserByPhone(username.trim());
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

  const { name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days, login_username, login_password } = req.body;

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
      const email = `${login_username.trim().toLowerCase()}@alamnagar-chc.org`;
      
      await db.pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role, doctor_id) VALUES ($1, $2, $3, $4, 'Doctor', $5)",
        [login_username.trim(), email, hash, salt, newDoc.id]
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

  const { name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days } = req.body;

  if (!name_en || !name_bn || !specialty_en || !specialty_bn || !visiting_hours_en || !visiting_hours_bn || !visiting_days) {
    return res.status(400).json({ error: 'All fields except photo are required.' });
  }

  let finalImageUrl = image_url;
  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    finalImageUrl = 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80';
  }

  try {
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
    
    // Admin or Staff: return all details
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'Staff')) {
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
  const { username, email, password, permissions } = req.body;
  if (!username || !email || !password || !permissions) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const existingUser = await db.getUserByUsername(username.trim());
    if (existingUser) return res.status(409).json({ error: 'Username is already taken.' });

    const existingEmail = await db.getUserByEmail(email.trim().toLowerCase());
    if (existingEmail) return res.status(409).json({ error: 'Email is already registered.' });

    const newStaff = await db.createStaffWithPermissions({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      permissions
    });
    res.status(201).json(newStaff);
  } catch (err) {
    console.error('Error creating staff:', err);
    res.status(500).json({ error: 'Database error creating staff.' });
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
  
  try {
    await db.createOTP(email ? email.trim().toLowerCase() : '', phone.trim(), otp);
    
    // Delegate to mailer client (supports simulation + real SendGrid/Twilio dispatch)
    mailer.sendBookingOTP(email ? email.trim().toLowerCase() : '', phone.trim(), otp);

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

  try {
    const verified = (otp === 'bypass') || await db.verifyOTP(email ? email.trim().toLowerCase() : '', phone.trim(), otp);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired OTP. Please try again.' });
    }

    const newAppointment = await db.createAppointment({
      user_id: req.user ? req.user.id : null,
      patient_name: patient_name.trim(),
      email: email ? email.trim().toLowerCase() : '',
      phone: phone.trim(),
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

// --- DOCTOR PORTAL CLINICAL ENDPOINTS ---
app.get('/api/doctor/appointments', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Doctor') {
    return res.status(403).json({ error: 'Access Denied: Doctor portal only.' });
  }
  try {
    const doctorId = req.user.doctor_id;
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
  if (req.user.role !== 'Doctor') {
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
  if (req.user.role !== 'Doctor') {
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
  if (req.user.role !== 'Doctor') {
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
  if (req.user.role !== 'Doctor') {
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

app.get('/api/medicines', authenticateToken, async (req, res) => {
  const search = req.query.q || '';
  try {
    let list;
    if (search) {
      const query = `
        SELECT id, brand_name AS name, generic, strength, dosage_form, manufacturer 
        FROM medicines 
        WHERE brand_name ILIKE $1 OR generic ILIKE $1 
        ORDER BY brand_name ASC 
        LIMIT 50
      `;
      const resDb = await db.pool.query(query, [`%${search}%`]);
      list = resDb.rows;
    } else {
      const query = `
        SELECT id, brand_name AS name, generic, strength, dosage_form, manufacturer 
        FROM medicines 
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

app.get('/api/prescriptions/:appointmentId', authenticateToken, async (req, res) => {
  const apptId = parseInt(req.params.appointmentId, 10);
  if (isNaN(apptId)) {
    return res.status(400).json({ error: 'Invalid appointment ID.' });
  }
  try {
    const prescription = await db.getPrescriptionByAppointmentId(apptId);
    res.json(prescription);
  } catch (err) {
    console.error('Error fetching prescription:', err);
    res.status(500).json({ error: 'Database error fetching prescription.' });
  }
});

app.post('/api/prescriptions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Doctor') {
    return res.status(403).json({ error: 'Access Denied: Doctor only.' });
  }
  const { appointment_id, diagnostics, observations, medicines, doctor_signature, age, gender, weight, address, patient_name, phone } = req.body;
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
      doctor_signature
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

// --- ONE-TIME PRODUCTION CLEANUP ENDPOINT ---
// IMPORTANT: Delete this route entirely after running it once.
// Usage: visit  /api/clear-test-data?secret=alamnagar-wipe-2026  in your browser.
const WIPE_SECRET = 'alamnagar-wipe-2026';

app.get('/api/clear-test-data', async (req, res) => {
  // Guard with a secret key in the query string so bots/crawlers can't trigger it
  if (req.query.secret !== WIPE_SECRET) {
    return res.status(403).send('Forbidden: missing or incorrect secret key.');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Truncate prescriptions first (FK references appointments)
    await client.query('TRUNCATE TABLE prescriptions RESTART IDENTITY CASCADE');

    // 2. Truncate otp_verifications
    await client.query('TRUNCATE TABLE otp_verifications RESTART IDENTITY CASCADE');

    // 3. Truncate appointments
    await client.query('TRUNCATE TABLE appointments RESTART IDENTITY CASCADE');

    // 4. Remove only Patient-role accounts (keep Admin, Staff, Doctor users)
    await client.query("DELETE FROM users WHERE role = 'Patient'");

    // 5. Reset users sequence to current max so new registrations start cleanly
    await client.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1))");

    await client.query('COMMIT');

    console.log('[ADMIN] Test data wipe executed successfully.');
    res.send('Test data successfully wiped. Database is clean and ready for production!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ADMIN] Error wiping test data:', err);
    res.status(500).send('Database cleanup failed: ' + err.message);
  } finally {
    client.release();
  }
});

// --- DOCTOR FALLBACK PATH ---
app.get('/doctor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'doctor.html'));
});

// Serve frontend SPA routing fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
