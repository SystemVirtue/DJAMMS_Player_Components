// utils/playlistHelpers.ts

/**
 * Get display name for a playlist folder, stripping YouTube Playlist ID prefix if present.
 * 
 * Naming convention:
 * - YouTube sourced: "{PlaylistID}.{PlaylistName}" e.g., "PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu.DJAMMS_Default"
 * - Non-YouTube: "{PlaylistName}" e.g., "Karaoke Collection"
 * 
 * @param folderName - The original playlist folder name
 * @returns The display name without YouTube Playlist ID prefix
 */
export function getPlaylistDisplayName(folderName: string): string {
  if (!folderName) return '';
  
  // Check if folder name starts with YouTube playlist ID pattern
  // YouTube playlist IDs typically start with "PL" and are 34 characters
  // Pattern: PLxxxxxx followed by dot or underscore, then the display name
  // Examples:
  //   "PLN9QqCogPsXIoSObV0F39OZ_MlRZ9tRT9.Obie Nights" -> "Obie Nights"
  //   "PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu_DJAMMS_Default" -> "DJAMMS_Default"
  const youtubeIdMatch = folderName.match(/^PL[A-Za-z0-9_-]+[._](.+)$/);
  if (youtubeIdMatch) {
    return youtubeIdMatch[1];
  }
  
  return folderName;
}

/**
 * Get the display artist string, returning empty string if artist is null/undefined
 * 
 * @param artist - The artist name or null
 * @returns The artist name or empty string
 */
export function getDisplayArtist(artist: string | null | undefined): string {
  return artist || '';
}

/**
 * Check if a filename conforms to the expected format:
 * "[Youtube_ID] | [Artist_Name] - [Song_Title].mp4"
 * Also accepts middle dot (·) and bullet (•) as separators (Windows may substitute these for |)
 * 
 * @param filename - The video filename
 * @returns true if filename matches expected format
 */
export function isValidVideoFilename(filename: string): boolean {
  if (!filename) return false;
  
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Valid separators: pipe (|), middle dot (·), bullet (•) - with surrounding spaces
  // Windows may substitute | with · or • when copying/renaming files
  const separatorPattern = / [|·•] /;
  const separatorMatch = nameWithoutExt.match(separatorPattern);
  
  if (!separatorMatch) return false;
  
  // Part after separator must have " - " separator for Artist - Title
  const afterSeparator = nameWithoutExt.substring(separatorMatch.index! + separatorMatch[0].length);
  return afterSeparator.includes(' - ');
}

/**
 * Clean a video title by removing YouTube IDs and separators.
 * Handles various formats that may occur due to Windows character substitution:
 * - "[YouTube_ID] | Artist - Title" -> "Artist - Title"
 * - "[YouTube_ID] · Artist - Title" -> "Artist - Title"  (middle dot U+00B7)
 * - "[YouTube_ID] • Artist - Title" -> "Artist - Title"  (bullet U+2022)
 * - Also handles other Unicode characters Windows might substitute
 * 
 * This function should be used when DISPLAYING titles to ensure clean output
 * even if filename parsing failed during indexing.
 * 
 * @param title - The raw title string (may contain YouTube ID and separator)
 * @returns The cleaned title suitable for display
 */
export function cleanVideoTitle(title: string): string {
  if (!title) return 'Unknown';
  
  // Match known separators with surrounding spaces: | · • 
  // Also match any character that's not alphanumeric or common punctuation
  // surrounded by spaces (catches Windows character substitutions)
  const separatorPattern = / [|·•\u00B7\u2022\u2219\uFFFD] /;
  const separatorMatch = title.match(separatorPattern);
  
  if (separatorMatch && separatorMatch.index !== undefined) {
    // Return everything AFTER the separator
    title = title.substring(separatorMatch.index + separatorMatch[0].length);
  }
  
  // If no separator found, check for bracketed ID at the start: [xxxxx] 
  // This handles cases where the separator was completely mangled
  const bracketPattern = /^\s*\[[^\]]{8,15}\]\s*/;
  title = title.replace(bracketPattern, '');
  
  // Also remove any remaining bracketed IDs in the middle/end
  title = title
    .replace(/\s*\[[A-Za-z0-9_-]{10,15}\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return title || 'Unknown';
}
