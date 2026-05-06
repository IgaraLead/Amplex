"""
Database router for Amplex.

Single-database MVP; skip migrating Django contrib auth/contenttypes tables.
"""


class AmplexRouter:
    _skip_migrate = {"auth", "contenttypes"}

    def db_for_read(self, model, **hints):
        return None

    def db_for_write(self, model, **hints):
        return None

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in self._skip_migrate:
            return False
        return None
