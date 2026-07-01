const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to seed the database.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

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

async function seed() {
  console.log("Reading medicines.csv...");
  const filePath = path.join(__dirname, 'medicines.csv');
  if (!fs.existsSync(filePath)) {
    console.error("medicines.csv not found in the root folder.");
    process.exit(1);
  }

  const csvContent = fs.readFileSync(filePath, 'utf8');
  // Split by line (handling \r\n and \n)
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  // Remove headers
  const headers = lines.shift();
  console.log(`Parsed ${lines.length} rows from medicines.csv.`);

  console.log("Preparing medicines table...");
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Recreate medicines table
    await client.query("DROP TABLE IF EXISTS medicines CASCADE");
    await client.query(`
      CREATE TABLE medicines (
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
        image_url TEXT
      )
    `);

    console.log("Seeding records in batches of 500...");
    const batchSize = 500;
    
    for (let i = 0; i < lines.length; i += batchSize) {
      const batchLines = lines.slice(i, i + batchSize);
      
      // Build batch insert query
      const placeholders = [];
      const values = [];
      let valIdx = 1;
      
      batchLines.forEach(line => {
        const fields = parseCSVLine(line);
        if (fields.length < 2 || !fields[1]) return; // Skip invalid rows or rows without brand name
        
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
      });
      
      if (values.length > 0) {
        const query = `
          INSERT INTO medicines (brand_id, brand_name, type, slug, dosage_form, generic, strength, manufacturer, package_container, package_size, image_url)
          VALUES ${placeholders.join(', ')}
        `;
        await client.query(query, values);
      }
      
      console.log(`Inserted ${Math.min(i + batchSize, lines.length)} / ${lines.length} rows.`);
    }

    await client.query('COMMIT');
    console.log("Seeding complete! Database successfully populated with DGHS medicine list.");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Seeding failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
