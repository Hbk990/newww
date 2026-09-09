import { describe, it, expect, vi } from 'vitest';
const transaction = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/db.js', () => ({ prisma: { $transaction: transaction }, Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } }));
import { atomic } from '../src/lib/atomic.js';
describe('atomic writes', () => {
  it('retries a rolled-back serialization conflict', async () => {
    transaction.mockReset().mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValueOnce('saved');
    expect(await atomic(async () => 'saved')).toBe('saved');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0][1].isolationLevel).toBe('Serializable');
  });
  it('does not retry unknown failures or repeat a potentially committed write', async () => {
    transaction.mockReset().mockRejectedValue(new Error('connection lost'));
    await expect(atomic(async () => 'saved')).rejects.toThrow('connection lost');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('bounds retries and asks for a retry after persistent conflicts', async () => {
    transaction.mockReset().mockRejectedValue({ code: 'P2034' });
    await expect(atomic(async () => 'saved')).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction).toHaveBeenCalledTimes(4);
  });
});
