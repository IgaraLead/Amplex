from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0002_amplex_user_local_auth_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="amplexorganization",
            name="platform_quotas",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
