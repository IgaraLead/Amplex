"""Pytest configuration for Amplex."""

import os


def pytest_configure(config):
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "amplex.settings_test")
    import django

    django.setup()
