"""
Multi-database router for Amplex.

Amplex uses a single database (igaralead) with two kinds of tables:
  - Amplex-owned tables (amplex_*) — fully managed
  - Hub shared tables (organizations, users, etc.) — managed=False

Auth/contenttypes are installed for utility functions only — no tables needed.
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
