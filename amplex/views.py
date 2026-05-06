import logging
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound

_index_path = Path(settings.WHITENOISE_ROOT) / "index.html"
logger = logging.getLogger(__name__)


def spa_catch_all(request):
    """Serve the SPA index.html for any route not matched by the API."""
    if _index_path.is_file():
        try:
            return FileResponse(open(_index_path, "rb"), content_type="text/html")
        except OSError:
            logger.exception("Failed to open SPA index at %s", _index_path)
    return HttpResponseNotFound("Frontend not built")
