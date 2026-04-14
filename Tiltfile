# Orka — Virtual Product Manager MVP
# All services run as Docker containers via docker-compose
# Tilt provides live_update for hot reload without full rebuilds

# ─── Docker Compose ────────────────────────────────────────────
docker_compose('./tilt/docker-compose.yml')

# ─── Labels ────────────────────────────────────────────────────
dc_resource('postgres', labels=['infra'])
dc_resource('redis', labels=['infra'])
dc_resource('minio', labels=['infra'])
dc_resource('minio-init', labels=['infra'])
dc_resource('intake-api', labels=['services'])
dc_resource('intake-ui', labels=['services'])
dc_resource('mcp-gateway', labels=['services'])
dc_resource('preview-browser', labels=['services'])
dc_resource('mock-app', labels=['services'])

# ─── Live Updates (sync source into running containers) ────────

# Intake API: sync source files, tsx watch auto-restarts
dc_resource('intake-api',
  resource_deps=['postgres', 'redis'],
  trigger_mode=TRIGGER_MODE_AUTO,
)

# Intake UI: Vite HMR handles hot reload automatically
dc_resource('intake-ui',
  resource_deps=['intake-api'],
  trigger_mode=TRIGGER_MODE_AUTO,
)

# MCP Gateway
dc_resource('mcp-gateway',
  trigger_mode=TRIGGER_MODE_AUTO,
)

# Preview Browser
dc_resource('preview-browser',
  trigger_mode=TRIGGER_MODE_AUTO,
)

# ─── DB Migrations ─────────────────────────────────────────────
# Run migrations inside the intake-api container after it starts
# Wait for the API to be healthy before running migrations
local_resource(
    'db-migrate',
    cmd='sleep 5 && docker compose -f tilt/docker-compose.yml exec -T intake-api pnpm --filter @orka/intake-api migrate',
    resource_deps=['intake-api'],
    deps=['apps/intake-api/src/db/migrations'],
    labels=['setup'],
    auto_init=True,
)

# ─── Extension Build ──────────────────────────────────────────
local_resource(
    'orka-extension',
    cmd='pnpm --filter @orka/extension build',
    deps=['apps/orka-extension/src', 'apps/orka-extension/manifest.json'],
    labels=['tools'],
)
