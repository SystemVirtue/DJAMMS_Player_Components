/**
 * Array utility functions shared between Kiosk and Admin apps
 */

/**
 * Shuffle an array using the Fisher-Yates algorithm
 * Returns a new shuffled array (does not mutate the original)
 * 
 * @param array - The array to shuffle
 * @returns A new array with shuffled elements
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

