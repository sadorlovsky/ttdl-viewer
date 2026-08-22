---
title: Running it in Docker
description: An image of Bun plus a few hundred kilobytes, a read-only mount, and a port published to loopback.
---

The runtime image carries no `node_modules` at all: the server imports nothing but `node:` builtins
and its own files, and React and everything else is already bundled into `dist` at build time. So
the image is Bun plus a few hundred kilobytes of application.

```bash
docker compose up -d --build
```

Then open <http://127.0.0.1:4174> on the host.

Point it at your archives with the `TTDL_ARCHIVES` variable — the left side of the volume is the
directory ttdl writes into, the right side must stay `/archives`:

```bash
TTDL_ARCHIVES=$HOME/code/ttdl/downloads docker compose up -d --build
```

Or without compose:

```bash
docker build -t ttdl-viewer .
docker run -d --name ttdl-viewer \
  -v "$HOME/code/ttdl/downloads:/archives:ro" \
  -p 127.0.0.1:4174:4174 \
  ttdl-viewer
```

Two things about that command are deliberate:

- **`:ro`.** The viewer never writes to an archive by design; mounting read-only makes the kernel
  enforce it, so no bug in here can touch a download.
- **`127.0.0.1:4174:4174`.** This publishes the port to the host only. Use `-p 4174:4174` to reach
  it from other machines on your network — but there is no login in front of it, so only do that on
  a network you trust.

## The published image

Every tag is built for `linux/amd64` and `linux/arm64` and pushed to GitHub Packages, so a NAS or a
Pi does not build anything itself:

```bash
docker pull ghcr.io/sadorlovsky/ttdl-viewer:0.1.0
```

| Tag | What it is |
|---|---|
| `0.1.0` | One release. The only tag that never moves |
| `0.1` | The newest patch of that minor version |
| `latest` | The newest release that is not a prerelease |
| `edge` | The current `main`, rebuilt on every push |
| `sha-<commit>` | One commit on `main` |

`edge` has passed the same checks a release has: the workflow that pushes it runs the tests, the
typecheck, the linter and the offline guard first. Nothing else has been said about it, so pin an
exact version on a machine you do not want changing under you.

In `docker-compose.yml`, comment out `build` and uncomment `image`:

```yaml
services:
  ttdl-viewer:
    # build: .
    image: ghcr.io/sadorlovsky/ttdl-viewer:0.1.0
```

Then `docker compose up -d` without `--build`, and `docker compose pull` to move to a newer tag.

## Picking up new posts

The index is built in memory at startup and there is no cache on disk, so **restart the container
after ttdl fetches new posts** (`docker restart ttdl-viewer`), or use the rescan endpoint:

```bash
curl -X POST http://127.0.0.1:4174/api/archives/<archive>/rescan
```

See [`POST /api/archives/:archiveId/rescan`](/reference/http-api/#post-apiarchivesarchiveidrescan)
for what it reports back.

:::caution
The Docker and Synology instructions have not been run — they are written from the Dockerfile and
DSM's documented behaviour. See [Known limits](/explanation/known-limits/).
:::
