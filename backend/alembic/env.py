"""Alembic runtime environment.

Reads the DATABASE_URL env var (set via docker-compose) so the same migration
scripts work in dev, docker and CI without editing alembic.ini.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

db_url = os.environ.get("DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

if config.config_file_name is not None:
    # `disable_existing_loggers=True` (the default) silently kills uvicorn's
    # access logger and every module logger created before Alembic runs, so
    # the application goes mute right after the migration step on startup.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# We use raw op.create_table calls in revision files, so no metadata target.
target_metadata = None

VERSION_TABLE = "schema_migrations"
VERSION_SCHEMA = "drone_space"


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table=VERSION_TABLE,
        version_table_schema=VERSION_SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table=VERSION_TABLE,
            version_table_schema=VERSION_SCHEMA,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
