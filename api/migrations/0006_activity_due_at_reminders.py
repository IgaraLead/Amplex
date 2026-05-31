import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0005_won_reasons_fixed_stages"),
    ]

    operations = [
        migrations.AddField(
            model_name="activity",
            name="due_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.CreateModel(
            name="ActivityReminder",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("remind_at", models.DateTimeField(db_index=True)),
                ("offset_minutes", models.PositiveIntegerField()),
                ("dismissed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "activity",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reminders",
                        to="api.activity",
                    ),
                ),
            ],
            options={
                "db_table": "amplex_activity_reminders",
                "ordering": ["remind_at", "id"],
            },
        ),
    ]
