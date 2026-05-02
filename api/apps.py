from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"
    label = "api"

    def ready(self):
        from django.db.models.signals import post_migrate

        post_migrate.connect(_seed_initial_bootstrap, sender=self)


def _seed_initial_bootstrap(sender, **kwargs):
    from .utils import create_first_bootstrap_data

    create_first_bootstrap_data()
