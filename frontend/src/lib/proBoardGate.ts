/**
 * Legacy board-gate integration seam.
 *
 * Board classification and registration remain for compatibility, but the
 * client-side gate always allows boards. A backend can still report that a
 * runtime is unavailable; that is separate from frontend entitlement checks.
 */

import type { BoardKind } from '../types/board';
import { isPiBoardKind, isStm32BoardKind } from '../types/board';
import { getProBoard } from './proBoardRegistry';

export type BoardGateDecision = 'allow' | 'block';

/** What is being asked of the board: placing it, or starting it. */
export type BoardGateAction = 'add' | 'run';

/**
 * A 'block' with the words for the prompt. Every field is optional: a bare
 * 'block' string keeps the historical prompt (`proBoardFeatureName`).
 */
export interface BoardGateBlock {
  decision: 'block';
  /** Headline subject ("STM32 emulation"). Defaults to proBoardFeatureName. */
  featureName?: string;
  /** Second line of the prompt — the reason this particular run is refused. */
  description?: string;
  /** Cheapest plan that lifts the block. */
  requiredPlan?: 'maker' | 'pro';
  /** Which primary action the prompt offers: upgrade (default) or sign in. */
  cta?: 'pricing' | 'signin';
}

export type BoardGateVerdict = { decision: 'allow' } | BoardGateBlock;

/**
 * Static, public predicate retained for board metadata and legacy integrations.
 * STM32 (libqemu-arm) + every QEMU Raspberry Pi
 * (Zero/1/2/3/4/5; excludes the Pico, which is browser emulation).
 */
export function isProBoardKind(kind: BoardKind | string): boolean {
  return isStm32BoardKind(kind) || isPiBoardKind(kind);
}

type BoardGateImpl = (
  kind: BoardKind,
  action: BoardGateAction,
) => BoardGateDecision | BoardGateVerdict;

let _impl: BoardGateImpl | null = null;

/** Installed by the pro overlay (mountPro). Pass null to clear (hot reload). */
export function installBoardGateImpl(impl: BoardGateImpl | null): void {
  _impl = impl;
}

/** Whether the pro overlay has installed a gate (else OSS default applies). */
export function hasBoardGateImpl(): boolean {
  return _impl !== null;
}

/**
 * The legacy gate remains as an integration seam, but boards are available
 * without a paid entitlement in this build.
 */
export function boardGateVerdict(_kind: BoardKind, _action: BoardGateAction): BoardGateVerdict {
  return { decision: 'allow' };
}

/**
 * Decide whether `action` on a board of `kind` is allowed for the current
 * user — the boolean view of `boardGateVerdict`. `action` defaults to 'run',
 * the action every historical caller meant.
 */
export function boardGateDecision(kind: BoardKind, action: BoardGateAction = 'run'): BoardGateDecision {
  return boardGateVerdict(kind, action).decision;
}

/**
 * One-call form for the UI: evaluate the gate and, when it blocks, fire the
 * upgrade prompt with the verdict's words. Returns true when the caller
 * must stop. Keeps the three call sites (picker add, new-project add, run
 * backstop) from each re-deriving the prompt.
 */
export function blockedByBoardGate(kind: BoardKind, action: BoardGateAction): boolean {
  const verdict = boardGateVerdict(kind, action);
  if (verdict.decision === 'allow') return false;
  triggerProUpgradePrompt(verdict.featureName ?? proBoardFeatureName(kind), verdict);
  return true;
}

/**
 * Fire the Pro upgrade prompt. Dispatches the same CustomEvent the pro
 * overlay's UpgradeGate listens for (`PRO_UPGRADE_EVENT` in
 * proComponentInjector.ts). The event name is the stable contract — the OSS
 * app does not import from the overlay.
 */
const PRO_UPGRADE_EVENT = 'velxio-pro-upgrade-prompt';

export function triggerProUpgradePrompt(
  featureName: string,
  detail?: Pick<BoardGateBlock, 'description' | 'requiredPlan' | 'cta'>,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PRO_UPGRADE_EVENT, {
      detail: {
        componentName: featureName,
        featureName,
        ...(detail?.description ? { description: detail.description } : {}),
        ...(detail?.requiredPlan ? { requiredPlan: detail.requiredPlan } : {}),
        ...(detail?.cta ? { cta: detail.cta } : {}),
      },
    }),
  );
}

/**
 * The server refused to start a board (an `error` answer to start_pi /
 * start_stm32). The store already writes the message to the serial monitor
 * and stops the board; this tells whoever installed the gate, so an overlay
 * can refresh the state its verdict came from and prompt in place. The
 * event name is the contract; the OSS app dispatches and never listens.
 */
export const BOARD_RUN_REFUSED_EVENT = 'velxio-board-run-refused';

export interface BoardRunRefusedDetail {
  boardId: string;
  kind: string;
  message: string;
  /** Machine-readable reason when the server sent one (an overlay's own vocabulary). */
  code?: string;
}

export function reportBoardRunRefused(detail: BoardRunRefusedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BOARD_RUN_REFUSED_EVENT, { detail }));
}

/**
 * Human label for the upgrade prompt.
 *
 * An overlay board is named by its own label, not by the family whose run
 * path it borrows: `piFamily` routes the UNIHIKER M10 through the Raspberry
 * Pi bridge, and the prompt told its user that "Raspberry Pi emulation is a
 * Pro feature" about a board that is not a Raspberry Pi. The OSS families
 * keep their family names — every kind in them really is one.
 */
export function proBoardFeatureName(kind: BoardKind | string): string {
  const def = typeof kind === 'string' ? getProBoard(kind) : undefined;
  if (def) return `${def.label} emulation`;
  if (isStm32BoardKind(kind)) return 'STM32 emulation';
  if (isPiBoardKind(kind)) return 'Raspberry Pi emulation';
  return 'this board';
}
