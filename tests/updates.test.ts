import { describe, expect, it } from 'vitest';
import { pendingToApply, shouldUpdate } from '../src/services/updates';

const files = [{ file_name: 'index.html', file_hash: 'a'.repeat(64), download_url: 'https://x/a' }];

describe('live updates', () => {
  it('takes a newer update made for this exact app build', () => {
    expect(shouldUpdate({ ota: 5, native: 10011, files }, 10011, 4)).toBe(true);
  });

  it('never goes backwards, sideways or onto another app build', () => {
    expect(shouldUpdate({ ota: 4, native: 10011, files }, 10011, 4)).toBe(false);
    expect(shouldUpdate({ ota: 3, native: 10011, files }, 10011, 4)).toBe(false);
    // Built for an older or newer app: its code may need different native parts.
    expect(shouldUpdate({ ota: 9, native: 10010, files }, 10011, 0)).toBe(false);
    expect(shouldUpdate({ ota: 9, native: 10012, files }, 10011, 0)).toBe(false);
  });

  it('ignores broken manifests', () => {
    expect(shouldUpdate(null, 10011, 0)).toBe(false);
    expect(shouldUpdate('nope', 10011, 0)).toBe(false);
    expect(shouldUpdate({ ota: 5, native: 10011, files: [] }, 10011, 0)).toBe(false);
    expect(shouldUpdate({ ota: 5, native: 10011, files: [{ file_name: 'app.js', file_hash: 'b', download_url: 'u' }] }, 10011, 0)).toBe(false);
    expect(shouldUpdate({ ota: 1.5, native: 10011, files }, 10011, 0)).toBe(false);
  });
});

describe('waiting live updates', () => {
  it('switches at launch to a newer update that was downloaded but not applied', () => {
    expect(pendingToApply({ version: '2', status: 'pending' }, 0)).toBe(true);
    expect(pendingToApply({ version: '3', status: 'success' }, 2)).toBe(true);
  });

  it('never re-applies the running update, an older one, or one that failed', () => {
    expect(pendingToApply({ version: '2', status: 'success' }, 2)).toBe(false);
    expect(pendingToApply({ version: '1', status: 'pending' }, 2)).toBe(false);
    expect(pendingToApply({ version: '5', status: 'error' }, 2)).toBe(false);
    expect(pendingToApply({ version: 'builtin', status: 'success' }, 0)).toBe(false);
    expect(pendingToApply(null, 0)).toBe(false);
  });
});
