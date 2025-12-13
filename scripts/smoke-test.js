const assert = require('assert');
const QueueOrchestrator = require('../src/integration/queue-orchestrator');

function run() {
  const q = new QueueOrchestrator();
  assert.strictEqual(q.getState().status, 'idle');
  q.addVideo({ id: 'x1', title: 'Sample' }).then(() => {
    assert.strictEqual(q.getState().activeQueue.length, 1);
    q.skip().then(() => {
      // skip sets nowPlaying to the first element (or null)
      console.log('smoke-test: OK');
    }).catch(err => { console.error('skip failed', err); process.exit(2); });
  }).catch(err => { console.error('addVideo failed', err); process.exit(2); });
}

run();
