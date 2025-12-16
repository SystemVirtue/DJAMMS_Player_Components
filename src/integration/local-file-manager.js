const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { pathToFileURL } = require('url');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class LocalFileManager {
  constructor(rootPath) {
    this.root = rootPath || (process.env.HOME ? path.join(process.env.HOME, 'Music', 'DJAMMS') : null);
  }

  // Parse artist and title from filename
  // Supports formats: "Artist - Title.mp4" or "Title [Artist].mp4"
  parseVideoInfo(filename) {
    const name = path.parse(filename).name; // remove extension

    // Try "Title [Artist]" format first
    const bracketMatch = name.match(/^(.+?)\s*\[(.+?)\]$/);
    if (bracketMatch) {
      return {
        title: bracketMatch[1].trim(),
        artist: bracketMatch[2].trim()
      };
    }

    // Try "Artist - Title" format
    const dashMatch = name.match(/^(.+?)\s*-\s*(.+)$/);
    if (dashMatch) {
      return {
        artist: dashMatch[1].trim(),
        title: dashMatch[2].trim()
      };
    }

    // Fallback: use whole name as title
    return {
      title: name,
      artist: 'Unknown'
    };
  }

  // Extract metadata from MP4 file using ffmpeg
  async extractMetadata(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve({}); // Return empty metadata on error
          return;
        }

        const info = {};
        if (metadata.format && metadata.format.duration) {
          info.duration = Math.round(metadata.format.duration);
        }

        if (metadata.format && metadata.format.size) {
          info.size = metadata.format.size;
        }

        // Extract title/artist from metadata if available
        if (metadata.format && metadata.format.tags) {
          const tags = metadata.format.tags;
          if (tags.title) info.title = tags.title;
          if (tags.artist) info.artist = tags.artist;
          if (tags.album) info.album = tags.album;
        }

        resolve(info);
      });
    });
  }

  // Return an array of video file objects found inside a playlist folder path
  // skipMetadata: if true, skip slow metadata extraction (for fast scanning)
  async getPlaylistByPath(playlistPath, skipMetadata = false) {
    if (!playlistPath) return null;
    try {
      const stat = fs.statSync(playlistPath);
      if (!stat.isDirectory()) return null;
    } catch (e) {
      return null;
    }

    const files = fs.readdirSync(playlistPath).sort();
    const videoExts = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.mpg', '.mpeg']);

    const videos = [];

    for (const file of files) {
      const absPath = path.join(playlistPath, file);
      try {
        const s = fs.statSync(absPath);
        if (!s.isFile()) continue;
      } catch (e) { continue; }

      if (!videoExts.has(path.extname(absPath).toLowerCase())) continue;

      // Parse filename for artist/title
      const fileInfo = this.parseVideoInfo(file);

      // Extract metadata from file (skip if fast scan mode)
      let metadata = {};
      if (!skipMetadata) {
        metadata = await this.extractMetadata(absPath);
      }

      // Always emit a properly formatted file:// URL so Windows paths work
      const fileUrl = pathToFileURL(absPath).href;

      const video = {
        id: absPath, // use absolute path as id for local files
        title: metadata.title || fileInfo.title,
        artist: metadata.artist || fileInfo.artist,
        path: absPath,
        src: fileUrl,
        sourceType: 'local',
        duration: metadata.duration || 0, // Will be extracted later if needed
        size: metadata.size,
        album: metadata.album
      };

      videos.push(video);
    }

    return { name: path.basename(playlistPath), path: playlistPath, videos };
  }

  // Convenience: load default playlist from env if available
  async getDefaultPlaylist() {
    const def = process.env.DJAMMS_DEFAULT_PLAYLIST_PATH || process.env.DJAMMS_PLAYLISTS_FOLDER_PATH;
    if (!def) return null;
    return this.getPlaylistByPath(def);
  }

  async scanDJAMMSLibrary() {
    if (!this.root || !fs.existsSync(this.root)) {
      return { playlists: [], collections: [] };
    }

    const playlists = [];
    const collections = [];

    // Scan PLAYLISTS folder
    const playlistsPath = path.join(this.root, 'PLAYLISTS');
    if (fs.existsSync(playlistsPath)) {
      try {
        const playlistDirs = fs.readdirSync(playlistsPath)
          .map(name => path.join(playlistsPath, name))
          .filter(p => {
            try {
              return fs.statSync(p).isDirectory();
            } catch (e) { return false; }
          });

        for (const playlistPath of playlistDirs) {
          // Use fast scan mode (skip metadata) to prevent timeout
          const playlist = await this.getPlaylistByPath(playlistPath, true);
          if (playlist && playlist.videos.length > 0) {
            playlists.push(playlist);
          }
        }
      } catch (e) {
        console.warn('Error scanning PLAYLISTS:', e.message);
      }
    }

    // Scan COLLECTIONS folder
    const collectionsPath = path.join(this.root, 'COLLECTIONS');
    if (fs.existsSync(collectionsPath)) {
      try {
        const collectionDirs = fs.readdirSync(collectionsPath)
          .map(name => path.join(collectionsPath, name))
          .filter(p => {
            try {
              return fs.statSync(p).isDirectory();
            } catch (e) { return false; }
          });

        for (const collectionPath of collectionDirs) {
          // Use fast scan mode (skip metadata) to prevent timeout
          const collection = await this.getPlaylistByPath(collectionPath, true);
          if (collection && collection.videos.length > 0) {
            collections.push(collection);
          }
        }
      } catch (e) {
        console.warn('Error scanning COLLECTIONS:', e.message);
      }
    }

    return { playlists, collections };
  }

  async getPlaylistByName(name) {
    if (!name || !this.root) return null;

    // Search in PLAYLISTS
    const playlistsPath = path.join(this.root, 'PLAYLISTS');
    if (fs.existsSync(playlistsPath)) {
      const playlistPath = path.join(playlistsPath, name);
      const playlist = await this.getPlaylistByPath(playlistPath);
      if (playlist) return playlist;
    }

    // Search in COLLECTIONS
    const collectionsPath = path.join(this.root, 'COLLECTIONS');
    if (fs.existsSync(collectionsPath)) {
      const collectionPath = path.join(collectionsPath, name);
      const collection = await this.getPlaylistByPath(collectionPath);
      if (collection) return collection;
    }

    return null;
  }

  async resolveVideo(pathOrId) {
    // Very small resolution logic: if starts with http, return as remote source
    if (!pathOrId) return null;
    if (typeof pathOrId === 'string' && pathOrId.startsWith('http')) {
      return { id: pathOrId, title: pathOrId, src: pathOrId, sourceType: 'url' };
    }

    // If it's an object, assume it's already a video object
    if (typeof pathOrId === 'object') return pathOrId;

    // If a local file exists, return basic object
    if (fs.existsSync(pathOrId)) {
      return { id: pathOrId, title: path.basename(pathOrId), path: pathOrId, sourceType: 'local' };
    }

    return null;
  }
}

module.exports = LocalFileManager;
