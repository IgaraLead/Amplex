#!/usr/bin/env python3
"""
Amplex: shared-login users already live in ``amplex_users`` with ``hub_id`` set.

To add **local passwords** for org-managed users (no Hub), use the CRM Settings
API ``POST .../crm/hub/users`` (local handler) or Django shell::

  from django.contrib.auth.hashers import make_password
  from api.models import AmplexUser
  u = AmplexUser.objects.get(email=\"...\")
  u.password_hash = make_password(\"new-secret\")
  u.save(update_fields=[\"password_hash\"])

Existing JWTs without ``auth_kind`` continue to resolve as ``shared`` until re-login.
"""

if __name__ == "__main__":
    print(__doc__)
