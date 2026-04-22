import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "mbti_log",
  password: process.env.PGPASSWORD || "123456",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

const MBTI_CODES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (let i = 0; i < MBTI_CODES.length; i++) {
      const id = i + 1;
      const code = MBTI_CODES[i];
      await client.query(
        `INSERT INTO mbti_types (id, code)
         VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING`,
        [id, code],
      );
    }

    await client.query(
      `SELECT setval(
        pg_get_serial_sequence('mbti_types', 'id'),
        (SELECT COALESCE(MAX(id), 1) FROM mbti_types)
      )`,
    );

    const countRes = await client.query(`SELECT COUNT(*)::int AS mbti_types_count FROM mbti_types`);
    const rowsRes = await client.query(`SELECT id, code FROM mbti_types ORDER BY id`);

    await client.query("COMMIT");

    console.log("[seed:mbti-types] Done.");
    console.log("mbti_types_count =", countRes.rows[0]?.mbti_types_count);
    console.table(rowsRes.rows);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[seed:mbti-types] Failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

