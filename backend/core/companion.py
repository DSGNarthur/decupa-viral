"""A loopback-only companion for Arthur's Vercel frontend.

The pairing capability exists only for this backend process. It is never sent
to a Vercel Function. Native same-origin access keeps its original behavior.
"""
import os
import secrets
from urllib.parse import urlparse

ORIGIN = 'https://decupa-viral.vercel.app'
_token = secrets.token_urlsafe(32)


def enabled():
    return os.environ.get('DECUPA_COMPANION', '') == '1'


def trusted_origin(origin):
    return enabled() and origin == ORIGIN


def authorized(value):
    return bool(value) and secrets.compare_digest(value, _token)


def link():
    return ORIGIN + '/#pc=' + _token


def local_origin(value, port):
    if not value:
        return True
    parsed = urlparse(value)
    return parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1') and parsed.port == port
