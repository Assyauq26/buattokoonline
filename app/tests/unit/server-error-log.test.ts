import { afterEach, expect, it, vi } from 'vitest';
import { logServerFailure } from '@/lib/server-error-log';
afterEach(() => vi.restoreAllMocks());
it('keeps diagnostic codes while excluding message, stack, cause and arbitrary fields', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('private credential and customer email'), { name: 'PrismaClientKnownRequestError', code: 'P2002', cause: { token: 'private token' } });
  logServerFailure('api-error', error);
  expect(log).toHaveBeenCalledWith('[api-error]', { type: 'PrismaClientKnownRequestError', code: 'P2002' });
  expect(JSON.stringify(log.mock.calls)).not.toContain('private');
});
it('does not turn attacker-controlled error names or codes into log fields', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  logServerFailure('action-error', { name: 'secret@example.test', code: 'ERR_PRIVATE_SECRET', body: 'secret' });
  expect(log).toHaveBeenCalledWith('[action-error]', { type: 'Error' });
});
it('handles primitive errors and throwing getters without breaking failure handling', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  logServerFailure('api-error', 'private token');
  logServerFailure('api-error', { get name() { throw new Error('private'); } });
  let names = 0, codes = 0;
  logServerFailure('api-error', { get name() { return ++names === 1 ? 'Error' : 'private'; }, get code() { return ++codes === 1 ? 'P2002' : 'private'; } });
  expect(names).toBe(1); expect(codes).toBe(1);
  expect(log.mock.calls).toEqual([['[api-error]',{ type:'Error' }],['[api-error]',{ type:'Error' }],['[api-error]',{ type:'Error', code:'P2002' }]]);
});
