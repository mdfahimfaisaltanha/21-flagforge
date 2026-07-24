import pg from 'pg'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function hashPassword(password) {
  return createHash('sha256')
    .update(password + (process.env.SESSION_SECRET ?? 'dev'))
    .digest('hex')
}

async function setup() {
  const client = await pool.connect()
  try {
    console.log('🚩 Setting up FlagForge schema...')

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           TEXT UNIQUE NOT NULL,
        password_hash   TEXT NOT NULL,
        role            TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')),
        session_token   TEXT,
        session_expires TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS flags (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key          TEXT UNIQUE NOT NULL,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        environments JSONB NOT NULL DEFAULT '{}',
        tags         JSONB NOT NULL DEFAULT '[]',
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_flags_key ON flags(key);
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS experiments (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        flag_id     UUID REFERENCES flags(id) ON DELETE SET NULL,
        name        TEXT NOT NULL,
        hypothesis  TEXT NOT NULL DEFAULT '',
        metric      TEXT NOT NULL DEFAULT 'conversion',
        variants    JSONB NOT NULL DEFAULT '[]',
        status      TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','running','paused','concluded')),
        winner      TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS experiment_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        experiment_id   UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
        user_id         TEXT NOT NULL,
        variant_key     TEXT NOT NULL,
        event_type      TEXT NOT NULL CHECK (event_type IN ('exposure','conversion')),
        metadata        JSONB NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_exp_events_exp   ON experiment_events(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_exp_events_user  ON experiment_events(experiment_id, user_id, event_type);
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        diff        JSONB NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
    `)

    // Seed users
    const users = [
      { email: 'admin@codeatlas.test',  password: 'ChangeMe123!', role: 'admin'  },
      { email: 'viewer@codeatlas.test', password: 'ViewOnly456!', role: 'viewer' },
    ]
    for (const u of users) {
      await client.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, hashPassword(u.password), u.role]
      )
    }

    console.log('✅ Schema ready.')
    console.log('👤 Users: admin@codeatlas.test / ChangeMe123!  |  viewer@codeatlas.test / ViewOnly456!')
    console.log('Run `npm run seed` to add demo flags and experiments.')
  } finally {
    client.release()
    await pool.end()
  }
}

setup().catch(e => { console.error(e); process.exit(1) })
