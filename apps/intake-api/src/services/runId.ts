import { query, getClient } from '../db/pool.js';

/**
 * Generate a run ID in the format: run-YYYYMMDD-NNN
 * Uses a database sequence per day for uniqueness.
 */
export async function generateRunId(): Promise<string> {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Upsert the date key and increment sequence
    const result = await client.query<{ last_seq: number }>(
      `INSERT INTO run_id_sequence (date_key, last_seq)
       VALUES ($1, 1)
       ON CONFLICT (date_key) DO UPDATE SET last_seq = run_id_sequence.last_seq + 1
       RETURNING last_seq`,
      [dateKey],
    );

    await client.query('COMMIT');

    const seq = result.rows[0].last_seq;
    return `run-${dateKey}-${String(seq).padStart(3, '0')}`;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
