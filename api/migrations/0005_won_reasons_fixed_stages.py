import django.db.models.deletion
from django.db import migrations, models


def seed_fixed_stages(apps, schema_editor):
    AmplexOrganization = apps.get_model("api", "AmplexOrganization")
    Stage = apps.get_model("api", "Stage")
    for org in AmplexOrganization.objects.all():
        won_sequence = 900
        lost_sequence = 1000
        Stage.objects.update_or_create(
            org=org,
            name="Ganho",
            defaults={
                "sequence": won_sequence,
                "is_won": True,
                "is_lost": False,
                "is_fixed": True,
            },
        )
        Stage.objects.update_or_create(
            org=org,
            name="Perdido",
            defaults={
                "sequence": lost_sequence,
                "is_won": False,
                "is_lost": True,
                "is_fixed": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0004_amplexuser_password_reset_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="stage",
            name="is_fixed",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="stage",
            name="is_lost",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="WonReason",
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
                ("name", models.CharField(max_length=255)),
                ("active", models.BooleanField(default=True)),
                (
                    "org",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="won_reasons",
                        to="api.amplexorganization",
                    ),
                ),
            ],
            options={
                "db_table": "amplex_won_reasons",
            },
        ),
        migrations.AddField(
            model_name="lead",
            name="won_reason",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to="api.wonreason",
            ),
        ),
        migrations.RunPython(seed_fixed_stages, migrations.RunPython.noop),
    ]
