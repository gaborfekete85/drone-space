#/bin/bash
# source ./.venv/bin/activate
export DATABASE_URL="postgresql+psycopg://drone:drone@localhost:5432/drone"
.venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000