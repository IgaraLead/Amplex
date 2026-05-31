"""Seed deterministic demo CRM data for local development."""

from datetime import timedelta
from random import Random

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
    Activity,
    AmplexOrganization,
    AmplexOrgMember,
    AmplexUser,
    Contact,
    Interaction,
    Lead,
    LostReason,
    Source,
    Stage,
    Tag,
    WonReason,
)

STAGES = [
    ("Novo", 10, False, False, False),
    ("Qualificacao", 20, False, False, False),
    ("Proposta", 30, False, False, False),
    ("Negociacao", 40, False, False, False),
    ("Ganho", 900, True, False, True),
    ("Perdido", 1000, False, True, True),
]

USERS = [
    ("Ana Souza", "ana@dev.local", "admin"),
    ("Bruno Lima", "bruno@dev.local", "member"),
    ("Carla Mendes", "carla@dev.local", "member"),
]

COMPANIES = [
    ("Aurora Tech", "contato@auroratech.dev", "11 4002-1010", "Sao Paulo", "SP"),
    ("Boreal Logistica", "comercial@boreal.dev", "41 3020-5588", "Curitiba", "PR"),
    ("Cacto Foods", "vendas@cactofoods.dev", "85 3030-8844", "Fortaleza", "CE"),
    (
        "Delta Energia",
        "relacionamento@deltaenergia.dev",
        "31 3222-1900",
        "Belo Horizonte",
        "MG",
    ),
    ("Estrela Labs", "hello@estrelalabs.dev", "21 3555-9080", "Rio de Janeiro", "RJ"),
]

PEOPLE = [
    ("Marina Alves", "marina.alves@example.dev", "Gerente de Operacoes"),
    ("Joao Pereira", "joao.pereira@example.dev", "Diretor Comercial"),
    ("Paula Nogueira", "paula.nogueira@example.dev", "Coordenadora de Compras"),
    ("Rafael Costa", "rafael.costa@example.dev", "CEO"),
    ("Livia Martins", "livia.martins@example.dev", "Head de Growth"),
]

LEADS = [
    (
        "Implantacao CRM - Aurora Tech",
        180000,
        "Novo",
        "Inbound",
        ["enterprise", "quente"],
    ),
    ("Expansao comercial - Boreal", 95000, "Qualificacao", "Indicacao", ["logistica"]),
    (
        "Pipeline nacional - Cacto Foods",
        130000,
        "Proposta",
        "Evento",
        ["food", "quente"],
    ),
    (
        "Renovacao comercial - Delta Energia",
        210000,
        "Negociacao",
        "Outbound",
        ["energia"],
    ),
    ("Setup growth - Estrela Labs", 76000, "Ganho", "Inbound", ["startup"]),
    (
        "Recuperacao de contas - Aurora Tech",
        45000,
        "Perdido",
        "Outbound",
        ["reativacao"],
    ),
    ("Nova filial sul - Boreal", 115000, "Novo", "Indicacao", ["logistica", "frio"]),
    ("Programa canais - Cacto Foods", 88000, "Qualificacao", "Evento", ["food"]),
    (
        "Conta estrategica - Delta Energia",
        260000,
        "Proposta",
        "Inbound",
        ["enterprise"],
    ),
    (
        "Automacao SDR - Estrela Labs",
        54000,
        "Negociacao",
        "Outbound",
        ["startup", "quente"],
    ),
]


class Command(BaseCommand):
    help = "Populate the development database with deterministic fictional CRM data."

    def handle(self, *args, **options):
        rng = Random(42)  # noqa: S311 - deterministic demo data, not security-sensitive
        org = self._get_or_create_org("Dev Org", "dev")
        branch = self._get_or_create_org("Filial Sul", "filial-sul")
        stages = self._seed_stages(org)
        branch_stages = self._seed_stages(branch)
        users = self._seed_users(org, branch)
        sources = self._seed_sources(org)
        tags = self._seed_tags(org)
        lost_reason = self._seed_lost_reasons(org)
        self._seed_won_reasons(org)
        companies, people = self._seed_contacts(org)
        leads = self._seed_leads(
            org=org,
            stages=stages,
            users=users,
            sources=sources,
            tags=tags,
            lost_reason=lost_reason,
            companies=companies,
            people=people,
            rng=rng,
        )
        self._seed_branch_data(branch, branch_stages, users)
        self._seed_interactions_and_activities(leads, users, rng)

        self.stdout.write(
            self.style.SUCCESS(
                "Demo data OK: "
                f"{AmplexOrganization.objects.count()} orgs, "
                f"{AmplexUser.objects.count()} users, "
                f"{Contact.objects.filter(org=org).count()} contacts, "
                f"{Lead.objects.filter(org=org, active=True, type='opportunity').count()} opportunities, "
                f"{Lead.objects.filter(org=org, active=True, stage__isnull=False).count()} pipeline cards"
            )
        )
        self.stdout.write("Demo users: ana@dev.local, bruno@dev.local, carla@dev.local")
        self.stdout.write("Password for demo users: demo12345")

    def _get_or_create_org(self, name, slug):
        org, _ = AmplexOrganization.objects.update_or_create(
            slug=slug,
            defaults={"name": name, "seat_limit": 0, "active": True},
        )
        return org

    def _seed_stages(self, org):
        stages = {}
        for name, sequence, is_won, is_lost, is_fixed in STAGES:
            stage, _ = Stage.objects.update_or_create(
                org=org,
                name=name,
                defaults={
                    "sequence": sequence,
                    "is_won": is_won,
                    "is_lost": is_lost,
                    "is_fixed": is_fixed,
                },
            )
            stages[name] = stage
        return stages

    def _seed_users(self, org, branch):
        users = []
        for name, email, role in USERS:
            user, _ = AmplexUser.objects.update_or_create(
                email=email,
                defaults={
                    "name": name,
                    "login": email,
                    "password_hash": make_password("demo12345"),
                    "active": True,
                    "is_super_admin": False,
                },
            )
            AmplexOrgMember.objects.update_or_create(
                org=org,
                user=user,
                defaults={"role": role, "active": True},
            )
            users.append(user)

        AmplexOrgMember.objects.update_or_create(
            org=branch,
            user=users[0],
            defaults={"role": "admin", "active": True},
        )
        AmplexOrgMember.objects.update_or_create(
            org=branch,
            user=users[1],
            defaults={"role": "member", "active": True},
        )
        return users

    def _seed_sources(self, org):
        names = ["Inbound", "Outbound", "Indicacao", "Evento", "Parceiro"]
        return {
            name: Source.objects.update_or_create(org=org, name=name, defaults={})[0]
            for name in names
        }

    def _seed_tags(self, org):
        names = [
            "enterprise",
            "quente",
            "frio",
            "logistica",
            "food",
            "energia",
            "startup",
            "reativacao",
        ]
        return {
            name: Tag.objects.update_or_create(
                org=org,
                name=name,
                defaults={"color": index},
            )[0]
            for index, name in enumerate(names, start=1)
        }

    def _seed_lost_reasons(self, org):
        reason, _ = LostReason.objects.update_or_create(
            org=org,
            name="Sem budget no trimestre",
            defaults={"active": True},
        )
        LostReason.objects.update_or_create(
            org=org,
            name="Concorrente escolhido",
            defaults={"active": True},
        )
        return reason

    def _seed_won_reasons(self, org):
        for name in ["Melhor aderencia", "Preco aprovado", "Relacionamento forte"]:
            WonReason.objects.update_or_create(
                org=org,
                name=name,
                defaults={"active": True},
            )

    def _seed_contacts(self, org):
        companies = []
        for name, email, phone, city, state in COMPANIES:
            contact, _ = Contact.objects.update_or_create(
                org=org,
                email=email,
                defaults={
                    "name": name,
                    "phone": phone,
                    "is_company": True,
                    "city": city,
                    "state_name": state,
                    "country_name": "Brasil",
                    "website": f"https://{name.lower().replace(' ', '')}.dev",
                    "active": True,
                },
            )
            companies.append(contact)

        people = []
        for index, (name, email, _function) in enumerate(PEOPLE):
            company = companies[index % len(companies)]
            contact, _ = Contact.objects.update_or_create(
                org=org,
                email=email,
                defaults={
                    "name": name,
                    "phone": company.phone,
                    "mobile": f"11 9{index + 1:04d}-{index + 3:04d}",
                    "is_company": False,
                    "city": company.city,
                    "state_name": company.state_name,
                    "country_name": "Brasil",
                    "active": True,
                },
            )
            people.append(contact)
        return companies, people

    def _seed_leads(
        self,
        *,
        org,
        stages,
        users,
        sources,
        tags,
        lost_reason,
        companies,
        people,
        rng,
    ):
        leads = []
        now = timezone.now()
        for index, (name, revenue, stage_name, source_name, tag_names) in enumerate(
            LEADS
        ):
            person = people[index % len(people)]
            company = companies[index % len(companies)]
            stage = stages[stage_name]
            lead, _ = Lead.objects.update_or_create(
                org=org,
                name=name,
                defaults={
                    "type": "opportunity",
                    "contact_name": person.name,
                    "email_from": person.email,
                    "phone": person.phone,
                    "mobile": person.mobile,
                    "expected_revenue": revenue,
                    "probability": 100 if stage.is_won else min(85, 15 + index * 8),
                    "priority": str(index % 4),
                    "description": f"Oportunidade ficticia para {company.name}.",
                    "function": PEOPLE[index % len(PEOPLE)][2],
                    "city": company.city,
                    "state_name": company.state_name,
                    "country_name": "Brasil",
                    "date_deadline": timezone.localdate()
                    + timedelta(days=rng.randint(3, 35)),
                    "date_closed": now - timedelta(days=2) if stage.is_won else None,
                    "active": True,
                    "stage": stage,
                    "contact": person,
                    "user": users[index % len(users)],
                    "source": sources[source_name],
                    "lost_reason": lost_reason if stage_name == "Perdido" else None,
                },
            )
            lead.tags.set([tags[tag_name] for tag_name in tag_names])
            leads.append(lead)
        return leads

    def _seed_branch_data(self, branch, stages, users):
        source, _ = Source.objects.update_or_create(
            org=branch, name="Inbound", defaults={}
        )
        company, _ = Contact.objects.update_or_create(
            org=branch,
            email="comercial@sul.dev",
            defaults={
                "name": "Sul Distribuidora",
                "phone": "51 3030-4444",
                "is_company": True,
                "city": "Porto Alegre",
                "state_name": "RS",
                "country_name": "Brasil",
                "active": True,
            },
        )
        Lead.objects.update_or_create(
            org=branch,
            name="Pipeline regional - Sul Distribuidora",
            defaults={
                "contact_name": "Sul Distribuidora",
                "email_from": "comercial@sul.dev",
                "phone": company.phone,
                "expected_revenue": 72000,
                "probability": 35,
                "priority": "2",
                "description": "Oportunidade ficticia para validar multi-organizacao.",
                "date_deadline": timezone.localdate() + timedelta(days=14),
                "stage": stages["Qualificacao"],
                "contact": company,
                "user": users[0],
                "source": source,
                "active": True,
            },
        )

    def _seed_interactions_and_activities(self, leads, users, rng):
        today = timezone.localdate()
        activity_types = ["todo", "call", "email", "meeting"]
        for index, lead in enumerate(leads):
            Interaction.objects.update_or_create(
                lead=lead,
                body=f"Contato inicial registrado para {lead.contact_name}.",
                defaults={
                    "interaction_type": "note",
                    "preview": "Contato inicial registrado.",
                    "author": users[index % len(users)],
                },
            )
            Activity.objects.update_or_create(
                lead=lead,
                summary=f"Follow-up com {lead.contact_name}",
                defaults={
                    "user": users[index % len(users)],
                    "activity_type": activity_types[index % len(activity_types)],
                    "note": "Validar proximo passo e atualizar probabilidade.",
                    "date_deadline": today + timedelta(days=rng.randint(-2, 10)),
                },
            )
