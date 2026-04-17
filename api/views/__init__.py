"""Health check endpoint."""

import logging

from django.db import connections
from django.http import JsonResponse

logger = logging.getLogger("amplex")


def health_check(request):
    checks = {"api": True, "database": False}
    try:
        connections["default"].ensure_connection()
        checks["database"] = True
    except (ConnectionError, OSError) as e:
        logger.warning("Health check DB failure: %s", e)

    ok = all(checks.values())
    return JsonResponse(
        {
            "status": "ok" if ok else "degraded",
            "product": "amplex",
            "version": "2.0.0",
            "checks": checks,
        },
        status=200 if ok else 503,
    )
