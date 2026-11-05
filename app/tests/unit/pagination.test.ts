import { describe, it, expect, vi } from 'vitest';
import { readPage } from '@/lib/pagination';
describe('concurrent read pagination', () => {
  it('starts the rows query without waiting for count', async () => {
    let finish!: (count: number) => void;
    const count = () => new Promise<number>(resolve => { finish = resolve; });
    const read = vi.fn().mockResolvedValue(['row']);
    const result = readPage(2, count, read);
    expect(read).toHaveBeenCalledWith(20, 20);
    finish(42);
    expect(await result).toEqual({ rows: ['row'], total: 42, page: 2, pages: 3 });
    expect(read).toHaveBeenCalledOnce();
  });
  it('clamps an out-of-range request and reads the last page', async () => {
    const read = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['last']);
    expect(await readPage(99, async () => 21, read)).toEqual({ rows: ['last'], total: 21, page: 2, pages: 2 });
    expect(read.mock.calls).toEqual([[1960, 20], [20, 20]]);
  });
  it('retains page one for an empty list or invalid input', async () => {
    for (const value of [0, NaN, Infinity, -1, 1.2]) {
      expect(await readPage(value, async () => 0, async () => [])).toEqual({ rows: [], total: 0, page: 1, pages: 1 });
    }
  });
  it('propagates database failures instead of reporting an empty result', async () => {
    await expect(readPage(1, async () => { throw new Error('database unavailable'); }, async () => [])).rejects.toThrow('database unavailable');
  });
});
