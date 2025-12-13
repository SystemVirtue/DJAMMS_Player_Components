const fs = require('fs');
const os = require('os');
const path = require('path');
const LocalFileManager = require('../src/integration/local-file-manager');

describe('LocalFileManager', () => {
  let tmpdir;

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'djamms-test-'));
  });

  afterEach(() => {
    // cleanup
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e) {}
  });

  test('getPlaylistByPath returns null for missing path or non-dir', async () => {
    const mgr = new LocalFileManager(tmpdir);
    const missing = await mgr.getPlaylistByPath('/no/such/path');
    expect(missing).toBeNull();

    // create a file (not directory)
    const f = path.join(tmpdir, 'file.txt');
    fs.writeFileSync(f, 'hello');
    const notDir = await mgr.getPlaylistByPath(f);
    expect(notDir).toBeNull();
  });

  test('getPlaylistByPath returns video objects for supported extensions', async () => {
    const playlistDir = path.join(tmpdir, 'My Playlist');
    fs.mkdirSync(playlistDir);
    // create some files
    const f1 = path.join(playlistDir, 'A.mp4'); fs.writeFileSync(f1, 'x');
    const f2 = path.join(playlistDir, 'B.txt'); fs.writeFileSync(f2, 'x');
    const f3 = path.join(playlistDir, 'C.webm'); fs.writeFileSync(f3, 'x');

    const mgr = new LocalFileManager(tmpdir);
    const res = await mgr.getPlaylistByPath(playlistDir);
    expect(res).not.toBeNull();
    expect(res.name).toBe('My Playlist');
    expect(Array.isArray(res.videos)).toBe(true);
    // should include only .mp4 and .webm (sorted alphabetically)
    expect(res.videos.length).toBe(2);
    expect(res.videos[0].title).toMatch(/A|C/);
    expect(res.videos[0].src.startsWith('file://')).toBe(true);
  });

  test('getDefaultPlaylist falls back to DJAMMS_DEFAULT_PLAYLIST_PATH environment', async () => {
    const playlistDir = path.join(tmpdir, 'DefaultPl'); fs.mkdirSync(playlistDir);
    const f1 = path.join(playlistDir, 'D.mp4'); fs.writeFileSync(f1, 'x');

    process.env.DJAMMS_DEFAULT_PLAYLIST_PATH = playlistDir;
    const mgr = new LocalFileManager(tmpdir);
    const def = await mgr.getDefaultPlaylist();
    expect(def).not.toBeNull();
    expect(def.videos.length).toBe(1);
    delete process.env.DJAMMS_DEFAULT_PLAYLIST_PATH;
  });

  test('resolveVideo recognizes http/source and objects and local paths', async () => {
    const mgr = new LocalFileManager(tmpdir);
    const r1 = await mgr.resolveVideo('http://example.com/video.mp4');
    expect(r1).not.toBeNull(); expect(r1.sourceType).toBe('url');

    const obj = { id: 'x', title: 'X' };
    const r2 = await mgr.resolveVideo(obj);
    expect(r2).toEqual(obj);

    const f = path.join(tmpdir, 'Z.mp4'); fs.writeFileSync(f, 'x');
    const r3 = await mgr.resolveVideo(f);
    expect(r3).not.toBeNull(); expect(r3.sourceType).toBe('local');
  });
});
