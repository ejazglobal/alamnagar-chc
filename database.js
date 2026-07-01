const { Pool } = require('pg');
const crypto = require('crypto');

// Setup PostgreSQL client pool
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL environment variable is not set. PostgreSQL connection might fail.");
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role VARCHAR(50) NOT NULL CHECK(role IN ('Admin', 'Staff', 'Patient')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create doctors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        name_en VARCHAR(255) NOT NULL,
        name_bn VARCHAR(255) NOT NULL,
        specialty_en VARCHAR(255) NOT NULL,
        specialty_bn VARCHAR(255) NOT NULL,
        info_en TEXT NOT NULL,
        info_bn TEXT NOT NULL,
        visiting_hours_en VARCHAR(255) NOT NULL,
        visiting_hours_bn VARCHAR(255) NOT NULL,
        image_url TEXT,
        visiting_days VARCHAR(255) DEFAULT '1,2,3,4,5' NOT NULL
      )
    `);

    // Create appointments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        patient_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        appointment_date VARCHAR(50) NOT NULL,
        appointment_time VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL
      )
    `);

    // Create news table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        category VARCHAR(100) NOT NULL,
        date_posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create gallery table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gallery (
        id SERIAL PRIMARY KEY,
        title_en VARCHAR(255),
        title_bn VARCHAR(255),
        image_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("PostgreSQL database tables verified/created.");

    // Seed default users if the table is empty
    const userCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM users");
    const userCount = parseInt(userCountRes.rows[0].count, 10);
    if (userCount === 0) {
      const adminSalt = generateSalt();
      const staffSalt = generateSalt();
      const patientSalt = generateSalt();

      await pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role) VALUES ($1, $2, $3, $4, $5)",
        ["admin", "admin@alamnagar-chc.org", hashPassword("14142135", adminSalt), adminSalt, "Admin"]
      );
      await pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role) VALUES ($1, $2, $3, $4, $5)",
        ["staff", "staff@alamnagar-chc.org", hashPassword("22360679", staffSalt), staffSalt, "Staff"]
      );
      await pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role) VALUES ($1, $2, $3, $4, $5)",
        ["patient", "patient@example.com", hashPassword("patientpass", patientSalt), patientSalt, "Patient"]
      );
      console.log("Seeded default users (admin, staff, patient).");
    }

    // Insert initial news items if table is empty
    const newsCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM news");
    const newsCount = parseInt(newsCountRes.rows[0].count, 10);
    if (newsCount === 0) {
      await pool.query(
        "INSERT INTO news (title, content, image_url, category) VALUES ($1, $2, $3, $4)",
        [
          "Free Medical Health Camp Next Saturday",
          "Alamnagar Charitable Healthcare Centre is organizing a free health check-up camp next Saturday. General physicians, pediatricians, and cardiologists will be available for consultations from 9:00 AM to 3:00 PM. Free medicine distribution is also arranged.",
          "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80",
          "Event"
        ]
      );
      await pool.query(
        "INSERT INTO news (title, content, image_url, category) VALUES ($1, $2, $3, $4)",
        [
          "New Pediatric Specialist Joins Our Team",
          "We are pleased to welcome Dr. Sarah Rahman, MD in Pediatrics, to our medical team. She will be available for consultations every Monday and Wednesday starting next week. Book your appointments online.",
          "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
          "News"
        ]
      );
      console.log("Inserted initial news items.");
    }

    // Seed default doctors if table is empty
    const docCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM doctors");
    const docCount = parseInt(docCountRes.rows[0].count, 10);
    if (docCount === 0) {
      await pool.query(
        `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
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
      );

      await pool.query(
        `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
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
      );

      await pool.query(
        `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
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
      );
      console.log("Seeded default doctors.");
    }

    // Seed default gallery images if table is empty
    const galleryCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM gallery");
    const galleryCount = parseInt(galleryCountRes.rows[0].count, 10);
    if (galleryCount === 0) {
      await pool.query(
        "INSERT INTO gallery (title_en, title_bn, image_url) VALUES ($1, $2, $3)",
        ["Medical Checkup Camp", "বিনামূল্যে চিকিৎসা ক্যাম্প", "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80"]
      );
      await pool.query(
        "INSERT INTO gallery (title_en, title_bn, image_url) VALUES ($1, $2, $3)",
        ["Our Clinic Facilities", "আমাদের ক্লিনিক ভবন ও সুবিধা", "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80"]
      );
      await pool.query(
        "INSERT INTO gallery (title_en, title_bn, image_url) VALUES ($1, $2, $3)",
        ["Doctors Consultation Room", "ডাক্তারদের পরামর্শ কক্ষ", "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80"]
      );
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
  pool, // Export pool for custom raw queries if needed in tests/other modules

  getUserByUsername: async (username) => {
    const res = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    return res.rows[0] || null;
  },

  getUserByEmail: async (email) => {
    const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return res.rows[0] || null;
  },

  createUser: async (user) => {
    const { username, email, password, role } = user;
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const query = `INSERT INTO users (username, email, password_hash, salt, role) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    const res = await pool.query(query, [username, email, hash, salt, role]);
    return { id: res.rows[0].id, username, email, role };
  },

  getAllAppointments: async () => {
    const res = await pool.query(`
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
    const res = await pool.query(`
      SELECT appointments.*, 
             doctors.name_en as doctor_name_en, 
             doctors.name_bn as doctor_name_bn 
      FROM appointments 
      LEFT JOIN doctors ON appointments.doctor_id = doctors.id 
      WHERE appointments.user_id = $1 
      ORDER BY appointment_date ASC, appointment_time ASC
    `, [userId]);
    return res.rows;
  },

  createAppointment: async (appointment) => {
    const { user_id, patient_name, email, phone, appointment_date, appointment_time, notes, doctor_id } = appointment;
    const query = `INSERT INTO appointments (user_id, patient_name, email, phone, appointment_date, appointment_time, notes, doctor_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
    const res = await pool.query(query, [user_id || null, patient_name, email, phone, appointment_date, appointment_time, notes || "", doctor_id || null]);
    return { id: res.rows[0].id, ...appointment, status: 'pending' };
  },

  updateAppointmentStatus: async (id, status) => {
    const query = `UPDATE appointments SET status = $1 WHERE id = $2`;
    const res = await pool.query(query, [status, id]);
    return { changes: res.rowCount };
  },

  getAllNews: async () => {
    const res = await pool.query("SELECT * FROM news ORDER BY date_posted DESC");
    return res.rows;
  },

  createNews: async (newsItem) => {
    const { title, content, image_url, category } = newsItem;
    const query = `INSERT INTO news (title, content, image_url, category) VALUES ($1, $2, $3, $4) RETURNING id`;
    const res = await pool.query(query, [title, content, image_url || "", category]);
    return { id: res.rows[0].id, ...newsItem, date_posted: new Date().toISOString() };
  },

  updateNews: async (id, newsItem) => {
    const { title, content, image_url, category } = newsItem;
    const query = `UPDATE news SET title = $1, content = $2, image_url = $3, category = $4 WHERE id = $5`;
    const res = await pool.query(query, [title, content, image_url || "", category, id]);
    return { changes: res.rowCount };
  },

  deleteNews: async (id) => {
    const query = `DELETE FROM news WHERE id = $1`;
    const res = await pool.query(query, [id]);
    return { changes: res.rowCount };
  },

  getAllDoctors: async () => {
    const res = await pool.query("SELECT * FROM doctors ORDER BY name_en ASC");
    return res.rows;
  },

  getDoctorById: async (id) => {
    const res = await pool.query("SELECT * FROM doctors WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  createDoctor: async (doctor) => {
    const { name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days } = doctor;
    const query = `INSERT INTO doctors (name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`;
    const res = await pool.query(query, [name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url || "", visiting_days]);
    return { id: res.rows[0].id, ...doctor };
  },

  updateDoctor: async (id, doctor) => {
    const { name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days } = doctor;
    const query = `UPDATE doctors SET name_en = $1, name_bn = $2, specialty_en = $3, specialty_bn = $4, info_en = $5, info_bn = $6, visiting_hours_en = $7, visiting_hours_bn = $8, image_url = $9, visiting_days = $10 WHERE id = $11`;
    const res = await pool.query(query, [name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url || "", visiting_days, id]);
    return { changes: res.rowCount };
  },

  deleteDoctor: async (id) => {
    const query = `DELETE FROM doctors WHERE id = $1`;
    const res = await pool.query(query, [id]);
    return { changes: res.rowCount };
  },

  getAllGallery: async () => {
    const res = await pool.query("SELECT * FROM gallery ORDER BY created_at DESC");
    return res.rows;
  },

  createGalleryItem: async (item) => {
    const { title_en, title_bn, image_url } = item;
    const query = `INSERT INTO gallery (title_en, title_bn, image_url) VALUES ($1, $2, $3) RETURNING id`;
    const res = await pool.query(query, [title_en || "", title_bn || "", image_url]);
    return { id: res.rows[0].id, ...item, created_at: new Date().toISOString() };
  },

  updateUserPassword: async (id, newPassword) => {
    const salt = generateSalt();
    const hash = hashPassword(newPassword, salt);
    const query = `UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3`;
    const res = await pool.query(query, [hash, salt, id]);
    return { changes: res.rowCount };
  }
};
