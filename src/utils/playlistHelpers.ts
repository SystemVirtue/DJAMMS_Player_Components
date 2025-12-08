// utils/playlistHelpers.ts

/**
 * Format duration in seconds to MM:SS format
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted duration string (e.g., "3:45")
 */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) {
    return '—';
  }
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse video filename into artist and title components.
 * 
 * Expected filename format: "[Artist Name] - [Song Title] -- [YouTube_ID].mp4"
 * Examples:
 *   "The Verve - Bitter Sweet Symphony -- _UWOHofs0kA.mp4"
 *   "Neil Young - Heart of Gold -- X3lA6pIVank.mp4"
 * 
 * @param filename - The video filename (with or without .mp4 extension)
 * @returns Object with artist and title, or null values if parsing fails
 */
export function parseVideoFilename(filename: string): { artist: string | null; title: string | null; youtubeId: string | null } {
  if (!filename) {
    return { artist: null, title: null, youtubeId: null };
  }

  // Remove file extension
  const nameWithoutExt = filename.replace(/\.mp4$/i, '');
  
  // Pattern: [Artist] - [Title] -- [YouTube_ID]
  // YouTube ID is after " -- " (double dash with spaces)
  const doubleHyphenIndex = nameWithoutExt.lastIndexOf(' -- ');
  
  if (doubleHyphenIndex === -1) {
    // No YouTube ID separator found, try to parse as "Artist - Title"
    const singleHyphenIndex = nameWithoutExt.indexOf(' - ');
    if (singleHyphenIndex !== -1) {
      return {
        artist: nameWithoutExt.substring(0, singleHyphenIndex).trim(),
        title: nameWithoutExt.substring(singleHyphenIndex + 3).trim(),
        youtubeId: null
      };
    }
    // Can't parse, return the whole thing as title
    return { artist: null, title: nameWithoutExt.trim(), youtubeId: null };
  }
  
  // Extract YouTube ID (everything after " -- ")
  const youtubeId = nameWithoutExt.substring(doubleHyphenIndex + 4).trim();
  
  // Extract Artist and Title from the part before " -- "
  const artistAndTitle = nameWithoutExt.substring(0, doubleHyphenIndex);
  const singleHyphenIndex = artistAndTitle.indexOf(' - ');
  
  if (singleHyphenIndex === -1) {
    // No artist separator, treat whole thing as title
    return { artist: null, title: artistAndTitle.trim(), youtubeId };
  }
  
  return {
    artist: artistAndTitle.substring(0, singleHyphenIndex).trim(),
    title: artistAndTitle.substring(singleHyphenIndex + 3).trim(),
    youtubeId
  };
}

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
 * Clean a video title by removing YouTube IDs.
 * This is a simplified version since parseVideoFilename() now handles proper parsing.
 * 
 * @param title - The title string
 * @returns The cleaned title suitable for display
 */
export function cleanVideoTitle(title: string): string {
  if (!title) return 'Unknown';
  return title.trim() || 'Unknown';
}
