require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_BUCKET = 'patient-reports';

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is missing in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runCleanup() {
  console.log('====================================================');
  console.log(' ALAMNAGAR CHC: WIPING TEST DATA & UPLOADED DOCUMENTS');
  console.log('====================================================\n');

  try {
    // 1. Delete Supabase Storage files
    console.log('[1/3] Cleaning Supabase Storage bucket (patient-reports)...');
    let deletedFiles = 0;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const listUrl = `${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`;
      const listRes = await fetch(listUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefix: '', limit: 1000 })
      });

      if (listRes.ok) {
        const files = await listRes.json();
        if (Array.isArray(files) && files.length > 0) {
          const filenames = files.map(f => f.name);
          console.log(` -> Found ${filenames.length} file(s) in bucket:`, filenames);
          const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}`;
          const delRes = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prefixes: filenames })
          });
          if (delRes.ok) {
            deletedFiles = filenames.length;
            console.log(` -> Successfully deleted ${deletedFiles} file(s) from Supabase Storage.`);
          } else {
            console.error(' -> Failed to delete files from Supabase Storage:', await delRes.text());
          }
        } else {
          console.log(' -> Bucket is already empty (0 files).');
        }
      } else {
        console.error(' -> Failed to list bucket files:', await listRes.text());
      }
    } else {
      console.log(' -> Supabase credentials not provided. Skipping storage cleanup.');
    }

    // 2. Clean Database Tables
    console.log('\n[2/3] Cleaning PostgreSQL database tables...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const delPrescriptions = await client.query('DELETE FROM prescriptions');
      console.log(` -> Deleted ${delPrescriptions.rowCount} row(s) from 'prescriptions'.`);

      const delReports = await client.query('DELETE FROM patient_reports');
      console.log(` -> Deleted ${delReports.rowCount} row(s) from 'patient_reports'.`);

      const delAppointments = await client.query('DELETE FROM appointments');
      console.log(` -> Deleted ${delAppointments.rowCount} row(s) from 'appointments'.`);

      const delOtps = await client.query('DELETE FROM otp_verifications');
      console.log(` -> Deleted ${delOtps.rowCount} row(s) from 'otp_verifications'.`);

      const delPatients = await client.query("DELETE FROM users WHERE role = 'Patient'");
      console.log(` -> Deleted ${delPatients.rowCount} row(s) from 'users' (Patient role).`);

      await client.query('COMMIT');
      console.log(' -> Database transactions successfully committed.');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error(' -> Database deletion failed, transaction rolled back:', dbErr.message);
      throw dbErr;
    } finally {
      client.release();
    }

    // 3. Clear Local sent_emails folder
    console.log('\n[3/3] Cleaning local sent_emails directory...');
    const emailsDir = path.join(__dirname, 'sent_emails');
    let deletedEmails = 0;
    if (fs.existsSync(emailsDir)) {
      const files = fs.readdirSync(emailsDir);
      for (const file of files) {
        if (file.endsWith('.html') || file.endsWith('.txt')) {
          fs.unlinkSync(path.join(emailsDir, file));
          deletedEmails++;
        }
      }
      console.log(` -> Deleted ${deletedEmails} local email log file(s).`);
    } else {
      console.log(' -> sent_emails directory does not exist.');
    }

    console.log('\n====================================================');
    console.log(' SUCCESS: All test data and uploaded files wiped!');
    console.log('====================================================');

  } catch (err) {
    console.error('\nCLEANUP FAILED:', err.message);
  } finally {
    await pool.end();
  }
}

runCleanup();
