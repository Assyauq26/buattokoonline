// Disposable operator-only stdin adapter. Never expose as an HTTP endpoint.
// Used by mail-multistore.mjs only with separately authorized real recipients.
import { createHash } from 'node:crypto';
import { deliverResend } from '../app/src/modules/auth/mail-contract.mjs';
const recipient = process.env.MAIL_TEST_RECIPIENT;
if (!recipient || !process.env.RESEND_API_KEY) throw Error('Missing server configuration');
let text = '';
for await (const chunk of process.stdin) {
  text += chunk;
  if (text.length > 8192) throw Error('Message too large');
}
const message = JSON.parse(text);
if (message.to?.length !== 1 || message.to[0] !== recipient ||
    !['Buattokosendiri', 'Gheverhan', 'Toko Makmur', 'Fashion Store'].some(
      name => message.from === `${name} <otp@buattokosendiri.web.id>`)) throw Error('Recipient or sender outside authorization');
let id;
const original = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await original(...args);
  if (response.ok) id = (await response.clone().json()).id;
  return response;
};
try {
  await deliverResend('https://api.resend.com/emails', process.env.RESEND_API_KEY, message,
    'candidate-' + createHash('sha256').update(text).digest('hex'));
  console.log(JSON.stringify({ id }));
} catch { process.stderr.write('Provider test failed\n'); process.exitCode = 1; }
