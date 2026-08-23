# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------- build
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Dependencies first, so editing source does not invalidate the install layer.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY scripts ./scripts

# `build` runs vite and then check-offline, which fails on any remote reference in the bundle.
# Running it here means an image can never be produced from a build that broke the offline promise.
RUN bun run build

# --------------------------------------------------------------------------- runtime
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# The server imports nothing but node: builtins and its own files — React and every other
# dependency is already bundled into dist — so the runtime image carries no node_modules at all.
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/shared ./src/shared

# package.json is here for one field: the version the server reports over /api/stats. Its
# dependencies are already in dist and nothing installs from it at runtime.
COPY --from=build /app/package.json ./package.json

ENV NODE_ENV=production \
    TTDL_VIEWER_ROOT=/archives \
    TTDL_VIEWER_API_PORT=4174 \
    # Inside a container, 127.0.0.1 is reachable only from the container itself, so the loopback
    # default would make the published port answer nothing. The isolation that the default
    # protects on a laptop is provided here by the network namespace and by which port you
    # publish — see https://ttdl-viewer.orlovsky.dev/guides/docker/ before mapping this to
    # 0.0.0.0 on the host.
    TTDL_VIEWER_HOST=0.0.0.0

# Archives are mounted read-only, and nothing is written anywhere, so there is no reason to be root.
USER bun

# Metadata only, and it cannot read the variable above — so it names the default. Override the
# port and this line says nothing useful, but nothing depends on it either.
EXPOSE 4174

# Shell form, so the port is read at run time. Spelled out because overriding
# TTDL_VIEWER_API_PORT while the check kept probing 4174 made the container flap unhealthy while
# serving perfectly well.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${TTDL_VIEWER_API_PORT}/api/stats" > /dev/null || exit 1

CMD ["bun", "src/server/index.ts"]
