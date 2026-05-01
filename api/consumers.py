"""Django Channels consumers."""

import json
from http.cookies import CookieError, SimpleCookie

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from api.auth_utils import get_org_context


def _cookies_from_scope(scope) -> dict[str, str]:
    raw = b""
    for name, value in scope.get("headers") or []:
        if name == b"cookie":
            raw = value
            break
    if not raw:
        return {}
    try:
        text = raw.decode("latin1")
    except UnicodeDecodeError:
        return {}
    jar = SimpleCookie()
    try:
        jar.load(text)
    except CookieError:
        return {}
    return {k: m.value for k, m in jar.items() if m.value is not None}


@database_sync_to_async
def _authenticate_org_ws(cookies: dict[str, str], slug: str):
    class _Request:
        def __init__(self, c: dict[str, str]):
            self.COOKIES = c
            self.META: dict = {}

    return get_org_context(_Request(cookies), slug)


class OrgRealtimeConsumer(AsyncWebsocketConsumer):
    group_name: str

    async def connect(self):
        slug = self.scope["url_route"]["kwargs"]["slug"]
        cookies = _cookies_from_scope(self.scope)
        _user, org, err = await _authenticate_org_ws(cookies, slug)
        if err is not None or org is None:
            await self.close(code=4401)
            return
        self.group_name = f"amplex_org_{org.slug}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "group_name", None):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def crm_push(self, event):
        await self.send(text_data=json.dumps(event["payload"]))
