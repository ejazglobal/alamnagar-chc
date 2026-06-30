const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Limit request sizes to prevent denial-of-service and enable CORS
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// --- INPUT VALIDATION HELPERS ---
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  // Matches basic international or local format: optional +, followed by 8-15 digits/spaces/dashes
  const phoneRegex = /^\+?[0-9\s\-]{8,15}$/;
  return phoneRegex.test(phone);
}

function isValidDate(dateStr) {
  // Format: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidTime(timeStr) {
  // Format: HH:MM
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr);
}

// --- API ENDPOINTS ---

// 1. Get all news/events
app.get('/api/news', async (req, res) => {
  try {
    const news = await db.getAllNews();
    res.json(news);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to retrieve news events' });
  }
});

// 2. Post a news item (Admin)
app.post('/api/news', async (req, res) => {
  const { title, content, image_url, category } = req.body;

  // Validation
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required and must be a string' });
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required and must be a string' });
  }
  if (!category || !['News', 'Event', 'Alert'].includes(category)) {
    return res.status(400).json({ error: 'Category must be one of: News, Event, Alert' });
  }

  // Set default placeholder image if not provided
  let finalImageUrl = image_url;
  if (!image_url || typeof image_url !== 'string' || image_url.trim().length === 0) {
    finalImageUrl = 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80'; // fallback hospital image
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

// 3. Get all appointments (Admin dashboard)
app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await db.getAllAppointments();
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

// 4. Book a new appointment (Patient portal)
app.post('/api/appointments', async (req, res) => {
  const { patient_name, email, phone, appointment_date, appointment_time, notes } = req.body;

  // Validation
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

  // Prevent booking on weekends
  const dateObj = new Date(appointment_date);
  const day = dateObj.getDay();
  if (day === 0 || day === 6) {
    return res.status(400).json({ error: 'Appointments cannot be scheduled on weekends (Saturday/Sunday).' });
  }

  // Prevent booking in the past
  const todayStr = new Date().toISOString().split('T')[0];
  if (appointment_date < todayStr) {
    return res.status(400).json({ error: 'Appointments cannot be scheduled in the past.' });
  }

  try {
    const newAppointment = await db.createAppointment({
      patient_name: patient_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      appointment_date,
      appointment_time,
      notes: notes ? notes.trim() : ''
    });
    res.status(201).json(newAppointment);
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Failed to register appointment. Slot may not be available.' });
  }
});

// 5. Update appointment status (Admin: Approve/Cancel)
app.patch('/api/appointments/:id', async (req, res) => {
  const appointmentId = parseInt(req.params.id, 10);
  const { status } = req.body;

  if (isNaN(appointmentId)) {
    return res.status(400).json({ error: 'Invalid appointment ID' });
  }
  if (!status || !['pending', 'approved', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be pending, approved, or cancelled.' });
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
