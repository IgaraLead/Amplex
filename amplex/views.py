from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound

_index_path = Path(settings.WHITENOISE_ROOT) / "index.html"


def spa_catch_all(request):
    """Serve the SPA index.html for any route not matched by the API."""
    if _index_path.is_file():
        return FileResponse(open(_index_path, "rb"), content_type="text/html")
    return HttpResponseNotFound("Frontend not built")
