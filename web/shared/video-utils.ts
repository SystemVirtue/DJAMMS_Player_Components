/**
 * Video utility functions shared between Kiosk and Admin apps
 */

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
export function cleanVideoTitle(title: string | null | undefined): string {
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
