import { afterEach, describe, expect, it, vi } from 'vitest';
import { hardwareFlashAllowed, installHardwareFlashGate } from '../lib/proWebFlash';
import { boardGateDecision, boardGateVerdict, installBoardGateImpl } from '../lib/proBoardGate';
import { installSdCardUploadGate, sdCardUploadAllowed } from '../lib/proSdCardGate';
import { getProQueryOverride, isProUnlocked } from '../lib/proAccess';

afterEach(() => {
  installHardwareFlashGate(null);
  installBoardGateImpl(null);
  installSdCardUploadGate(null);
  vi.unstubAllGlobals();
});

describe('free feature access', () => {
  it('URL query parameters and installed entitlement gates cannot block features', () => {
    const boardGate = vi.fn(() => 'block' as const);
    const uploadGate = vi.fn(() => false);
    installHardwareFlashGate({ allowed: () => false, upgradeUrl: '/pricing' });
    installBoardGateImpl(boardGate);
    installSdCardUploadGate(uploadGate);
    vi.stubGlobal('window', {
      location: {
        pathname: '/editor/pro',
        search: '?pro=false',
      },
    });

    expect(getProQueryOverride()).toBeNull();
    expect(isProUnlocked()).toBe(true);
    expect(boardGateDecision('stm32-bluepill', 'run')).toBe('allow');
    expect(boardGateVerdict('stm32-bluepill', 'run')).toEqual({ decision: 'allow' });
    expect(sdCardUploadAllowed()).toBe(true);
    expect(hardwareFlashAllowed()).toBe(true);
    expect(boardGate).not.toHaveBeenCalled();
    expect(uploadGate).not.toHaveBeenCalled();
  });
});
