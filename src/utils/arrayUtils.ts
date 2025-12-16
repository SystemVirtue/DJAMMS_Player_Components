/**
 * Array utility functions
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

/**
 * Shuffle an array in place using the Fisher-Yates algorithm
 * Mutates the original array
 * 
 * @param array - The array to shuffle in place
 */
export function shuffleArrayInPlace<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

