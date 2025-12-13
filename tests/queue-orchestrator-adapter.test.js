const QueueOrchestrator = require('../src/integration/queue-orchestrator');

describe('QueueOrchestrator with mock Supabase adapter', () => {
  test('initialize indicates connected when adapter supplied', async () => {
    const mockAdapter = { connected: () => true };
    const q = new QueueOrchestrator(mockAdapter);

    const initPromise = new Promise((resolve) => {
      q.on('initialized', (payload) => resolve(payload));
    });

    await q.initialize();
    const payload = await initPromise;
    expect(payload.connected).toBe(true);
  });

  test('startRealtime merges updates into state', async () => {
    const mockChannel = { unsubscribe: jest.fn() };
    const mockAdapter = {
      connected: () => true,
      subscribeToPlayer: (playerId, cb) => {
        // simulate real-time change
        setImmediate(() => cb({ new: { now_playing_video: { id: 'v-rt' }, active_queue: [{ id: 'v-rt' }] } }));
        return mockChannel;
      },
      unsubscribe: (c) => c.unsubscribe()
    };

    const q = new QueueOrchestrator(mockAdapter);
    await q.initialize();

    const p = new Promise((resolve) => q.on('realtime:player-updated', resolve));
    await q.startRealtime('electron-player-1');
    const payload = await p;

    expect(q.getState().nowPlaying).toEqual({ id: 'v-rt' });
    expect(q.getState().activeQueue.length).toBeGreaterThan(0);
  });
});
