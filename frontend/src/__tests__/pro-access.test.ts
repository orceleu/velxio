import { afterEach, describe, expect, it, vi } from 'vitest';
import { hardwareFlashAllowed, installHardwareFlashGate } from '../lib/proWebFlash';
import { boardGateDecision, boardGateVerdict, installBoardGateImpl } from '../lib/proBoardGate';
import { installSdCardUploadGate, sdCardUploadAllowed } from '../lib/proSdCardGate';
import { isProUnlocked } from '../lib/proAccess';

afterEach(() => {
  installHardwareFlashGate(null);
  installBoardGateImpl(null);
  installSdCardUploadGate(null);
  vi.unstubAllGlobals();
});

describe('Pro query override and /editor/pro unlocking', () => {
  it('pro=false blocks hardware flashing despite an allowing gate', () => {
    installHardwareFlashGate({ allowed: () => true, upgradeUrl: '/pricing' });
    vi.stubGlobal('window', { location: { search: '?pro=false', pathname: '/editor' } });
    expect(hardwareFlashAllowed()).toBe(false);
  });

  it('pro=true enables hardware flashing despite a blocking gate', () => {
    installHardwareFlashGate({ allowed: () => false, upgradeUrl: '/pricing' });
    vi.stubGlobal('window', { location: { search: '?pro=true', pathname: '/editor' } });
    expect(hardwareFlashAllowed()).toBe(true);
  });

  it('http://localhost:5173/editor/pro?pro=true unlocks pro features (board gate, sd card, isProUnlocked)', () => {
    installBoardGateImpl(() => 'block');
    installSdCardUploadGate(() => false);
    vi.stubGlobal('window', {
      location: {
        pathname: '/editor/pro',
        search: '?pro=true',
      },
    });

    expect(isProUnlocked()).toBe(true);
    expect(boardGateDecision('stm32-bluepill', 'run')).toBe('allow');
    expect(boardGateVerdict('stm32-bluepill', 'run')).toEqual({ decision: 'allow' });
    expect(sdCardUploadAllowed()).toBe(true);
    expect(hardwareFlashAllowed()).toBe(true);
  });

  it('http://localhost:5173/editor/pro?pro=false keeps pro features locked', () => {
    installBoardGateImpl(() => 'allow');
    installSdCardUploadGate(() => true);
    vi.stubGlobal('window', {
      location: {
        pathname: '/editor/pro',
        search: '?pro=false',
      },
    });

    expect(isProUnlocked()).toBe(false);
    expect(boardGateDecision('stm32-bluepill', 'run')).toBe('block');
    expect(boardGateVerdict('stm32-bluepill', 'run')).toEqual({ decision: 'block' });
    expect(sdCardUploadAllowed()).toBe(false);
    expect(hardwareFlashAllowed()).toBe(false);
  });

  it('http://localhost:5173/editor/pro without ?pro=true keeps pro features locked', () => {
    vi.stubGlobal('window', {
      location: {
        pathname: '/editor/pro',
        search: '',
      },
    });

    expect(isProUnlocked()).toBe(false);
    expect(boardGateDecision('stm32-bluepill', 'run')).toBe('block');
    expect(sdCardUploadAllowed()).toBe(false);
    expect(hardwareFlashAllowed()).toBe(false);
  });
});

