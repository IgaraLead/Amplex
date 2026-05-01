"""Channels URL routing (WebSocket)."""

from django.urls import re_path

from api.consumers import OrgRealtimeConsumer

websocket_urlpatterns = [
    re_path(
        r"^amplex/ws/org/(?P<slug>[\w-]+)/$",
        OrgRealtimeConsumer.as_asgi(),
    ),
]
