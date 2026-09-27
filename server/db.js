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

  // node-postgres defaults to max:10 with NO connection timeout, which means
  // once all 10 are busy, further requests queue indefinitely rather than
  // failing fast. Measured under simulated Neon latency (30ms/query, 6 queries
  // per participant), 500 concurrent Custom Quiz participants took 9.3s at
  // max:10 versus 2.0s at max:50.
  //
  // 50 is safe headroom: Neon's free tier (0.25 CU) allows 97 direct
  // connections to the application. Override with DB_POOL_MAX if you move to
  // a different database or add a second backend instance sharing the same DB.
  max: parseInt(process.env.DB_POOL_MAX || '50', 10),

  // Fail fast instead of hanging forever when the pool is saturated. A request
  // that can't get a connection in 10s is already a bad experience; surfacing
  // it as an error beats an indefinite spinner, and the global error handler
  // turns it into a clean 500 rather than a crash.
  connectionTimeoutMillis: 10_000,

  // Release idle connections rather than holding them open against Neon's
  // connection budget during quiet periods.
  idleTimeoutMillis: 30_000,
});

// A pool-level error (e.g. Neon dropping an idle connection) is emitted on the
// pool itself, NOT on any individual query. Without this listener Node treats
// it as an unhandled 'error' event and terminates the process — the same class
// of whole-server crash already fixed for async routes.
pool.on('error', (err) => {
  console.error('Postgres pool error (connection dropped or backend restarted):', err.message);
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
    CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      icon TEXT,
      keywords TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id),
      session_name TEXT NOT NULL,
      pdf_id INTEGER NOT NULL REFERENCES pdfs(id),
      join_code TEXT UNIQUE NOT NULL,
      count INTEGER DEFAULT 10,
      difficulty TEXT DEFAULT 'medium',
      questions TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS session_participants (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      score INTEGER,
      total INTEGER,
      results TEXT,
      joined_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP,
      UNIQUE(session_id, employee_id)
    );
  `);

  // Migrations: add compressed-storage columns to tables created before this change
  await pool.query(`ALTER TABLE pdfs ADD COLUMN IF NOT EXISTS text_gz BYTEA`);
  await pool.query(`ALTER TABLE pdfs ADD COLUMN IF NOT EXISTS chunks_gz BYTEA`);
  // Pre-generated fallback question pool, built lazily on the first SUCCESSFUL
  // live generation for a document (never at upload — see fallbackPool.js).
  // Used only when the entire AI provider chain is exhausted.
  await pool.query(`ALTER TABLE pdfs ADD COLUMN IF NOT EXISTS fallback_questions TEXT`);
  await pool.query(`ALTER TABLE pdfs ADD COLUMN IF NOT EXISTS fallback_generated_at TIMESTAMP`);

  // ---------------------------------------------------------------------
  // INDEXES
  // ---------------------------------------------------------------------
  // The schema previously had no indexes beyond primary keys and the implicit
  // ones Postgres creates for UNIQUE constraints. Every lookup filtering by
  // user_id, admin_id, or status was therefore a sequential scan of the whole
  // table. That's invisible with a handful of rows and progressively worse as
  // data accumulates — question_history in particular grows to 50 rows per
  // user per topic and is read on EVERY quiz generation.
  //
  // Already covered by existing UNIQUE constraints (no index needed here):
  //   users(username), users(email), topic_progress(user_id, topic),
  //   quiz_sessions(join_code), session_participants(session_id, employee_id)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_history_user_topic ON question_history (user_id, topic, asked_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes (user_id, completed_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quiz_sessions_admin ON quiz_sessions (admin_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quiz_sessions_pdf ON quiz_sessions (pdf_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_flagged_status ON flagged_questions (status, flagged_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_topic_progress_user ON topic_progress (user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics (parent_id, sort_order)`);

  // Seed the topic tree once, on first run only. Never overwrites admin edits —
  // if the table already has rows (from a prior run or admin changes), skip entirely.
  const { rows: topicCount } = await pool.query('SELECT COUNT(*)::int AS c FROM topics');
  if (topicCount[0].c === 0) {
    const seedTree = [
      { label: 'Overall Refinery', icon: '🏭', children: [
        { label: 'Crude-to-product basics / Petrochemical basics', keywords: ['crude','distillation','fraction','naphtha','gasoline','diesel','kerosene','petrochemical','polymer','olefin','aromatic','feedstock','boiling','refining'] },
        { label: 'Refinery economics & margins', keywords: ['margin','gross refining','grm','crack spread','netback','opex','capex','yield','economics','profit','cost','pricing','valuation'] },
        { label: 'Safety fundamentals', keywords: ['safety','hazard','ppe','permit','loto','lockout','confined space','hot work','msds','toxic','flammable','lel','h2s','risk assessment','psm'] },
        { label: 'Emergency response', keywords: ['emergency','evacuation','fire','alarm','esd','shutdown','mutual aid','incident command','firewater','deluge','assembly point','rescue'] },
      ]},
      { label: 'Individual Units', icon: '⚙️', children: [
        { label: 'CDU / VDU', keywords: ['cdu','vdu','crude distillation','vacuum distillation','atmospheric','desalter','preheat','furnace','overhead','sidecut','residue','stripping','flash zone'] },
        { label: 'DHDT / NHT', keywords: ['dhdt','nht','hydrotreat','hydrodesulfurization','hds','naphtha hydrotreater','diesel hydrotreater','sulfur','reactor','catalyst','hydrogen partial','wabt','sour'] },
        { label: 'DCU', keywords: ['dcu','coker','delayed coking','coke drum','decoking','cutting','furnace','thermal cracking','vgo','anode','petcoke','drum switching'] },
        { label: 'FCC / RFCC', keywords: ['fcc','rfcc','catalytic cracking','regenerator','riser','catalyst circulation','slurry','cyclone','e-cat','fluidized','main fractionator','afterburn'] },
        { label: 'HCU', keywords: ['hcu','hydrocracker','hydrocracking','conversion','recycle gas','makeup hydrogen','quench','exotherm','temperature runaway','catalyst bed','hpna'] },
        { label: 'Hydrogen Generation', keywords: ['hydrogen generation','smr','steam methane','reformer','psa','shift converter','syngas','hgu','methanation','steam carbon ratio','reforming'] },
        { label: 'Sulphur Recovery', keywords: ['sru','sulphur recovery','sulfur recovery','claus','tail gas','amine','acid gas','h2s','so2','incinerator','degassing','sulfur pit'] },
        { label: 'Utilities & Offsites', keywords: ['utility','offsite','boiler','steam','cooling water','instrument air','nitrogen','flare','effluent','etp','demineralized','dm water','power plant','tankage','prds','bfw','condensate'] },
        { label: 'Petrochemical Units', keywords: ['polypropylene','polyethylene','polymerization','extruder','pellet','propylene','ethylene','monomer','catalyst injection','reactor bed','degassing','granule'] },
      ]},
      { label: 'Process', icon: '🔄', children: [
        { label: 'Operating parameters & limits', keywords: ['operating parameter','operating limit','operating envelope','design limit','alarm limit','trip point','setpoint','normal operating','safe operating','iow','integrity operating window'] },
        { label: 'Common upsets & responses', keywords: ['upset','deviation','high level','low flow','trip','response','corrective action','abnormal','excursion','surge','carryover','foaming','flooding'] },
        { label: 'Startup / shutdown sequences', keywords: ['startup','shutdown','commissioning','purge','inertization','warm up','lineup','depressurization','cool down','sequence','pre-startup','pssr','first fill'] },
        { label: 'Incident insights (from RCFAs)', keywords: ['incident','rcfa','root cause','failure analysis','investigation','lesson learned','near miss','accident','why analysis','contributing factor'] },
      ]},
      { label: 'Electrical', icon: '⚡', children: [
        { label: 'Motor control & protection', keywords: ['motor','mcc','starter','overload','relay protection','thermal overload','contactor','dol','star delta','vfd','soft starter','winding','insulation resistance'] },
        { label: 'Switchgear & breakers', keywords: ['switchgear','breaker','circuit breaker','vcb','acb','busbar','isolator','protection relay','arc flash','racking','tripping','closing coil','interlock'] },
        { label: 'Power distribution', keywords: ['power distribution','transformer','substation','feeder','switchyard','voltage level','earthing','grounding','ups','dg set','emergency power','load shedding','single line diagram'] },
        { label: 'Incident insights (from RCFAs)', keywords: ['incident','rcfa','root cause','failure analysis','investigation','lesson learned','near miss','accident'] },
      ]},
      { label: 'Instrumentation', icon: '📡', children: [
        { label: 'Control loops & tuning', keywords: ['control loop','pid','tuning','proportional','integral','derivative','setpoint','cascade','feedforward','controller','gain','oscillation','dead time','process variable'] },
        { label: 'Safety instrumented systems (SIS/SIL)', keywords: ['sis','sil','safety instrumented','sif','interlock','trip','voting','2oo3','proof test','esd','logic solver','final element','pfd','lopa','hazop'] },
        { label: 'Analyzers & metering', keywords: ['analyzer','metering','gc','gas chromatograph','oxygen analyzer','ph','conductivity','flow meter','custody transfer','orifice','coriolis','ultrasonic','calibration','sample conditioning','swas'] },
        { label: 'Incident insights (from RCFAs)', keywords: ['incident','rcfa','root cause','failure analysis','investigation','lesson learned','near miss','accident'] },
      ]},
    ];

    for (let bi = 0; bi < seedTree.length; bi++) {
      const branch = seedTree[bi];
      const { rows } = await pool.query(
        'INSERT INTO topics (parent_id, label, icon, sort_order) VALUES (NULL, $1, $2, $3) RETURNING id',
        [branch.label, branch.icon, bi]
      );
      const branchId = rows[0].id;
      for (let li = 0; li < branch.children.length; li++) {
        const leaf = branch.children[li];
        await pool.query(
          'INSERT INTO topics (parent_id, label, keywords, sort_order) VALUES ($1, $2, $3, $4)',
          [branchId, leaf.label, JSON.stringify(leaf.keywords || []), li]
        );
      }
    }
    console.log('  Seeded default topic tree (25 topics)');
  }

  // Promote ADMIN_EMAIL to admin if set
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [adminEmail.toLowerCase()]);
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
