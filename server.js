const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Limit request sizes to prevent denial-of-service and enable CORS
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
  const { username, email, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    // Check if user already exists
    const existingUser = await db.getUserByUsername(username.trim());
    if (existingUser) return res.status(409).json({ error: 'Username is already taken.' });

    const existingEmail = await db.getUserByEmail(email.trim().toLowerCase());
    if (existingEmail) return res.status(409).json({ error: 'Email is already registered.' });

    const newUser = await db.createUser({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'Patient' // Self-registered users are always patients
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
    return res.status(400).json({ error: 'Username/Email and Password are required.' });
  }

  try {
    // Search by username first, if not found search by email
    let user = await db.getUserByUsername(username.trim());
    if (!user && isValidEmail(username)) {
      user = await db.getUserByEmail(username.trim().toLowerCase());
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    // Verify password hash
    const loginHash = db.hashPassword(password, user.salt);
    if (loginHash !== user.password_hash) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    // Generate encrypted token session
    const token = encryptToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
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
  if (req.user.role !== 'Admin' && req.user.role !== 'Staff') {
    return res.status(403).json({ error: 'Access Denied: Only Admin and Staff can publish news.' });
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

// 6. Get all appointments (Admin/Staff get all, Patients/Guests get calendar slots and own history)
app.get('/api/appointments', optionalAuthenticateToken, async (req, res) => {
  try {
    const allAppts = await db.getAllAppointments();
    
    // Admin or Staff: return all details
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'Staff')) {
      return res.json(allAppts);
    }
    
    // Patient or Guest: return full details for their own bookings, and sanitized records for others
    const sanitized = allAppts.map(appt => {
      if (req.user && req.user.role === 'Patient' && appt.user_id === req.user.id) {
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
  const { patient_name, email, phone, appointment_date, appointment_time, notes } = req.body;

  if (!patient_name || typeof patient_name !== 'string' || patient_name.trim().length === 0) {
    return res.status(400).json({ error: 'Patient name is required' });
  }
  if (!email || !isValidEmail(email)) {
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

  const dateObj = new Date(appointment_date);
  const day = dateObj.getDay();
  if (day === 0 || day === 6) {
    return res.status(400).json({ error: 'Appointments cannot be scheduled on weekends.' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (appointment_date < todayStr) {
    return res.status(400).json({ error: 'Appointments cannot be scheduled in the past.' });
  }

  try {
    const newAppointment = await db.createAppointment({
      user_id: req.user ? req.user.id : null, // Store active patient's ID if logged in
      patient_name: patient_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      appointment_date,
      appointment_time,
      notes: notes ? notes.trim() : ''
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
    res.json({ message: `Appointment status updated to ${status} successfully.` });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Failed to update appointment status' });
  }
});

// Serve frontend SPA routing fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
