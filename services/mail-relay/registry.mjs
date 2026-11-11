import { parseRegistry } from "./relay.mjs";

// This credential never leaves the operator's private network. Store tokens are
// resolved by hash on every request: disable/revoke takes effect without reload.
export function remoteRegistry(endpoint, secret, { requireCustomerAllowlist = false, recipients } = {}) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !/^[a-f0-9]{64}$/.test(secret || '')) throw Error('invalid_control_configuration');
  const post = (target, data) => fetch(target, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(2500), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(data) });
  const lookup = async tokenHash => {
    const response = await post(url, { tokenHash });
    if (response.status === 404) { await response.body?.cancel(); return new Map(); }
    if (!response.ok) { await response.body?.cancel(); throw Error('registry_unavailable'); }
    const entry = await response.json();
    if (entry.tokenHash !== tokenHash) throw Error('invalid_registry_response');
    if (recipients) entry.customerEmails = recipients;
    return parseRegistry([entry], { requireCustomerAllowlist });
  };
  lookup.syncBrand = async (tokenHash, { origin, name, revision }) => {
    const response = await post(new URL('mail-identity', url), { tokenHash, origin, name, revision });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status };
    }
    return { status: 200, ...await response.json() };
  };
  return lookup;
}
