import asyncio

from app.services.board_access import (
    board_access_denial,
    board_allowed,
    register_board_access_gate,
)


def test_board_access_is_not_limited_by_registered_entitlement_gate():
    async def deny_access(_websocket, _board_kind):
        return False

    register_board_access_gate(deny_access)
    try:
        assert asyncio.run(board_access_denial(object(), 'stm32-bluepill')) is None
        assert asyncio.run(board_allowed(object(), 'raspberry-pi-4')) is True
    finally:
        register_board_access_gate(None)
