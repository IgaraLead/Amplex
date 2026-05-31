from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0003_global_super_admin_seats"),
    ]

    operations = [
        migrations.AddField(
            model_name="amplexuser",
            name="force_password_change",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="amplexuser",
            name="session_version",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
