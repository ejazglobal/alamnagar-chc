const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'healthcare.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to the local SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create appointments table
    db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    db.run(`
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        category TEXT NOT NULL,
        date_posted DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert initial news items if table is empty
    db.get("SELECT COUNT(*) as count FROM news", [], (err, row) => {
      if (err) return console.error(err.message);
      if (row.count === 0) {
        const stmt = db.prepare("INSERT INTO news (title, content, image_url, category) VALUES (?, ?, ?, ?)");
        stmt.run(
          "Free Medical Health Camp Next Saturday",
          "Alamnagar Charitable Healthcare Centre is organizing a free health check-up camp next Saturday. General physicians, pediatricians, and cardiologists will be available for consultations from 9:00 AM to 3:00 PM. Free medicine distribution is also arranged.",
          "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80",
          "Event"
        );
        stmt.run(
          "New Pediatric Specialist Joins Our Team",
          "We are pleased to welcome Dr. Sarah Rahman, MD in Pediatrics, to our medical team. She will be available for consultations every Monday and Wednesday starting next week. Book your appointments online.",
          "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
          "News"
        );
        stmt.run(
          "COVID-19 Booster Dose Guidelines",
          "We are offering booster doses of COVID-19 vaccines for senior citizens and high-risk patients. Walk-ins are welcome from 10:00 AM to 2:00 PM on weekdays. Please bring your previous vaccination records.",
          "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80",
          "Alert"
        );
        stmt.finalize();
        console.log("Inserted initial news items.");
      }
    });
  });
}

// Database query helpers (using promises for clean async/await in Express)
module.exports = {
  db,
  
  // Appointments operations
  getAllAppointments: () => {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM appointments ORDER BY appointment_date ASC, appointment_time ASC", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  createAppointment: (appointment) => {
    return new Promise((resolve, reject) => {
      const { patient_name, email, phone, appointment_date, appointment_time, notes } = appointment;
      const query = `INSERT INTO appointments (patient_name, email, phone, appointment_date, appointment_time, notes) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
      db.run(query, [patient_name, email, phone, appointment_date, appointment_time, notes], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...appointment, status: 'pending' });
      });
    });
  },

  updateAppointmentStatus: (id, status) => {
    return new Promise((resolve, reject) => {
      const query = `UPDATE appointments SET status = ? WHERE id = ?`;
      db.run(query, [status, id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  // News operations
  getAllNews: () => {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM news ORDER BY date_posted DESC", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  createNews: (newsItem) => {
    return new Promise((resolve, reject) => {
      const { title, content, image_url, category } = newsItem;
      const query = `INSERT INTO news (title, content, image_url, category) VALUES (?, ?, ?, ?)`;
      db.run(query, [title, content, image_url, category], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...newsItem, date_posted: new Date().toISOString() });
      });
    });
  }
};
