-- Enable contrib extensions used for geographic distance queries on
-- drone_space.user_profile. See alembic migration 0004 for the index.
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
