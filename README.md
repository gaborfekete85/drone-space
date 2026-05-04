# DroneSpace

Drone-footage library: upload videos with GPS metadata, browse them by
location, organize them into a per-user folder hierarchy. Local files are the
source of truth; Postgres holds the structured metadata; an optional S3 bucket
mirrors the same hierarchy for off-site storage.

---

## Components

| Component | Stack | Port | Notes |
|-----------|-------|------|-------|
| Frontend  | Next.js 14 (App Router), Tailwind, Clerk | `3000` | Same-origin proxy at `/api/backend/*` → backend, so the browser never speaks to the backend directly. |
| Backend   | FastAPI, SQLAlchemy 2, Alembic, boto3, psycopg 3 | `8000` (private inside compose) | Owns the file system layout, runs migrations on startup, mirrors uploads to S3 in the background. |
| Database  | PostgreSQL 16 | `5432` | Schema: `drone_space`. Init script creates the schema; Alembic creates the table. |
| Storage   | Local volume + optional S3 | — | Local lives at `./app_data/videos/<user_id>/...`; S3 mirror at `s3://<bucket>/<user_id>/...` (same hierarchy). |

### Repository layout

```
.
├── frontend/                  Next.js app — everything browser-facing lives here
│   ├── app/                   Routes (dashboard, my-videos, sign-in/up)
│   ├── components/            React components (VideoExplorer, MyVideos, UploadVideoModal, ThemeToggle…)
│   ├── public/                Static assets (drone hero image, etc.)
│   ├── middleware.ts          Clerk auth gate (everything except /, /sign-in, /sign-up requires auth)
│   ├── next.config.mjs        Standalone build + /api/backend/* rewrite to BACKEND_INTERNAL_URL
│   ├── tailwind.config.js     darkMode: "class" + brand palette
│   ├── tsconfig.json          @/* import alias, paths relative to frontend/
│   ├── package.json
│   ├── Dockerfile             Multi-stage image (deps → build → runner)
│   └── .env.local             Picked up by `next dev` for local development
│
├── backend/
│   ├── main.py                FastAPI app: /api/folders, /api/upload, /api/cover, /api/stream, /api/health
│   ├── db.py                  SQLAlchemy engine, run_migrations(), insert_video()
│   ├── s3.py                  Optional S3 mirror (folder markers + upload bundle)
│   ├── alembic.ini
│   ├── alembic/               env.py, script.py.mako, versions/
│   ├── Dockerfile             Slim Python 3.12 image
│   └── requirements.txt
│
├── db/
│   └── init/                  *.sql files run once on first Postgres init
│
├── app_data/                  Local video store (mounted into the backend at /app_data)
│   └── videos/<user_id>/<folder>/.../<file>.mp4 (+ .meta.json + _cover.jpg)
│
├── docker-compose.yml         Three services on a private network, one named volume for pgdata
└── .env                       Source of truth for compose interpolation + service runtime env
```

---

## Configuration

All configuration lives in a single `.env` at the repository root. Compose
auto-loads it for variable interpolation **and** the frontend/backend services
inject it as runtime env via `env_file:`.

### Required

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | frontend (build + runtime) | Clerk public key. **NEXT_PUBLIC_** vars are inlined into the client bundle at build time, so this needs to be set during `next build`. |
| `CLERK_SECRET_KEY` | frontend (runtime) | Server-side Clerk secret. |

### Frontend Clerk URLs (defaults are sane, override only if you change routes)

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/dashboard` |

### Optional — S3 mirror

If `AWS_S3_BUCKET` is empty/unset the S3 path is skipped entirely; the local
stack keeps working. When set, every folder create and every upload is
mirrored to `s3://<bucket>/<prefix>/<user_id>/<folder>/...`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `AWS_S3_BUCKET` | _(empty — disabled)_ | Bucket name. |
| `AWS_S3_PREFIX` | _(empty)_ | Top-level prefix; leave empty for `<bucket>/<user_id>/...`. |
| `AWS_REGION` | `eu-central-1` | Bucket region. |
| `AWS_ACCESS_KEY_ID` | — | IAM key. |
| `AWS_SECRET_ACCESS_KEY` | — | IAM secret. |
| `AWS_SESSION_TOKEN` | — | Optional session token (STS). |

The IAM principal needs `s3:PutObject` on `arn:aws:s3:::<bucket>/<prefix>/*`.
boto3's standard credential chain is honored — env vars, shared config,
EC2/ECS roles, etc. — so you can also just leave the credential lines unset
and let it fall through to whatever the host has.

### Backend-internal (set by compose, override only for advanced cases)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+psycopg://drone:drone@db:5432/drone` | Postgres URL. |
| `APP_DATA_ROOT` | `/app_data` | Where the videos volume is mounted inside the backend container. |
| `BACKEND_INTERNAL_URL` | `http://backend:8000` | What the Next.js proxy rewrites to. Baked at frontend build time **and** read at runtime; both must agree. |

---

## Running with Docker (recommended)

Prereqs: Docker Desktop with `docker compose` v2.

1. Copy your Clerk keys into `.env` at the repo root:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

   Optionally fill in `AWS_*` if you want S3 mirroring.

2. Bring the stack up:

   ```bash
   docker compose up --build
   ```

   First boot does:
   - Postgres starts, runs `db/init/01-create-schema.sql` once → creates the `drone_space` schema.
   - Backend waits for `pg_isready`, then runs `alembic upgrade head` on startup → creates `drone_space.videos`.
   - Frontend builds with the Clerk publishable key + `BACKEND_INTERNAL_URL` baked into the client manifest.

3. Open <http://localhost:3000>.

### Useful compose commands

```bash
docker compose ps                       # status
docker compose logs -f backend          # tail backend logs
docker exec -it drone-db psql -U drone  # poke Postgres
docker compose down                     # stop, keep volume
docker compose down -v                  # stop + drop pgdata + re-init schema next boot
```

### What needs to be set in compose vs. `.env`

- `.env` (repo root) carries the **values** (Clerk keys, AWS creds, optional overrides).
- `docker-compose.yml` declares **wiring**: which services exist, what env they receive, the build context for the frontend (`./frontend`), the bind mounts (`./app_data → /app_data`, `./db/init → /docker-entrypoint-initdb.d`), the named volume `drone_pgdata`, and the `depends_on: db: condition: service_healthy` gate.
- `NEXT_PUBLIC_*` and `BACKEND_INTERNAL_URL` are passed as **build-args** in compose so they're inlined into the Next.js bundle/manifest at build time — runtime-only env wouldn't reach the static client code.

---

## Running locally (without Docker)

Useful when iterating on backend code or the React UI with hot reload. You'll
still want Postgres in a container — easiest path is "everything in compose
except the service you're hacking on".

### 1. Start just Postgres in compose

```bash
docker compose up -d db
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Point at the local docker postgres + a local app_data dir.
export DATABASE_URL='postgresql+psycopg://drone:drone@localhost:5432/drone'
export APP_DATA_ROOT="$PWD/../app_data"

# Optional S3 mirror — set these if you want uploads to also go to S3.
# export AWS_S3_BUCKET=drones-ch-store-dev-1
# export AWS_REGION=eu-central-1
# export AWS_ACCESS_KEY_ID=AKIA...
# export AWS_SECRET_ACCESS_KEY=...

uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The first run executes the Alembic migration against the local Postgres.

### 3. Frontend

The frontend reads `.env.local` for `npm run dev` (Next.js convention),
distinct from the `.env` Compose uses. Create `frontend/.env.local` with the
same Clerk values:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Where the dev server proxies /api/backend/* to.
BACKEND_INTERNAL_URL=http://127.0.0.1:8000
```

Then:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>.

#### Why both `.env` and `.env.local`

- `.env` (at the **repo root**) is for **Compose** — build-args + `env_file:`. Loaded automatically by `docker compose`.
- `frontend/.env.local` is for **Next.js dev** — `next dev` reads it. Compose does **not** read it.
- Same values, two files. Set up once and forget.

---

## Database migrations

Alembic config lives at [backend/alembic.ini](backend/alembic.ini) and
[backend/alembic/env.py](backend/alembic/env.py). The initial migration
([backend/alembic/versions/0001_create_videos_table.py](backend/alembic/versions/0001_create_videos_table.py))
creates `drone_space.videos`. Migrations run automatically when the backend
starts up (`db.run_migrations()` in the FastAPI lifespan), so there's no
manual step in normal operation.

To create a new migration:

```bash
cd backend
source .venv/bin/activate
export DATABASE_URL='postgresql+psycopg://drone:drone@localhost:5432/drone'
alembic revision -m "describe change"
# edit the generated file under alembic/versions/
alembic upgrade head     # apply locally; backend startup will pick it up too
```

Alembic stores its own version table at `drone_space.schema_migrations`
(configured in `env.py`).

---

## Request flow

```
browser  --(same origin)-->  frontend :3000  --(rewrite, compose net)-->  backend :8000  --> postgres :5432
                                                                                       \--> S3 (background task)
```

- Browser only ever talks to the frontend, so CORS never enters the picture.
- [frontend/next.config.mjs](frontend/next.config.mjs) rewrites `/api/backend/*` → `${BACKEND_INTERNAL_URL}/api/*`. In compose, that's `http://backend:8000`; locally, `http://127.0.0.1:8000`.
- Clerk middleware ([frontend/middleware.ts](frontend/middleware.ts)) protects everything except `/`, `/sign-in`, `/sign-up`, including the `/api/backend/*` proxy — so unauthenticated requests can't reach the backend even if the proxy is up.
- Uploads write the file + `*.meta.json` sidecar + optional `_cover.jpg` to disk, insert a row into `drone_space.videos`, then queue an S3 mirror as a FastAPI `BackgroundTask` (so the API response returns as soon as local + DB are durable).

---

## Storage layout

```
app_data/videos/<user_id>/<folder>/<sub>/...
                                  ├── flight1.mp4
                                  ├── flight1.mp4.meta.json
                                  └── flight1_cover.jpg
```

S3 mirror uses the same hierarchy under
`s3://<bucket>/<prefix>/<user_id>/...`. With `AWS_S3_PREFIX` empty the keys
sit straight under the bucket root.

---

## Troubleshooting

- **`docker compose logs backend` is silent after startup** — usually a `disable_existing_loggers=True` situation. The current `alembic/env.py` sets `disable_existing_loggers=False`; if you regenerate it, keep that flag.
- **Frontend says `ECONNREFUSED 127.0.0.1:8000` in compose** — the rewrite target was baked into `routes-manifest.json` at build time without `BACKEND_INTERNAL_URL` set. Rebuild the frontend image with the build-arg supplied (compose does this automatically).
- **Folder created locally but not in S3** — check the backend log for `s3: …`. The startup line tells you whether the bucket/credentials resolved; per-call failures are logged at `WARNING`.
- **Reset the database** — `docker compose down -v` drops the `drone_pgdata` volume; the next `up` re-runs init script + migrations from scratch.
