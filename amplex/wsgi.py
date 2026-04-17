"""WSGI config for Amplex."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "amplex.settings")

application = get_wsgi_application()
