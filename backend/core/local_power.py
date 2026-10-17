# SPDX-License-Identifier: AGPL-3.0-only
"""Hold Windows idle sleep only while this event-loop thread has active jobs."""
import ctypes
import logging
import os
import sys

logger = logging.getLogger(__name__)
_held = False
_ES_CONTINUOUS = 0x80000000
_ES_SYSTEM_REQUIRED = 0x00000001


def keep_awake_for_jobs(active: bool) -> bool:
    """Call from the same thread for acquisition and release. Never changes a power plan."""
    global _held
    enabled = os.getenv('DECUPA_KEEP_AWAKE', 'true').lower() not in ('0', 'false', 'no')
    requested = bool(active and enabled)
    if sys.platform != 'win32' or requested == _held:
        return _held
    flags = _ES_CONTINUOUS | (_ES_SYSTEM_REQUIRED if requested else 0)
    try:
        if ctypes.windll.kernel32.SetThreadExecutionState(flags):
            _held = requested
        else:
            logger.warning('Windows did not accept the temporary sleep request')
    except (AttributeError, OSError):
        logger.warning('Temporary Windows sleep request is unavailable')
    return _held
