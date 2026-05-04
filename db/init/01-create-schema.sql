-- Postgres runs every .sql file in /docker-entrypoint-initdb.d once on first
-- container start (when the data directory is empty). Creating the schema
-- here keeps the "schema lives in pg" concern out of the application layer;
-- the application then uses Alembic only to manage table changes inside it.

CREATE SCHEMA IF NOT EXISTS drone_space;

-- Make drone_space the default schema for the application role so unqualified
-- table names (e.g. "videos") resolve there before falling back to public.
ALTER ROLE drone IN DATABASE drone SET search_path = drone_space, public;
