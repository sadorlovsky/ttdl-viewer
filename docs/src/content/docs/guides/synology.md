---
title: Running it on a Synology NAS
description: Container Manager on DSM 7, a compose file that pulls the published image, and the mount permission that usually bites.
---

DSM 7 with **Container Manager** installed. The archives already live on the NAS — typically a
shared folder such as `/volume1/media/tiktok`.

## Using the published image

The image is built for `linux/amd64` and `linux/arm64`, which covers the x86-64 models and the ARM
ones, so the NAS pulls it and nothing is cloned or built there.

Container Manager → **Project** → **Create**. Name it and choose to create a `docker-compose.yml`;
the wizard takes the file's contents in a text box, so nothing has to be put on the NAS beforehand.
**Path** is where Container Manager keeps the project — it writes that file and its own bookkeeping
there, so give it a folder of its own such as `/volume1/docker/ttdl-viewer`, never the archive share
you are about to mount.

```yaml
services:
  ttdl-viewer:
    image: ghcr.io/sadorlovsky/ttdl-viewer:0.1.0
    container_name: ttdl-viewer
    restart: unless-stopped
    volumes:
      # Left side: your archive share. The right side must stay /archives.
      - /volume1/media/tiktok:/archives:ro
    ports:
      # Reachable from the NAS itself only. Use "4174:4174" to put it on the LAN,
      # where nothing authenticates it.
      - "127.0.0.1:4174:4174"
```

DSM pulls the image and starts it. No registry has to be added: `image` names the image in full,
which is all a pull needs.

Over SSH the same project is:

```bash
cd /volume1/docker/ttdl-viewer
sudo docker compose up -d
```

A newer version means editing the tag and pulling:

```bash
sudo docker compose pull && sudo docker compose up -d
```

Over SSH, `sudo docker pull ghcr.io/sadorlovsky/ttdl-viewer:0.1.0` puts it in Container Manager's
**Image** list, where the UI can start it like any other.

:::note
Container Manager's **Registry** tab cannot fetch this image, and reports `Registry returned bad
result`. It lists a registry by searching it; GHCR answers `/v2/` with an authentication challenge
and exposes no search endpoint, so there is nothing for DSM to list. A project and a `docker pull`
both address the image by its full name and need no registry added.
:::

[The tag table](/guides/docker/#the-published-image) says what `latest` and `edge` mean. Pin an
exact version on a NAS you do not want changing under you.

## Building it on the NAS instead

Building is for running a modification. Copy this repository to `/volume1/docker/ttdl-viewer` (File
Station, or `git clone` over SSH), leave the `build: .` line in the `docker-compose.yml` that comes
with it, edit the volume and port lines as above, and:

```bash
cd /volume1/docker/ttdl-viewer
sudo docker compose up -d --build
```

Low-memory models can struggle with the Vite build step. If it is killed, build on your laptop for
the NAS's platform and load the result:

```bash
docker buildx build --platform linux/arm64 -t ttdl-viewer . --load
docker save ttdl-viewer | ssh nas 'sudo docker load'
```

## If it starts but shows zero archives

The mount is almost certainly unreadable to the container's non-root `bun` user. Synology shares
are often owned by a specific DSM account rather than being world-readable. Check the numeric owner
and tell compose to match it:

```bash
ls -ln /volume1/media/tiktok      # e.g.  drwx------ 1026 100
```

```yaml
user: "1026:100"
```

## Behind DSM's reverse proxy

Control Panel → Login Portal → Advanced → Reverse Proxy works and gives you HTTPS, but adds no
authentication of its own. Pair it with DSM's firewall, a VPN, or an authenticating proxy if the NAS
is reachable from outside your home.

:::caution
These instructions have not been run — they are written from DSM's documented behaviour. See
[Known limits](/explanation/known-limits/).
:::
