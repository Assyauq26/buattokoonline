/** Offline operator tools may write only this installation's local database. */
export function assertSafeDatabaseOperation(env = process.env) {
  try {
    for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
      const u = new URL(env[key] || '');
      if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['db', 'localhost', '127.0.0.1'].includes(u.hostname) ||
          u.pathname !== '/store' || !u.username || !u.password) throw new Error();
    }
  } catch { throw new Error('Use the dedicated local store database for this operation'); }
}
