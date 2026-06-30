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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
    const res = await db.execute("SELECT * FROM appointments ORDER BY appointment_date ASC, appointment_time ASC");
    return res.rows;
  },

  getAppointmentsByUserId: async (userId) => {
    const res = await db.execute({ sql: "SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_date ASC, appointment_time ASC", args: [userId] });
    return res.rows;
  },

  createAppointment: async (appointment) => {
    const { user_id, patient_name, email, phone, appointment_date, appointment_time, notes } = appointment;
    const query = `INSERT INTO appointments (user_id, patient_name, email, phone, appointment_date, appointment_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const res = await db.execute({ sql: query, args: [user_id || null, patient_name, email, phone, appointment_date, appointment_time, notes || ""] });
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

  updateUserPassword: async (id, newPassword) => {
    const salt = generateSalt();
    const hash = hashPassword(newPassword, salt);
    const query = `UPDATE users SET password_hash = ?, salt = ? WHERE id = ?`;
    const res = await db.execute({ sql: query, args: [hash, salt, id] });
    return { changes: res.rowsAffected };
  }
};
