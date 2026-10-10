/** Choose unique regions; prefer those absent from the previous page view. */
export function selectDestinations(
  candidates: readonly string[],
  limit: number,
  previous: readonly string[] = [],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...new Set(candidates)];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const seen = new Set(previous);
  const fresh = shuffled.filter((id) => !seen.has(id));
  const repeated = shuffled.filter((id) => seen.has(id));
  return [...fresh, ...repeated].slice(0, Math.max(0, Math.floor(limit)));
}

export function readPreviousDestinations(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
