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
 * 
 * BULLETPROOF DETECTION LOGIC:
 * YouTube video IDs are exactly 11 characters. Our filename format is:
 * "[11-char YouTube_ID] [separator] [Artist] - [Title].mp4"
 * 
 * This means:
 * - Characters 0-10: YouTube ID (11 chars)
 * - Character 11: space
 * - Character 12: separator (could be |, ·, •, or ANY corrupted/unknown character)
 * - Character 13: space
 * - Characters 14+: The actual "Artist - Title" content
 * 
 * Detection: If character at position 11 is a space AND character at position 13 is a space,
 * then we have a YouTube ID prefix. Strip the first 14 characters.
 * 
 * This handles ALL separator corruption scenarios including:
 * - Normal: | (pipe)
 * - Windows substitution: · (middle dot U+00B7)
 * - Windows substitution: • (bullet U+2022)
 * - Replacement character: � (U+FFFD)
 * - Any other corrupted/unknown character
 * 
 * @param title - The raw title string (may contain YouTube ID and separator)
 * @returns The cleaned title suitable for display
 */
export function cleanVideoTitle(title: string): string {
  if (!title) return 'Unknown';
  
  // BULLETPROOF: Check if string follows YouTube ID pattern:
  // Position 11 = space, Position 13 = space (meaning there's a separator at position 12)
  // Format: "xxxxxxxxxxx ? " where x = YT ID chars, ? = any separator
  if (title.length >= 14 && title.charAt(11) === ' ' && title.charAt(13) === ' ') {
    // Strip the first 14 characters: "[11-char ID] [sep] "
    title = title.substring(14);
  }
  
  // Fallback: Also try to match known separators with surrounding spaces anywhere in string
  // This catches edge cases where the ID might be slightly different length
  if (!title || title === 'Unknown') {
    return 'Unknown';
  }
  
  // Also remove any remaining bracketed IDs in the middle/end (e.g., "[dQw4w9WgXcQ]")
  title = title
    .replace(/\s*\[[A-Za-z0-9_-]{10,15}\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return title || 'Unknown';
}
