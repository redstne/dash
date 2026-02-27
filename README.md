<p align="center">
  <img src="https://raw.githubusercontent.com/redstne/dash/main/.github/banner.png" alt="redstne.dash" height="60" />
</p>

<h1 align="center">redstne.dash</h1>
<p align="center">A self-hosted Minecraft server management dashboard — built with Elysia, React 19, and Bun.</p>

<p align="center">
  <a href="https://github.com/redstne/dash/actions/workflows/docker.yml">
    <img src="https://github.com/redstne/dash/actions/workflows/docker.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/docker-ghcr.io%2Fredstne%2Fdash-blue" alt="Docker" />
  <img src="https://img.shields.io/badge/bun-1.3.9-f9f1e1" alt="Bun" />
</p>

---

## Features

- 🖥️ **Console** — live terminal with WebSocket RCON
- 👥 **Players** — online list, heads, ban / kick / op
- 📦 **Plugins** — Modrinth search, URL install, PLUGINS_FILE managed
- 📁 **Files** — browse and edit server files in-browser
- 📊 **Analytics** — TPS, player count, memory over time
- 💾 **Backups** — local, S3, SFTP, Google Drive, or any rclone remote
- 🗓️ **Scheduler** — cron-style tasks (restart, commands…)
- 🔔 **Webhooks** — Discord / HTTP notifications
- 🌍 **Worlds** — list and manage world folders
- ✅ **Whitelist** — manage the player whitelist
- 🔒 **Members** — role-based access (viewer / operator / admin)
- 📋 **Audit log** — every action is recorded
- 🌐 **Public status page** — shareable server status without login

---

## Quick start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Create a working directory

```bash
mkdir redstne && cd redstne
```

### 2. Download the compose file

```bash
curl -O https://raw.githubusercontent.com/redstne/dash/main/docker-compose.yml
```

### 3. Set the RCON password

```bash
echo "MC_RCON_PASSWORD=changeme" > .env
```

> Replace `changeme` with a strong password. This is the only required variable.

### 4. Start the stack

```bash
docker compose up -d
```

The dashboard is now available at **http://localhost:3001**.

### 5. Log in

On first boot, the admin account is created automatically and the credentials are printed to the logs:

```bash
docker compose logs dashboard | grep -i admin
```

Look for a line like:
```json
{"level":"info","msg":"admin account created","email":"admin@localhost","password":"<generated>"}
```

---

## Configuration

All settings are optional — the stack works out of the box with just `MC_RCON_PASSWORD`.

| Variable | Default | Description |
|---|---|---|
| `MC_RCON_PASSWORD` | *(required)* | RCON password for the bundled Minecraft container |
| `BASE_URL` | `http://localhost:3001` | Public URL — set when behind a reverse proxy |
| `SECURE_COOKIES` | `false` | Set `true` behind an HTTPS reverse proxy |
| `REDSTNE_ADMIN_EMAIL` | `admin@localhost` | Override the auto-created admin email |
| `REDSTNE_ADMIN_PASSWORD` | *(generated)* | Override the auto-created admin password |
| `PORT` | `3001` | Dashboard listen port |
| `DB_PATH` | `data/redstne.db` | SQLite database path |

### Auto-generated secrets

`BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are generated on first start and saved to `data/.secrets`. They persist across restarts automatically — no manual configuration needed.

### Adding extra Minecraft servers

```env
# In .env
MC_SERVER_2_NAME=Creative
MC_SERVER_2_HOST=my-other-mc-server
MC_SERVER_2_PORT=25575
MC_SERVER_2_PASSWORD=secret
```

Or as JSON:

```env
MC_SERVERS=[{"name":"Survival","host":"mc1","rconPort":25575,"rconPassword":"secret"},{"name":"Creative","host":"mc2","rconPort":25575,"rconPassword":"secret2"}]
```

---

## Reverse proxy with Traefik

A ready-to-use Traefik compose file is included at `docker-compose.traefik.yml`.

### Requirements

- A domain pointing to your server
- Traefik running (or use the file below to start it)

### Setup

```bash
# 1. Clone / download both compose files
curl -O https://raw.githubusercontent.com/redstne/dash/main/docker-compose.traefik.yml

# 2. Configure your domain and email
cp .env.example .env
# Edit .env:
#   MC_RCON_PASSWORD=strongpassword
#   BASE_URL=https://dash.example.com
#   SECURE_COOKIES=true
#   TRAEFIK_DOMAIN=dash.example.com
#   TRAEFIK_ACME_EMAIL=you@example.com

# 3. Create the external Traefik network (once)
docker network create traefik

# 4. Start
docker compose -f docker-compose.traefik.yml up -d
```

HTTPS is handled automatically via Let's Encrypt.

---

## Data persistence

All data is stored in `./data/` on the host:

| Path | Contents |
|---|---|
| `data/redstne.db` | SQLite database |
| `data/.secrets` | Auto-generated auth & encryption keys |
| `data/backups/` | Local backups (default destination) |
| `data/mc/` | Mounted Minecraft server files (shared volume) |

---

## Development

```bash
# Install dependencies
bun install

# Start both API (port 3001) and Vite dev server (port 5173)
bun run dev

# Type-check
cd packages/api && bun run tsc --noEmit
cd packages/web && bun run tsc --noEmit

# Apply DB migrations
cd packages/api && bun run db:migrate

# Regenerate migration files after schema changes
cd packages/api && bun run db:generate
```

The Vite dev server proxies `/api` to the API at `:3001` — run both at the same time.

---

## Docker image

```
ghcr.io/redstne/dash:latest
```

Multi-arch: `linux/amd64` and `linux/arm64`. Published on every push to `main`.

---

## License

MIT

