require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is missing in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runTutorReset() {
  console.log('====================================================');
  console.log(' ALAMNAGAR CHC: WIPING ALL TUTORS & RESETTING ID SEQUENCE');
  console.log('====================================================\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Unassign assigned tutors from enrollments
    const unassignRes = await client.query(`UPDATE tuition_enrollments SET assigned_tutor_id = NULL, status = 'pending'`);
    console.log(` -> Unassigned tutors from ${unassignRes.rowCount} tuition enrollment batch(es).`);

    // 2. Clear all rows from tutors table
    const delTutors = await client.query('DELETE FROM tutors');
    console.log(` -> Deleted ${delTutors.rowCount} tutor record(s) from 'tutors' table.`);

    // 3. Clear user accounts created with role 'Tutor' or tutor test emails
    const delUserTutors = await client.query("DELETE FROM users WHERE LOWER(role) = 'tutor' OR email LIKE '%tutor%'");
    console.log(` -> Deleted ${delUserTutors.rowCount} tutor account(s) from 'users' table.`);

    // 4. Reset sequence counter for tutors primary key (id) back to 1
    await client.query("ALTER SEQUENCE tutors_id_seq RESTART WITH 1");
    console.log(" -> Reset PostgreSQL sequence 'tutors_id_seq' back to start at 1.");

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log(' SUCCESS: Tutor directory completely cleared & sequence reset to 1!');
    console.log('====================================================');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nRESET FAILED:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runTutorReset();
