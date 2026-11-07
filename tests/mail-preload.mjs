// Only the disposable HTTP integration child uses this transport adapter.
if (process.env.MAIL_INTEGRATION_TEST !== '1' ||
    !/^\/btos_mail_[abc]_test$/.test(new URL(process.env.DATABASE_URL).pathname) ||
    new URL(process.env.DATABASE_URL).hostname !== '127.0.0.1') throw Error('unsafe_test_environment');
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && ['https://buattokosendiri.web.id/api/platform/store-mail',
    'https://buattokosendiri.web.id/api/platform/store-mail/status'].includes(input))
    return original('http://127.0.0.1:3419' + new URL(input).pathname, init);
  return original(input, init);
};
