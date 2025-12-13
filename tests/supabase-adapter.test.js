const SupabaseAdapter = require('../src/integration/supabase-adapter');

describe('SupabaseAdapter (env-less)', () => {
  test('not connected when env missing', () => {
    const adapter = new SupabaseAdapter({ url: null, anonKey: null });
    expect(adapter.connected()).toBe(false);
  });

  test('subscribeToPlayer throws when client not present', () => {
    const adapter = new SupabaseAdapter({ url: null, anonKey: null });
    expect(() => adapter.subscribeToPlayer('electron-player-1', () => {})).toThrow();
  });
});
