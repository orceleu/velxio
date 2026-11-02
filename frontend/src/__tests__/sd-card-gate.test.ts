/**
 * sd-card-gate.test.ts — microSD uploads remain available without entitlements.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { installSdCardUploadGate, sdCardUploadAllowed } from '../lib/proSdCardGate';

afterEach(() => {
  installSdCardUploadGate(null);
  vi.unstubAllGlobals();
});

describe('proSdCardGate', () => {
  it('allows uploads when no overlay is installed', () => {
    expect(sdCardUploadAllowed()).toBe(true);
  });

  it('ignores legacy gates and URL parameters', () => {
    const gate = vi.fn(() => false);
    installSdCardUploadGate(gate);
    vi.stubGlobal('window', { location: { search: '?pro=false', pathname: '/editor/pro' } });
    expect(sdCardUploadAllowed()).toBe(true);
    expect(gate).not.toHaveBeenCalled();
  });
});
