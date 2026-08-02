import pg from 'pg';
const { Pool } = pg;

// Neon requires SSL. DATABASE_URL comes from environment.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\n  ERROR: DATABASE_URL environment variable is not set.');
  console.error('  Set it to your Neon connection string. See DEPLOYMENT.md\n');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

// Postgres uses $1, $2 placeholders instead of ?. This helper converts ? to $n
// so the rest of the codebase can keep using ? for readability.
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function initDb() {
  // Create tables (Postgres syntax: SERIAL for autoincrement, TIMESTAMP for dates)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak INTEGER DEFAULT 0,
      last_quiz_date TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pdfs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      text_content TEXT,
      chunks TEXT,
      text_gz BYTEA,
      chunks_gz BYTEA,
      indexed INTEGER DEFAULT 0,
      page_count INTEGER DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quizzes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      pdf_id INTEGER,
      questions TEXT NOT NULL,
      topic TEXT,
      consequence_mode INTEGER DEFAULT 0,
      docs_referenced TEXT,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      xp_earned INTEGER DEFAULT 0,
      completed_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS topic_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      topic TEXT NOT NULL,
      attempted INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      incorrect INTEGER DEFAULT 0,
      last_practiced TEXT,
      revision_count INTEGER DEFAULT 0,
      UNIQUE(user_id, topic)
    );
    CREATE TABLE IF NOT EXISTS question_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      topic TEXT NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      asked_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS flagged_questions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      topic TEXT,
      question_text TEXT NOT NULL,
      question_type TEXT,
      options TEXT,
      correct_answer TEXT,
      explanation TEXT,
      reason TEXT NOT NULL,
      comment TEXT,
      status TEXT DEFAULT 'open',
      flagged_at TIMESTAMP DEFAULT NOW(),
      reviewed_at TEXT
    );
  `);

  // Migrations: add compressed-storage columns to tables created before this change
  await pool.query(`ALTER TABLE pdfs ADD COLUMN IF NOT EXISTS text_gz BYTEA`);
  await pool.query(`ALTER TABLE pdfs ADD COLUMN IF NOT EXISTS chunks_gz BYTEA`);

  // Promote ADMIN_EMAIL to admin if set
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [adminEmail.toLowerCase()]);
  }

  // Seed demo users if table is empty
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c === 0) {
    const bcrypt = await import('bcryptjs');
    const hash = bcrypt.default.hashSync('demo123', 10);
    const demoUsers = [
      ['StudyOwl','owl@demo.com',hash,2450,8,12],
      ['BrainWave','brain@demo.com',hash,1820,6,7],
      ['QuizNinja','ninja@demo.com',hash,1540,5,3],
      ['PageTurner','page@demo.com',hash,980,4,15],
      ['DocWizard','wiz@demo.com',hash,760,3,5],
    ];
    for (const u of demoUsers) {
      await pool.query('INSERT INTO users (username, email, password_hash, xp, level, streak) VALUES ($1,$2,$3,$4,$5,$6)', u);
    }
    // Note: demo users are NOT admin. First real signup (or ADMIN_EMAIL) gets admin.
  }

  console.log('  Database ready (Postgres)');
}

// Async query helpers — same names as before, now Promise-based.
// The rest of the codebase awaits these.
export async function all(sql, params = []) {
  const { rows } = await pool.query(convertPlaceholders(sql), params);
  return rows;
}

export async function get(sql, params = []) {
  const { rows } = await pool.query(convertPlaceholders(sql), params);
  return rows[0] || null;
}

export async function run(sql, params = []) {
  // For INSERTs, append RETURNING id so we can report lastInsertRowid
  const isInsert = /^\s*insert/i.test(sql);
  let finalSql = convertPlaceholders(sql);
  if (isInsert && !/returning/i.test(finalSql)) {
    finalSql += ' RETURNING id';
  }
  const result = await pool.query(finalSql, params);
  return {
    lastInsertRowid: result.rows?.[0]?.id ?? null,
    changes: result.rowCount ?? 0,
  };
}

// No-op: Postgres persists automatically, no manual save needed.
export function save() {}
