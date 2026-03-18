"""Amplex CRM Backend — FastAPI application entry point."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import (
    auth_routes,
    dashboard,
    pipeline,
    leads,
    interactions,
    contacts,
    stages,
    users,
    hub_users,
    tags,
    lost_reasons,
    sources,
    notifications,
    export,
    integrations,
    custom_fields,
    attachments,
    config,
)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Amplex CRM", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_routes.router)
app.include_router(dashboard.router)
app.include_router(pipeline.router)
app.include_router(leads.router)
app.include_router(interactions.router)
app.include_router(contacts.router)
app.include_router(stages.router)
app.include_router(users.router)
app.include_router(hub_users.router)
app.include_router(tags.router)
app.include_router(lost_reasons.router)
app.include_router(sources.router)
app.include_router(notifications.router)
app.include_router(export.router)
app.include_router(integrations.router)
app.include_router(custom_fields.router)
app.include_router(attachments.router)
app.include_router(config.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    logging.getLogger(__name__).info("Amplex CRM backend started — tables ensured")


@app.get("/amplex/api/health")
def health():
    return {"status": "ok"}
