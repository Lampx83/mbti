import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'mbti_log',
  password: process.env.PGPASSWORD || '123456',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

export default pool;