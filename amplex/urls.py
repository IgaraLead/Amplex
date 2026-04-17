from django.urls import include, path, re_path

from .views import spa_catch_all

urlpatterns = [
    path("amplex/api/", include("api.urls")),
    re_path(r".*", spa_catch_all),
]
