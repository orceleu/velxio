/** Kept as a compatibility shim for integrations that still import this API. */
export function getProQueryOverride(): boolean | null {
  return null;
}

/** All features are available without a URL-based entitlement switch. */
export function isProUnlocked(): boolean {
  return true;
}
