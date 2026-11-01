/**
 * Client-side preview override for existing Pro gates.
 *
 * This query parameter is deliberately not an entitlement mechanism:
 * protected operations must still be authorized by their backend.
 */
export function getProQueryOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location?.search ?? '').get('pro');
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/**
 * Returns true if Pro features are unlocked.
 * Pro features are unlocked when `?pro=true` is present in the URL query string.
 * When `?pro=false` or when on a /pro route without `?pro=true`, pro features remain locked.
 */
export function isProUnlocked(): boolean {
  const override = getProQueryOverride();
  if (override !== null) return override;
  if (typeof window !== 'undefined') {
    const pathname = window.location?.pathname ?? '';
    if (pathname.includes('/pro')) {
      return false;
    }
  }
  return false;
}

