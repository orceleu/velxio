/** Legacy install hook retained for integrations; file uploads are free. */

/** Installed by the pro overlay (mountPro). Pass null to clear (hot reload). */
export function installSdCardUploadGate(impl: (() => boolean) | null): void {
  void impl;
}

/** Whether the current user may upload files to the microSD card. */
export function sdCardUploadAllowed(): boolean {
  return true;
}
