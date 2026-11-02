/**
 * The board gate distinguishes PLACING a Pro board from RUNNING it, and a
 * block may carry the words for the prompt.
 *
 * An overlay that lets everyone draw a circuit around an STM32 and sells the
 * run needs to answer 'add' and 'run' differently; before 2026-09 the seam
 * asked one question and the picker refused the board outright. And a
 * refusal has to be able to say why — the generic "is a Pro feature" line
 * was the only sentence the seam could produce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_RUN_REFUSED_EVENT,
  blockedByBoardGate,
  boardGateDecision,
  boardGateVerdict,
  installBoardGateImpl,
  reportBoardRunRefused,
} from '../lib/proBoardGate';

type Listener = (e: { detail: unknown }) => void;

/** Minimal window: the seam only needs dispatchEvent + CustomEvent. */
function installWindowStub() {
  const listeners = new Map<string, Listener[]>();
  const dispatched: Array<{ type: string; detail: unknown }> = [];
  const win = {
    location: { search: '' },
    addEventListener: (type: string, cb: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb]);
    },
    dispatchEvent: (e: { type: string; detail: unknown }) => {
      dispatched.push({ type: e.type, detail: e.detail });
      for (const cb of listeners.get(e.type) ?? []) cb(e);
      return true;
    },
  };
  (globalThis as unknown as { window: unknown }).window = win;
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  return { dispatched, win };
}

describe('board gate actions', () => {
  let stub: ReturnType<typeof installWindowStub>;

  beforeEach(() => {
    stub = installWindowStub();
  });
  afterEach(() => {
    installBoardGateImpl(null);
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
  });

  it('with no overlay everything is allowed, for both actions', () => {
    expect(boardGateVerdict('stm32-bluepill', 'add')).toEqual({ decision: 'allow' });
    expect(boardGateVerdict('stm32-bluepill', 'run')).toEqual({ decision: 'allow' });
    expect(boardGateDecision('raspberry-pi-4')).toBe('allow');
  });

  it('all board actions are allowed regardless of query parameters or installed gates', () => {
    stub.win.location.search = '?pro=false';
    installBoardGateImpl(() => 'block');
    expect(boardGateDecision('stm32-bluepill', 'add')).toBe('allow');
    expect(boardGateDecision('stm32-bluepill', 'run')).toBe('allow');
    expect(boardGateDecision('raspberry-pi-4', 'run')).toBe('allow');
  });

  it('a board gate implementation is not consulted', () => {
    const impl = vi.fn(() => 'block' as const);
    installBoardGateImpl(impl);
    expect(boardGateDecision('arduino-uno', 'run')).toBe('allow');
    expect(impl).not.toHaveBeenCalled();
  });

  it('a legacy gate implementation is not consulted', () => {
    const impl = vi.fn(() => 'block' as const);
    installBoardGateImpl(impl);
    expect(boardGateDecision('stm32-bluepill', 'add')).toBe('allow');
    expect(boardGateDecision('stm32-bluepill', 'run')).toBe('allow');
    expect(impl).not.toHaveBeenCalled();
  });

  it("boardGateDecision without an action allows the default 'run' request", () => {
    boardGateDecision('raspberry-pi-3');
    expect(boardGateVerdict('stm32-bluepill', 'run')).toEqual({ decision: 'allow' });
  });

  it('blockedByBoardGate never prompts for legacy gated boards', () => {
    installBoardGateImpl(() => ({
      decision: 'block',
      featureName: 'STM32 emulation',
      description: 'why this particular run is refused',
      requiredPlan: 'maker',
      cta: 'pricing',
    }));
    expect(blockedByBoardGate('stm32-bluepill', 'run')).toBe(false);
    expect(stub.dispatched).toEqual([]);
  });

  it('blockedByBoardGate on an allow fires nothing and returns false', () => {
    installBoardGateImpl(() => 'allow');
    expect(blockedByBoardGate('stm32-bluepill', 'add')).toBe(false);
    expect(stub.dispatched).toEqual([]);
  });

  it('a server refusal is reported as an event an overlay can listen for', () => {
    const got: unknown[] = [];
    stub.win.addEventListener(BOARD_RUN_REFUSED_EVENT, (e) => got.push(e.detail));
    reportBoardRunRefused({
      boardId: 'board-1',
      kind: 'stm32-bluepill',
      message: 'the server said no',
      code: 'some_overlay_code',
    });
    expect(got).toEqual([
      {
        boardId: 'board-1',
        kind: 'stm32-bluepill',
        message: 'the server said no',
        code: 'some_overlay_code',
      },
    ]);
  });
});
