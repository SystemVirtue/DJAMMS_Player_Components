/**
 * Thumbnail utility functions for Kiosk UI
 * Handles YouTube ID extraction and thumbnail path construction
 */

/**
 * Extract YouTube ID from video filename
 * Format: '[Artist] - [Song Title] -- [Youtube_ID].mp4'
 * YouTube ID is the last 11 characters before the .mp4 extension
 */
export function extractYouTubeId(filename: string): string | null {
  if (!filename) return null;
  
  // Get just the filename without path
  const justFilename = filename.split('/').pop() || filename;
  
  // Check if it ends with .mp4
  if (!justFilename.toLowerCase().endsWith('.mp4')) {
    return null;
  }
  
  // Remove .mp4 extension
  const nameWithoutExt = justFilename.slice(0, -4);
  
  // Get the last 11 characters before .mp4
  if (nameWithoutExt.length >= 11) {
    const last11 = nameWithoutExt.slice(-11);
    // Basic validation: YouTube IDs are alphanumeric (and sometimes contain - or _)
    if (/^[a-zA-Z0-9_-]{11}$/.test(last11)) {
      return last11;
    }
  }
  
  return null;
}

/**
 * Construct thumbnail path from YouTube ID and thumbnails folder path
 * Format: {thumbnailsPath}/{youtubeId}.thumb.250.png
 * Returns djamms:// protocol URL for Electron, or empty string for web (thumbnails not accessible)
 */
export function getThumbnailPath(youtubeId: string, thumbnailsPath: string): string {
  if (!youtubeId || !thumbnailsPath) return '';
  
  // Check if we're in Electron (has electronAPI)
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    // Ensure thumbnailsPath doesn't end with slash
    const cleanPath = thumbnailsPath.replace(/\/$/, '');
    const fullPath = `${cleanPath}/${youtubeId}.thumb.250.png`;
    // Use djamms:// protocol for Electron
    return `djamms://${fullPath}`;
  }
  
  // For web browsers, we can't access local files directly via file:// protocol
  // Return empty string - components will show black background
  // In the future, thumbnails could be served via HTTP server
  return '';
}

/**
 * Check if thumbnail file exists
 * Note: In browser environment, we can't directly check file existence
 * This function attempts to load the image and returns a promise
 * that resolves to true if the image loads successfully
 */
export function checkThumbnailExists(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!path) {
      resolve(false);
      return;
    }
    
    // In web browsers, we can't access local files via file:// protocol
    // Only allow http/https or djamms:// protocols
    if (typeof window !== 'undefined' && !(window as any).electronAPI) {
      // Web browser context - only allow http/https URLs
      if (!path.startsWith('http://') && !path.startsWith('https://')) {
        resolve(false);
        return;
      }
    }
    
    const img = new Image();
    
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    
    // Use the path as-is (should be djamms:// for Electron or http/https for web)
    img.src = path;
    
    // Timeout after 2 seconds
    setTimeout(() => resolve(false), 2000);
  });
}

/**
 * Get thumbnail URL for a video
 * Returns the thumbnail path, which can be used as img src
 * The browser will handle 404s naturally with onerror handlers
 * Works with both SupabaseLocalVideo and QueueVideoItem
 */
export function getThumbnailUrl(video: { filename?: string; path?: string; file_path?: string }, thumbnailsPath: string): string {
  const filename = video.filename || video.path || video.file_path || '';
  const actualFilename = filename.split('/').pop() || filename;
  const youtubeId = extractYouTubeId(actualFilename);
  
  if (!youtubeId) {
    return ''; // Return empty string to indicate no thumbnail
  }
  
  return getThumbnailPath(youtubeId, thumbnailsPath);
}

