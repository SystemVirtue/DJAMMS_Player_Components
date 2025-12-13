class MeTubeManager {
  constructor() {
    this.running = false;
  }

  async start(cfg = {}) {
    // stub: pretend to start
    this.running = true;
    this._cfg = cfg;
    return true;
  }

  async stop() {
    this.running = false;
    return true;
  }

  getStatus() {
    return { running: !!this.running };
  }

  async submitDownload(url) {
    // stub: return mock id
    return `dl_${Date.now()}`;
  }
}

module.exports = MeTubeManager;
