/**
 * Video utility functions shared between Kiosk and Admin apps
 */

/**
 * Clean a video title by removing YouTube IDs and separators.
 * Handles various formats that may occur due to Windows character substitution:
 * - "[YouTube_ID] | Artist - Title" -> "Artist - Title"
 * - "[YouTube_ID] · Artist - Title" -> "Artist - Title"  (middle dot U+00B7)
 * - "[YouTube_ID] • Artist - Title" -> "Artist - Title"  (bullet U+2022)
 * - Also handles other Unicode characters Windows might substitute (replacement char, etc.)
 * 
 * This function should be used when DISPLAYING titles to ensure clean output
 * even if filename parsing failed during indexing.
 * 
 * @param title - The raw title string (may contain YouTube ID and separator)
 * @returns The cleaned title suitable for display
 */
export function cleanVideoTitle(title: string | null | undefined): string {
  if (!title) return 'Unknown';
  
  // Match known separators with surrounding spaces: | · • 
  // Also match replacement character (U+FFFD) and other common substitutions
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
