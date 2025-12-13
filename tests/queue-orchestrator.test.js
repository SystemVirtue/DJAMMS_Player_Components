const QueueOrchestrator = require('../src/integration/queue-orchestrator');

describe('QueueOrchestrator (basic)', () => {
  let q;

  beforeEach(() => { q = new QueueOrchestrator(); });

  test('initial state is idle', () => {
    expect(q.getState().status).toBe('idle');
  });

  test('addVideo pushes into activeQueue', async () => {
    await q.addVideo({ id: 'v1', title: 'Test Video' });
    expect(q.getState().activeQueue.length).toBe(1);
    expect(q.getState().activeQueue[0].id).toBe('v1');
  });

  test('skip advances nowPlaying', async () => {
    await q.addVideo({ id: 'v1', title: 'First' });
    await q.addVideo({ id: 'v2', title: 'Second' });
    // initial nowPlaying null
    await q.skip();
    // skip set nowPlaying to first item
    expect(q.getState().nowPlaying).not.toBe(null);
  });

  test('addPriorityRequest inserts into priorityQueue and advance respects priority', async () => {
    // priority request with http src should be converted to a simple video object
    const req = { id: 'r1', video_source: 'http://priority.video/1', priority_score: 100 };
    const added = await q.addPriorityRequest(req);
    expect(added).not.toBeNull();
    expect(q.getState().priorityQueue.length).toBe(1);

    // regular queue video
    await q.addVideo({ id: 'v1', title: 'Regular' });

    // advanceQueue should pick priority first
    const next = await q.advanceQueue();
    expect(next).not.toBeNull();
    expect(next.id).toBe('http://priority.video/1');
  });

  test('handleAdminCommand can add video and load playlist via localFileManager', async () => {
    const local = {
      getPlaylistByPath: async (p) => ({ videos: [{ id: 'p1', title: 'Playlist One' }, { id: 'p2', title: 'Playlist Two' }] })
    };
    const q2 = new QueueOrchestrator(null, local);
    expect(q2.getState().activeQueue.length).toBe(0);

    await q2.handleAdminCommand({ action_type: 'add_video', action_data: { id: 'x1', title: 'Added' } });
    expect(q2.getState().activeQueue.length).toBe(1);

    // load playlist and replace queue
    await q2.handleAdminCommand({ action_type: 'load_playlist', action_data: { playlist_path: '/tmp/test', replace_queue: true } });
    expect(q2.getState().activeQueue.length).toBeGreaterThanOrEqual(2);
  });
});
