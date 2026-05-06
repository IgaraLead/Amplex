from django.urls import include, path, re_path

from .views import spa_asset, spa_catch_all

urlpatterns = [
    path("amplex/api/", include("api.urls")),
    path("assets/<path:path>", spa_asset),
    re_path(r".*", spa_catch_all),
]
