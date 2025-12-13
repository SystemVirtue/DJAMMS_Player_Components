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
 * Returns file:// URL for web browser compatibility
 */
export function getThumbnailPath(youtubeId: string, thumbnailsPath: string): string {
  if (!youtubeId || !thumbnailsPath) return '';
  
  // Ensure thumbnailsPath doesn't end with slash
  const cleanPath = thumbnailsPath.replace(/\/$/, '');
  const fullPath = `${cleanPath}/${youtubeId}.thumb.250.png`;
  
  // For web browsers, we need to use file:// protocol
  // Note: This may not work in all browsers due to security restrictions
  // The component will handle 404s gracefully with fallback to black background
  if (fullPath.startsWith('http://') || fullPath.startsWith('https://') || fullPath.startsWith('file://')) {
    return fullPath;
  }
  
  // Convert to file:// URL
  // Encode path segments to handle spaces and special characters
  const pathParts = fullPath.split('/');
  const encodedParts = pathParts.map((part, index) => {
    // Don't encode the first empty string (before leading /)
    if (index === 0 && part === '') return '';
    return encodeURIComponent(part);
  });
  return `file://${encodedParts.join('/')}`;
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
    
    const img = new Image();
    
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    
    // For local file paths, we need to use file:// protocol or serve via HTTP
    // In a web context, thumbnails should be served via HTTP server
    // For now, we'll try to load it and let the browser handle 404s
    img.src = path.startsWith('http') || path.startsWith('file://') 
      ? path 
      : `file://${path}`;
    
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

