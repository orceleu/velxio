"""Compatibility helpers for board access.

Board access is no longer restricted by subscription entitlement. The
registration API remains for extensions that still call it, but board starts
are allowed regardless of any registered gate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, Union


@dataclass(frozen=True)
class BoardAccessDenial:
    """A refusal with its own words. ``code`` names the reason for machines
    (the client shows ``message`` and may key a prompt on ``code``)."""

    message: str
    code: str = 'pro_board'


BoardAccessGate = Callable[[object, str], Awaitable[Union[bool, BoardAccessDenial]]]


def owner_key(websocket: object) -> "str | None":
    """Stable, opaque id for "the same person" across tabs.

    The session cookie is hashed rather than stored: this is only used to
    count concurrent guests per user, so the value never needs to be read
    back. Falls back to the client host when there is no cookie (desktop
    sidecar, tests), and to None when there is neither.

    Lives here rather than in the simulation route because the QEMU board
    lane, which enforces the per-owner guest capacity, is a pluggable
    extension and must not import the route (that would be a cycle).
    """
    import hashlib

    try:
        token = websocket.cookies.get('access_token')  # type: ignore[attr-defined]
    except Exception:
        token = None
    if token:
        return 'u:' + hashlib.sha256(token.encode()).hexdigest()[:16]
    host = getattr(getattr(websocket, 'client', None), 'host', None)
    return f'h:{host}' if host else None


def register_board_access_gate(fn: Optional[BoardAccessGate]) -> None:
    """Compatibility no-op for extensions that still register a board gate."""


async def board_access_denial(
    _websocket: object, _board_kind: str,
) -> Optional[BoardAccessDenial]:
    """Compatibility API: board access is always allowed."""
    return None


async def board_allowed(_websocket: object, _board_kind: str) -> bool:
    """True if this session may start the given board."""
    return True
