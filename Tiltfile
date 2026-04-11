# Orka - Virtual Product Manager MVP
# Local development with Tilt + docker-compose

# ─── Infrastructure ────────────────────────────────────────────
docker_compose('./tilt/docker-compose.yml')

dc_resource('postgres', labels=['infra'])
dc_resource('redis', labels=['infra'])

# ─── Intake API ────────────────────────────────────────────────
docker_build(
    'orka-intake-api',
    '.',
    dockerfile='apps/intake-api/Dockerfile',
    live_update=[
        sync('./packages/draft-schema/src', '/app/packages/draft-schema/src'),
        sync('./packages/shared-types/src', '/app/packages/shared-types/src'),
        sync('./apps/intake-api/src', '/app/apps/intake-api/src'),
        run('cd /app && pnpm --filter @orka/shared-types build && pnpm --filter @orka/draft-schema build && pnpm --filter @orka/intake-api build',
            trigger=['./packages/draft-schema/src', './packages/shared-types/src']),
    ],
)

# For dev, override to use tsx watch instead of compiled JS
local_resource(
    'intake-api',
    serve_cmd='pnpm --filter @orka/intake-api dev',
    deps=['apps/intake-api/src', 'packages/draft-schema/src', 'packages/shared-types/src'],
    resource_deps=['postgres', 'redis', 'mcp-gateway'],
    labels=['services'],
    env={
        'DB_HOST': 'localhost',
        'DB_PORT': '5432',
        'DB_NAME': 'orka',
        'DB_USER': 'orka',
        'DB_PASSWORD': 'orka',
        'REDIS_URL': 'redis://localhost:6379',
        'PORT': '4000',
        'CORS_ORIGIN': 'http://localhost:5173',
        # MCP Gateway
        'MCP_GATEWAY_URL': 'http://localhost:4001',
        # Claude via Vertex AI — inherits from shell env
        'ANTHROPIC_VERTEX_PROJECT_ID': os.environ.get('ANTHROPIC_VERTEX_PROJECT_ID', 'gen-ai-preview'),
        'GOOGLE_CLOUD_LOCATION': os.environ.get('GOOGLE_CLOUD_LOCATION', 'us-east5'),
        'CLOUD_ML_REGION': os.environ.get('CLOUD_ML_REGION', 'us-east5'),
        'GOOGLE_APPLICATION_CREDENTIALS': os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', ''),
    },
)

# ─── MCP Gateway ───────────────────────────────────────────────
local_resource(
    'mcp-gateway',
    serve_cmd='pnpm --filter @orka/mcp-gateway dev',
    deps=['apps/mcp-gateway/src', 'packages/shared-types/src'],
    labels=['services'],
    env={
        'PORT': '4001',
    },
)

# ─── Intake UI ─────────────────────────────────────────────────
local_resource(
    'intake-ui',
    serve_cmd='pnpm --filter @orka/intake-ui dev',
    deps=['apps/intake-ui/src'],
    resource_deps=['intake-api'],
    labels=['services'],
)

# ─── Preview Browser Service ───────────────────────────────────
local_resource(
    'preview-browser',
    serve_cmd='pnpm --filter @orka/preview-browser dev',
    deps=['apps/preview-browser/src'],
    labels=['services'],
    env={
        'PORT': '4002',
        'ALLOWED_PREVIEW_HOSTS': 'localhost,127.0.0.1,*.asurion.net,*.aws.asurion.net',
    },
)

# ─── Mock App (for Visual Intake testing) ──────────────────────
local_resource(
    'mock-app',
    serve_cmd='python3 -m http.server 3001 --directory apps/mock-app',
    deps=['apps/mock-app'],
    labels=['services'],
)

# ─── Orka Browser Extension ────────────────────────────────────
local_resource(
    'orka-extension',
    cmd='pnpm --filter @orka/extension build',
    deps=['apps/orka-extension/src', 'apps/orka-extension/manifest.json', 'apps/orka-extension/popup'],
    labels=['tools'],
)

# ─── DB Migrations ─────────────────────────────────────────────
local_resource(
    'db-migrate',
    cmd='pnpm --filter @orka/intake-api migrate',
    resource_deps=['postgres'],
    deps=['apps/intake-api/src/db/migrations'],
    labels=['setup'],
    env={
        'DB_HOST': 'localhost',
        'DB_PORT': '5432',
        'DB_NAME': 'orka',
        'DB_USER': 'orka',
        'DB_PASSWORD': 'orka',
    },
)
