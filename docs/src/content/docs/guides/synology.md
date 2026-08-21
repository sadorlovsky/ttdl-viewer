---
title: Running it on a Synology NAS
description: Container Manager on DSM 7, the mount permission that usually bites, and building on ARM models.
---

DSM 7 with **Container Manager** installed. The archives already live on the NAS — typically a
shared folder such as `/volume1/media/tiktok`.

## Using Container Manager's UI (project)

1. Copy this repository to the NAS, e.g. into `/volume1/docker/ttdl-viewer` (File Station, or
   `git clone` over SSH).
2. Container Manager → **Project** → **Create**. Set the path to that folder; it will pick up
   `docker-compose.yml`.
3. Edit the volume line so the left side is your archive share:

   ```yaml
   volumes:
     - /volume1/media/tiktok:/archives:ro
   ```

4. Decide the port line. `- "127.0.0.1:4174:4174"` keeps it reachable only from the NAS itself
   (use an SSH tunnel or a VPN); `- "4174:4174"` puts it on your LAN, unauthenticated.
5. Build and start. Open `http://<nas-ip>:4174` if you published it to the LAN.

## Over SSH instead

```bash
cd /volume1/docker/ttdl-viewer
sudo docker compose up -d --build
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

## Build architecture

Most Synology models are x86-64 and build natively. On an ARM model (DS220j and similar), build on
the NAS itself as above rather than pushing an amd64 image to it.

Low-memory models can struggle with the Vite build step; if it is killed, build the image on your
laptop for the right platform and load it:

```bash
docker buildx build --platform linux/arm64 -t ttdl-viewer . --load
docker save ttdl-viewer | ssh nas 'sudo docker load'
```

## Behind DSM's reverse proxy

Control Panel → Login Portal → Advanced → Reverse Proxy works and gives you HTTPS, but adds no
authentication of its own. Pair it with DSM's firewall, a VPN, or an authenticating proxy if the NAS
is reachable from outside your home.

:::caution
These instructions have not been run — they are written from DSM's documented behaviour. See
[Known limits](/explanation/known-limits/).
:::
