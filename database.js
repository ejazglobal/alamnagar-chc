const { createClient } = require('@libsql/client');
const crypto = require('crypto');

// Setup a safe local file database client for cross-platform support
const db = createClient({
  url: 'file:healthcare.db',
});

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

async function initializeDatabase() {
  try {
    // Create users table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('Admin', 'Staff', 'Patient')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create appointments table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        patient_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        doctor_id INTEGER
      )
    `);

    // Safely add doctor_id to appointments table if database is pre-existing
    try {
      await db.execute("ALTER TABLE appointments ADD COLUMN doctor_id INTEGER");
      console.log("Added doctor_id column to appointments table.");
    } catch (e) {
      // Ignore if it already exists
    }

    // Create news table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        category TEXT NOT NULL,
        date_posted DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create doctors table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_en TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        specialty_en TEXT NOT NULL,
        specialty_bn TEXT NOT NULL,
        info_en TEXT NOT NULL,
        info_bn TEXT NOT NULL,
        visiting_hours_en TEXT NOT NULL,
        visiting_hours_bn TEXT NOT NULL,
        image_url TEXT,
        visiting_days TEXT NOT NULL
      )
    `);

    // Create gallery table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title_en TEXT,
        title_bn TEXT,
        image_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default users if the table is empty
    const userCountRes = await db.execute("SELECT COUNT(*) as count FROM users");
    const userCount = userCountRes.rows[0].count;
    if (userCount === 0) {
      const adminSalt = generateSalt();
      const staffSalt = generateSalt();
      const patientSalt = generateSalt();

      await db.execute({
        sql: "INSERT INTO users (username, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)",
        args: ["admin", "admin@alamnagar-chc.org", hashPassword("adminpass", adminSalt), adminSalt, "Admin"]
      });
      await db.execute({
        sql: "INSERT INTO users (username, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)",
        args: ["staff", "staff@alamnagar-chc.org", hashPassword("staffpass", staffSalt), staffSalt, "Staff"]
      });
      await db.execute({
        sql: "INSERT INTO users (username, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)",
        args: ["patient", "patient@example.com", hashPassword("patientpass", patientSalt), patientSalt, "Patient"]
      });
      console.log("Seeded default users (admin, staff, patient).");
    }

    // Insert initial news items if table is empty
    const newsCountRes = await db.execute("SELECT COUNT(*) as count FROM news");
    const newsCount = newsCountRes.rows[0].count;
    if (newsCount === 0) {
      await db.execute({
        sql: "INSERT INTO news (title, content, image_url, category) VALUES (?, ?, ?, ?)",
        args: [
          "Free Medical Health Camp Next Saturday",
          "Alamnagar Charitable Healthcare Centre is organizing a free health check-up camp next Saturday. General physicians, pediatricians, and cardiologists will be available for consultations from 9:00 AM to 3:00 PM. Free medicine distribution is also arranged.",
          "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80",
          "Event"
        ]
      });
      await db.execute({
        sql: "INSERT INTO news (title, content, image_url, category) VALUES (?, ?, ?, ?)",
        args: [
          "New Pediatric Specialist Joins Our Team",
          "We are pleased to welcome Dr. Sarah Rahman, MD in Pediatrics, to our medical team. She will be available for consultations every Monday and Wednesday starting next week. Book your appointments online.",
          "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
          "News"
        ]
      });
      console.log("Inserted initial news items.");
    }

    // Seed default doctors if table is empty
    const docCountRes = await db.execute("SELECT COUNT(*) as count FROM doctors");
    const docCount = docCountRes.rows[0].count;
    if (docCount === 0) {
      await db.execute({
        sql: `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Dr. Sarah Rahman",
          "ডাঃ সারাহ রহমান",
          "Pediatric Specialist",
          "শিশু বিশেষজ্ঞ",
          "MD in Pediatrics, 8+ years of clinical experience in child healthcare.",
          "শিশুরোগবিদ্যায় এমডি, শিশু স্বাস্থ্যসেবায় ৮+ বছরের ক্লিনিকাল অভিজ্ঞতা।",
          "Mon, Wed (09:00 AM - 01:00 PM)",
          "সোম, বুধ (সকাল ০৯:০০ - দুপুর ০১:০০)",
          "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
          "1,3"
        ]
      });

      await db.execute({
        sql: `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Dr. Azam Khan",
          "ডাঃ আজম খান",
          "Cardiologist",
          "হৃদরোগ বিশেষজ্ঞ",
          "FACS, clinical specialist in preventive and curative cardiology.",
          "এফএসিএস, প্রতিরোধমূলক এবং নিরাময়মূলক কার্ডিওলজির ক্লিনিকাল বিশেষজ্ঞ।",
          "Tue, Thu (10:00 AM - 02:00 PM)",
          "মঙ্গল, বৃহস্পতি (সকাল ১০:০০ - দুপুর ০২:০০)",
          "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80",
          "2,4"
        ]
      });

      await db.execute({
        sql: `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Dr. Rahat Kabir",
          "ডাঃ রাহাত কবির",
          "General Physician",
          "সাধারণ চিকিৎসক",
          "MBBS, providing comprehensive primary care and medical consults.",
          "এমবিবিএস, ব্যাপক প্রাথমিক চিকিৎসা এবং পরামর্শ প্রদানকারী।",
          "Mon, Tue, Wed, Thu, Fri (09:00 AM - 04:00 PM)",
          "সোম, মঙ্গল, বুধ, বৃহস্পতি, শুক্র (সকাল ০৯:০০ - বিকেল ০৪:০০)",
          "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80",
          "1,2,3,4,5"
        ]
      });
      console.log("Seeded default doctors.");
    }

    // Seed default gallery images if table is empty
    const galleryCountRes = await db.execute("SELECT COUNT(*) as count FROM gallery");
    const galleryCount = galleryCountRes.rows[0].count;
    if (galleryCount === 0) {
      await db.execute({
        sql: "INSERT INTO gallery (title_en, title_bn, image_url) VALUES (?, ?, ?)",
        args: ["Medical Checkup Camp", "বিনামূল্যে চিকিৎসা ক্যাম্প", "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80"]
      });
      await db.execute({
        sql: "INSERT INTO gallery (title_en, title_bn, image_url) VALUES (?, ?, ?)",
        args: ["Our Clinic Facilities", "আমাদের ক্লিনিক ভবন ও সুবিধা", "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80"]
      });
      await db.execute({
        sql: "INSERT INTO gallery (title_en, title_bn, image_url) VALUES (?, ?, ?)",
        args: ["Doctors Consultation Room", "ডাক্তারদের পরামর্শ কক্ষ", "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80"]
      });
      console.log("Seeded default gallery items.");
    }
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

// Initialize database
initializeDatabase();

// Database query helpers matching async format
module.exports = {
  hashPassword,
  generateSalt,

  getUserByUsername: async (username) => {
    const res = await db.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
    return res.rows[0] || null;
  },

  getUserByEmail: async (email) => {
    const res = await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });
    return res.rows[0] || null;
  },

  createUser: async (user) => {
    const { username, email, password, role } = user;
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const query = `INSERT INTO users (username, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)`;
    const res = await db.execute({ sql: query, args: [username, email, hash, salt, role] });
    return { id: Number(res.lastInsertRowid), username, email, role };
  },

  getAllAppointments: async () => {
    const res = await db.execute(`
      SELECT appointments.*, 
             doctors.name_en as doctor_name_en, 
             doctors.name_bn as doctor_name_bn 
      FROM appointments 
      LEFT JOIN doctors ON appointments.doctor_id = doctors.id 
      ORDER BY appointment_date ASC, appointment_time ASC
    `);
    return res.rows;
  },

  getAppointmentsByUserId: async (userId) => {
    const res = await db.execute({ 
      sql: `
        SELECT appointments.*, 
               doctors.name_en as doctor_name_en, 
               doctors.name_bn as doctor_name_bn 
        FROM appointments 
        LEFT JOIN doctors ON appointments.doctor_id = doctors.id 
        WHERE appointments.user_id = ? 
        ORDER BY appointment_date ASC, appointment_time ASC
      `, 
      args: [userId] 
    });
    return res.rows;
  },

  createAppointment: async (appointment) => {
    const { user_id, patient_name, email, phone, appointment_date, appointment_time, notes, doctor_id } = appointment;
    const query = `INSERT INTO appointments (user_id, patient_name, email, phone, appointment_date, appointment_time, notes, doctor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const res = await db.execute({ sql: query, args: [user_id || null, patient_name, email, phone, appointment_date, appointment_time, notes || "", doctor_id || null] });
    return { id: Number(res.lastInsertRowid), ...appointment, status: 'pending' };
  },

  updateAppointmentStatus: async (id, status) => {
    const query = `UPDATE appointments SET status = ? WHERE id = ?`;
    const res = await db.execute({ sql: query, args: [status, id] });
    return { changes: res.rowsAffected };
  },

  getAllNews: async () => {
    const res = await db.execute("SELECT * FROM news ORDER BY date_posted DESC");
    return res.rows;
  },

  createNews: async (newsItem) => {
    const { title, content, image_url, category } = newsItem;
    const query = `INSERT INTO news (title, content, image_url, category) VALUES (?, ?, ?, ?)`;
    const res = await db.execute({ sql: query, args: [title, content, image_url || "", category] });
    return { id: Number(res.lastInsertRowid), ...newsItem, date_posted: new Date().toISOString() };
  },

  updateNews: async (id, newsItem) => {
    const { title, content, image_url, category } = newsItem;
    const query = `UPDATE news SET title = ?, content = ?, image_url = ?, category = ? WHERE id = ?`;
    const res = await db.execute({ sql: query, args: [title, content, image_url || "", category, id] });
    return { changes: res.rowsAffected };
  },

  deleteNews: async (id) => {
    const query = `DELETE FROM news WHERE id = ?`;
    const res = await db.execute({ sql: query, args: [id] });
    return { changes: res.rowsAffected };
  },

  getAllDoctors: async () => {
    const res = await db.execute("SELECT * FROM doctors ORDER BY name_en ASC");
    return res.rows;
  },

  getDoctorById: async (id) => {
    const res = await db.execute({ sql: "SELECT * FROM doctors WHERE id = ?", args: [id] });
    return res.rows[0] || null;
  },

  getAllGallery: async () => {
    const res = await db.execute("SELECT * FROM gallery ORDER BY created_at DESC");
    return res.rows;
  },

  createGalleryItem: async (item) => {
    const { title_en, title_bn, image_url } = item;
    const query = `INSERT INTO gallery (title_en, title_bn, image_url) VALUES (?, ?, ?)`;
    const res = await db.execute({ sql: query, args: [title_en || "", title_bn || "", image_url] });
    return { id: Number(res.lastInsertRowid), ...item, created_at: new Date().toISOString() };
  },

  updateUserPassword: async (id, newPassword) => {
    const salt = generateSalt();
    const hash = hashPassword(newPassword, salt);
    const query = `UPDATE users SET password_hash = ?, salt = ? WHERE id = ?`;
    const res = await db.execute({ sql: query, args: [hash, salt, id] });
    return { changes: res.rowsAffected };
  }
};
