import pg from 'pg';

export function createPool(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 5000, query_timeout: 6000,
    application_name: 'frontierdom-api' });
}

export async function transaction(pool, run) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query('begin');
    await client.query("set local lock_timeout = '3s'");
    const result = await run(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch (rollbackError) { broken = rollbackError; }
    throw error;
  } finally {
    client.release(broken);
  }
}
