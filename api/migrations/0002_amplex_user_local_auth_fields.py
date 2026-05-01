from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="amplexuser",
            name="password_hash",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="amplexuser",
            name="is_platform_super_admin",
            field=models.BooleanField(default=False),
        ),
    ]
