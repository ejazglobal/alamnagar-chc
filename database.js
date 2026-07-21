const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
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
    // 1. Create doctors table
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

    // 2. Create users table (supporting Doctor role and phone field)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role VARCHAR(50) NOT NULL CHECK(role IN ('Admin', 'Staff', 'Patient', 'Doctor', 'Observer', 'Pharmacist')),
        phone VARCHAR(50) UNIQUE,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Dynamic cleanup of old check constraints on users and staff_permissions tables
    try {
      await pool.query(`
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN (
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'users' AND constraint_type = 'CHECK'
          ) LOOP
            EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
          END LOOP;

          FOR r IN (
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'staff_permissions' AND constraint_type = 'CHECK'
          ) LOOP
            EXECUTE 'ALTER TABLE staff_permissions DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
          END LOOP;
        END $$;
      `);
      await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('Admin', 'Staff', 'Patient', 'Doctor', 'Observer', 'Pharmacist'))`);
      await pool.query(`ALTER TABLE staff_permissions ADD CONSTRAINT staff_permissions_check CHECK(permissions IN ('news', 'doctors', 'all', 'pharmacist'))`);
    } catch (cErr) {
      console.log('Role/Permissions check constraint update note:', cErr.message);
    }

    // 3. Create appointments table
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

    // 4. Create news table
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

    // 5. Create gallery table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gallery (
        id SERIAL PRIMARY KEY,
        title_en VARCHAR(255),
        title_bn VARCHAR(255),
        image_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Create staff_permissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        permissions VARCHAR(50) NOT NULL CHECK(permissions IN ('news', 'doctors', 'all', 'pharmacist'))
      )
    `);

    // 7. Create otp_verifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Create medicines table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        brand_id INTEGER,
        brand_name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        slug VARCHAR(255),
        dosage_form VARCHAR(100),
        generic VARCHAR(255),
        strength VARCHAR(100),
        manufacturer VARCHAR(255),
        package_container TEXT,
        package_size TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    try {
      await pool.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    } catch (mErr) {
      console.log('Medicines table update note:', mErr.message);
    }

    // 9. Create prescriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id SERIAL PRIMARY KEY,
        appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
        diagnostics TEXT,
        observations TEXT,
        medicines JSONB NOT NULL,
        doctor_signature TEXT,
        bp VARCHAR(100),
        temperature VARCHAR(100),
        pulse VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 10. Create patient_reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_reports (
        id SERIAL PRIMARY KEY,
        patient_phone VARCHAR(50) NOT NULL,
        uploader_role VARCHAR(50) NOT NULL CHECK(uploader_role IN ('patient', 'doctor')),
        file_url TEXT NOT NULL,
        file_type VARCHAR(50),
        description TEXT,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("PostgreSQL database tables verified/created.");

    // Enable Row Level Security (RLS) on all public tables to resolve Supabase linter warnings
    const tablesToEnableRLS = [
      'doctors',
      'users',
      'appointments',
      'news',
      'gallery',
      'staff_permissions',
      'otp_verifications',
      'medicines',
      'prescriptions',
      'patient_reports'
    ];

    for (const table of tablesToEnableRLS) {
      try {
        await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        console.log(`Row Level Security (RLS) enabled on table: ${table}`);
      } catch (rlsErr) {
        console.warn(`Could not enable RLS on table ${table}: ${rlsErr.message}`);
      }
    }

    // Safe column migrations for existing old tables
    try {
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL");
      await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL");
      await pool.query("ALTER TABLE doctors ADD COLUMN IF NOT EXISTS visiting_days VARCHAR(255) DEFAULT '1,2,3,4,5'");
      
      // Prescriptions rich_state migration
      await pool.query("ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS rich_state JSONB");
      
      // Medicines table column updates
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS brand_id INTEGER");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS type VARCHAR(100)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS slug VARCHAR(255)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS dosage_form VARCHAR(100)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS generic VARCHAR(255)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS strength VARCHAR(100)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255)");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS package_container TEXT");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS package_size TEXT");
      await pool.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS image_url TEXT");
      
      // Patient Reports findings migration
      await pool.query("ALTER TABLE patient_reports ADD COLUMN IF NOT EXISTS findings JSONB");

      // Gallery table column updates
      await pool.query("ALTER TABLE gallery ADD COLUMN IF NOT EXISTS title_en VARCHAR(255)");
      await pool.query("ALTER TABLE gallery ADD COLUMN IF NOT EXISTS title_bn VARCHAR(255)");
      await pool.query("ALTER TABLE gallery ALTER COLUMN image_url TYPE TEXT");
      try {
        await pool.query("UPDATE gallery SET title_en = title WHERE title_en IS NULL AND title IS NOT NULL");
      } catch (titleMigErr) {
        // Ignore if old 'title' column doesn't exist
      }

      // Address, Age, Gender, Weight, and Signature migrations
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT");
      await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS address TEXT");
      await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS age VARCHAR(50)");
      await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gender VARCHAR(50)");
      await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS weight VARCHAR(50)");
      await pool.query("ALTER TABLE doctors ADD COLUMN IF NOT EXISTS signature_url TEXT");
      
      // Prescriptions table columns migrations
      await pool.query("ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS bp VARCHAR(100)");
      await pool.query("ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS temperature VARCHAR(100)");
      await pool.query("ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS pulse VARCHAR(100)");

      // Registration Refactor constraints
      try {
        await pool.query("ALTER TABLE users ALTER COLUMN email DROP NOT NULL");
        await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key");
        // Drop and recreate user role check constraint to include Observer
        await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        await pool.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Admin', 'Staff', 'Patient', 'Doctor', 'Observer'))");
      } catch (e) {
        console.warn("Could not alter constraints:", e.message);
      }
      try {
        await pool.query("ALTER TABLE appointments ALTER COLUMN email DROP NOT NULL");
      } catch (e) {
        console.warn("Could not alter appointments email constraint:", e.message);
      }
      try {
        await pool.query("ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone)");
      } catch (e) {
        console.warn("Could not add phone unique constraint:", e.message);
      }

      // Handle brand_name transition safely
      await pool.query("UPDATE medicines SET brand_name = name WHERE brand_name IS NULL AND name IS NOT NULL");
      await pool.query("UPDATE medicines SET brand_name = 'Unknown Medicine' WHERE brand_name IS NULL");
      await pool.query("ALTER TABLE medicines ALTER COLUMN brand_name SET NOT NULL");

      // Performance indexing for autocomplete searches and generic lookup logic
      await pool.query("CREATE INDEX IF NOT EXISTS idx_medicines_lookup ON medicines (generic, strength, dosage_form)");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_medicines_brand_name_lower ON medicines (lower(brand_name))");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_medicines_generic_lower ON medicines (lower(generic))");
    } catch (migErr) {
      console.warn("Table migrations warning (might be already modified):", migErr.message);
    }

    // Proactively link user 'rahnuma' to Doctor 'Dr. Rahnuma Rahman' if both exist
    try {
      const docRes = await pool.query("SELECT id FROM doctors WHERE name_en ILIKE '%Rahnuma%' LIMIT 1");
      if (docRes.rows.length > 0) {
        const docId = docRes.rows[0].id;
        const updateRes = await pool.query(
          "UPDATE users SET role = 'Doctor', doctor_id = $1 WHERE username = 'rahnuma' OR email ILIKE '%rahnuma%'",
          [docId]
        );
        if (updateRes.rowCount > 0) {
          console.log(`Successfully migrated and mapped user 'rahnuma' to Doctor ID ${docId} (Doctor role).`);
        }
      }
    } catch (linkErr) {
      console.warn("Could not auto-link 'rahnuma' user:", linkErr.message);
    }

    // Proactively rename user 'sarah' to 'azam' and update email
    try {
      const renameRes = await pool.query(
        "UPDATE users SET username = 'azam', email = 'azam@alamnagar-chc.org' WHERE username = 'sarah'"
      );
      if (renameRes.rowCount > 0) {
        console.log("Successfully migrated and renamed username 'sarah' to 'azam'.");
      }
    } catch (renameErr) {
      console.warn("Could not rename 'sarah' user to 'azam':", renameErr.message);
    }

    // Strip '88' prefix from any existing phone numbers in users table to make them consistent
    try {
      const fixPhonesRes = await pool.query(
        "UPDATE users SET phone = SUBSTRING(phone FROM 3) WHERE phone LIKE '8801%' AND LENGTH(phone) = 13"
      );
      if (fixPhonesRes.rowCount > 0) {
        console.log(`Successfully migrated ${fixPhonesRes.rowCount} user phone numbers to 11-digit format.`);
      }
    } catch (fixPhonesErr) {
      console.warn("Could not clean up user phone prefixes:", fixPhonesErr.message);
    }

    // --- SEED DOCTORS ---
    const docCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM doctors");
    const docCount = parseInt(docCountRes.rows[0].count, 10);
    if (docCount === 0) {
      await pool.query(
        `INSERT INTO doctors (id, name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          1,
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
        `INSERT INTO doctors (id, name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          2,
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
        `INSERT INTO doctors (id, name_en, name_bn, specialty_en, specialty_bn, info_en, info_bn, visiting_hours_en, visiting_hours_bn, image_url, visiting_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          3,
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
      // Reset serial sequence for doctors id
      await pool.query("SELECT setval('doctors_id_seq', (SELECT MAX(id) FROM doctors))");
      console.log("Seeded default doctors.");
    }

    // --- SEED USERS ---
    const userCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM users");
    const userCount = parseInt(userCountRes.rows[0].count, 10);
    if (userCount === 0) {
      const adminSalt = generateSalt();
      const staffSalt = generateSalt();
      const patientSalt = generateSalt();
      
      const azamSalt = generateSalt();
      const doc2Salt = generateSalt();
      const rahatSalt = generateSalt();

      // Standard seeded users
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

      // Seed Doctor accounts linked to doctors
      await pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role, doctor_id) VALUES ($1, $2, $3, $4, $5, $6)",
        ["azam", "azam@alamnagar-chc.org", hashPassword("doctorpass", azamSalt), azamSalt, "Doctor", 1]
      );
      await pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role, doctor_id) VALUES ($1, $2, $3, $4, $5, $6)",
        ["doctor2", "doctor2@alamnagar-chc.org", hashPassword("doctorpass", doc2Salt), doc2Salt, "Doctor", 2]
      );
      await pool.query(
        "INSERT INTO users (username, email, password_hash, salt, role, doctor_id) VALUES ($1, $2, $3, $4, $5, $6)",
        ["rahat", "rahat@alamnagar-chc.org", hashPassword("doctorpass", rahatSalt), rahatSalt, "Doctor", 3]
      );

      console.log("Seeded default users (admin, staff, patient, and doctor users).");
    }

    // --- SEED STAFF PERMISSIONS ---
    // Link staff user (email staff@alamnagar-chc.org) to have 'all' permissions by default
    const staffUserRes = await pool.query("SELECT id FROM users WHERE username = 'staff'");
    if (staffUserRes.rows.length > 0) {
      const staffUserId = staffUserRes.rows[0].id;
      const permCheck = await pool.query("SELECT id FROM staff_permissions WHERE user_id = $1", [staffUserId]);
      if (permCheck.rows.length === 0) {
        await pool.query(
          "INSERT INTO staff_permissions (user_id, permissions) VALUES ($1, $2)",
          [staffUserId, "all"]
        );
        console.log("Seeded permissions for 'staff' user.");
      }
    }

    // --- SEED MEDICINES ---
    const medicineCountRes = await pool.query("SELECT COUNT(*)::integer as count FROM medicines");
    if (parseInt(medicineCountRes.rows[0].count, 10) === 0) {
      const defaultMedicines = [
        { brand_id: 1, brand_name: 'Paracetamol', dosage_form: 'Tablet', generic: 'Paracetamol', strength: '500 mg', manufacturer: 'Square Pharmaceuticals Ltd.', type: 'allopathic' },
        { brand_id: 2, brand_name: 'Amoxicillin', dosage_form: 'Capsule', generic: 'Amoxicillin', strength: '250 mg', manufacturer: 'Beximco Pharmaceuticals Ltd.', type: 'allopathic' },
        { brand_id: 3, brand_name: 'Omeprazole', dosage_form: 'Capsule', generic: 'Omeprazole', strength: '20 mg', manufacturer: 'Square Pharmaceuticals Ltd.', type: 'allopathic' }
      ];

      for (const med of defaultMedicines) {
        await pool.query(
          "INSERT INTO medicines (brand_id, brand_name, dosage_form, generic, strength, manufacturer, type) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [med.brand_id, med.brand_name, med.dosage_form, med.generic, med.strength, med.manufacturer, med.type]
        );
      }
      console.log("Seeded default medicine list.");
    }

    // --- SEED NEWS ---
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

    // --- SEED GALLERY ---
    // Disabled seeding default gallery items as requested by user.
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

// Initialize database
initializeDatabase();

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

// Database query helpers matching async format
module.exports = {
  hashPassword,
  generateSalt,
  pool,
  normalizePhone,

  getUserByUsername: async (username) => {
    const res = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    return res.rows[0] || null;
  },

  getUserByEmail: async (email) => {
    const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return res.rows[0] || null;
  },

  getUserByPhone: async (phone) => {
    const normalized = normalizePhone(phone);
    const res = await pool.query("SELECT * FROM users WHERE phone = $1", [normalized]);
    return res.rows[0] || null;
  },

  createUser: async (user) => {
    const { username, email, password, role, phone } = user;
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const normalizedPhone = normalizePhone(phone);
    const query = `INSERT INTO users (username, email, password_hash, salt, role, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
    const res = await pool.query(query, [username, email || null, hash, salt, role, normalizedPhone]);
    return { id: res.rows[0].id, username, email: email || null, role, phone: normalizedPhone };
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
    const res = await pool.query(
      `SELECT d.*, 
              (SELECT email FROM users WHERE doctor_id = d.id AND role = 'Doctor' LIMIT 1) AS login_email,
              (SELECT phone FROM users WHERE doctor_id = d.id AND role = 'Doctor' LIMIT 1) AS login_phone,
              (SELECT username FROM users WHERE doctor_id = d.id AND role = 'Doctor' LIMIT 1) AS login_username
       FROM doctors d 
       ORDER BY d.name_en ASC`
    );
    return res.rows;
  },

  getDoctorById: async (id) => {
    const res = await pool.query(
      `SELECT d.*, 
              (SELECT email FROM users WHERE doctor_id = d.id AND role = 'Doctor' LIMIT 1) AS login_email,
              (SELECT phone FROM users WHERE doctor_id = d.id AND role = 'Doctor' LIMIT 1) AS login_phone,
              (SELECT username FROM users WHERE doctor_id = d.id AND role = 'Doctor' LIMIT 1) AS login_username
       FROM doctors d 
       WHERE d.id = $1`,
      [id]
    );
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

  updateGalleryItem: async (id, item) => {
    const { title_en, title_bn, image_url } = item;
    const query = `UPDATE gallery SET title_en = $1, title_bn = $2, image_url = $3 WHERE id = $4`;
    const res = await pool.query(query, [title_en || "", title_bn || "", image_url, id]);
    return { changes: res.rowCount };
  },

  deleteGalleryItem: async (id) => {
    const query = `DELETE FROM gallery WHERE id = $1`;
    const res = await pool.query(query, [id]);
    return { changes: res.rowCount };
  },

  updateUserPassword: async (id, newPassword) => {
    const salt = generateSalt();
    const hash = hashPassword(newPassword, salt);
    const query = `UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3`;
    const res = await pool.query(query, [hash, salt, id]);
    return { changes: res.rowCount };
  },

  // --- STAFF PERMISSIONS HELPERS ---
  getStaffPermissions: async (userId) => {
    const res = await pool.query("SELECT permissions FROM staff_permissions WHERE user_id = $1", [userId]);
    return res.rows[0] ? res.rows[0].permissions : null;
  },

  getAllStaffWithPermissions: async () => {
    const res = await pool.query(`
      SELECT users.id, users.username, users.email, 
             CASE 
               WHEN users.role = 'Observer' THEN 'observer'
               WHEN users.role = 'Pharmacist' THEN 'pharmacist'
               ELSE COALESCE(staff_permissions.permissions, 'pharmacist')
             END as permissions 
      FROM users 
      LEFT JOIN staff_permissions ON users.id = staff_permissions.user_id 
      WHERE users.role IN ('Staff', 'Observer', 'Pharmacist')
      ORDER BY users.username ASC
    `);
    return res.rows;
  },

  createStaffWithPermissions: async (staffData) => {
    const { username, email, password, permissions, phone } = staffData;
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const normalizedPhone = normalizePhone(phone);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        "INSERT INTO users (username, email, password_hash, salt, role, phone) VALUES ($1, $2, $3, $4, 'Staff', $5) RETURNING id",
        [username, email || null, hash, salt, normalizedPhone]
      );
      const userId = userRes.rows[0].id;

      try {
        await client.query(
          "INSERT INTO staff_permissions (user_id, permissions) VALUES ($1, $2)",
          [userId, permissions]
        );
      } catch (permErr) {
        console.warn("Could not insert custom permission, falling back to 'all':", permErr.message);
        await client.query(
          "INSERT INTO staff_permissions (user_id, permissions) VALUES ($1, $2)",
          [userId, 'all']
        );
      }

      await client.query('COMMIT');
      return { id: userId, username, email: email || null, role: 'Staff', permissions, phone: normalizedPhone };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  deleteStaffMember: async (userId) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("DELETE FROM staff_permissions WHERE user_id = $1", [userId]);
      const res = await client.query("DELETE FROM users WHERE id = $1 AND role IN ('Staff', 'Observer', 'Pharmacist')", [userId]);
      await client.query('COMMIT');
      return { changes: res.rowCount };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  // --- OTP HELPERS ---
  createOTP: async (email, phone, otp) => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    // Clean up old ones for this email/phone first
    await pool.query("DELETE FROM otp_verifications WHERE email = $1 OR phone = $2", [email, phone]);
    const query = `INSERT INTO otp_verifications (email, phone, otp, expires_at) VALUES ($1, $2, $3, $4) RETURNING id`;
    const res = await pool.query(query, [email, phone, otp, expiresAt]);
    return res.rows[0].id;
  },

  verifyOTP: async (email, phone, otp) => {
    const res = await pool.query(
      "SELECT * FROM otp_verifications WHERE email = $1 AND phone = $2 AND otp = $3",
      [email, phone, otp]
    );
    if (res.rows.length > 0) {
      const record = res.rows[0];
      const now = new Date();
      const expiresAt = new Date(record.expires_at);
      if (expiresAt > now) {
        // Valid: invalidate immediately and return true
        await pool.query("DELETE FROM otp_verifications WHERE id = $1", [record.id]);
        return true;
      }
    }
    return false;
  },

  // --- MEDICINE HELPERS ---
  getAllMedicines: async () => {
    const res = await pool.query("SELECT id, brand_name AS name, generic, strength, dosage_form, manufacturer, type, image_url FROM medicines ORDER BY brand_name ASC LIMIT 100");
    return res.rows;
  },

  // --- PRESCRIPTION HELPERS ---
  getPrescriptionByAppointmentId: async (appointmentId) => {
    const res = await pool.query("SELECT * FROM prescriptions WHERE appointment_id = $1", [appointmentId]);
    return res.rows[0] || null;
  },

  createPrescription: async (prescription) => {
    const { appointment_id, doctor_id, diagnostics, observations, medicines, doctor_signature, bp, temperature, pulse, rich_state } = prescription;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO prescriptions (appointment_id, doctor_id, diagnostics, observations, medicines, doctor_signature, bp, temperature, pulse, rich_state)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (appointment_id) DO UPDATE 
        SET diagnostics = EXCLUDED.diagnostics,
            observations = EXCLUDED.observations,
            medicines = EXCLUDED.medicines,
            doctor_signature = EXCLUDED.doctor_signature,
            bp = EXCLUDED.bp,
            temperature = EXCLUDED.temperature,
            pulse = EXCLUDED.pulse,
            rich_state = EXCLUDED.rich_state
        RETURNING id
      `;
      const res = await client.query(query, [
        appointment_id,
        doctor_id,
        diagnostics,
        observations,
        JSON.stringify(medicines),
        doctor_signature,
        bp || null,
        temperature || null,
        pulse || null,
        rich_state ? JSON.stringify(rich_state) : null
      ]);

      // Set appointment status to completed
      await client.query("UPDATE appointments SET status = 'completed' WHERE id = $1", [appointment_id]);

      await client.query('COMMIT');
      return { id: res.rows[0].id, ...prescription };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  // --- PATIENT REPORTS HELPERS ---
  createPatientReport: async (report) => {
    const { patient_phone, uploader_role, file_url, file_type, description, findings } = report;
    const query = `INSERT INTO patient_reports (patient_phone, uploader_role, file_url, file_type, description, findings) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, upload_date`;
    const res = await pool.query(query, [patient_phone, uploader_role, file_url, file_type || null, description || '', findings ? JSON.stringify(findings) : null]);
    return { id: res.rows[0].id, upload_date: res.rows[0].upload_date, ...report };
  },

  updatePatientReportFindings: async (id, findings) => {
    const query = `UPDATE patient_reports SET findings = $1 WHERE id = $2 RETURNING *`;
    const res = await pool.query(query, [findings ? JSON.stringify(findings) : null, id]);
    return res.rows[0];
  },

  getPatientReportsByPhone: async (phone) => {
    // Normalizes matching by ignoring any leading '88' country code format differences
    const query = `
      SELECT * FROM patient_reports 
      WHERE REGEXP_REPLACE(patient_phone, '^88', '') = REGEXP_REPLACE($1, '^88', '') 
      ORDER BY upload_date DESC
    `;
    const res = await pool.query(query, [phone]);
    return res.rows;
  }
};
