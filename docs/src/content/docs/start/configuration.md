---
title: Configuration
description: Every flag and environment variable, the remembered root, and where archives are looked for.
---

Every setting has a flag and an environment variable; the flag wins.

| Flag | Environment | Default | What it does |
|---|---|---|---|
| `--root <dir>` | `TTDL_VIEWER_ROOT` | remembered | Directory holding one subdirectory per archive |
| `--port <n>` | `TTDL_VIEWER_API_PORT` | `4174` | Port the server listens on |
| `--host <addr>` | `TTDL_VIEWER_HOST` | `127.0.0.1` | Interface to bind |
| `--lan` | — | off | Bind every interface — the same as `--host 0.0.0.0`, said as what it does |
| `--likes <dir>` | `TTDL_VIEWER_LIKES` | found | A TikTok export kept away from the archives |

`--host` defaults to loopback deliberately: this process serves arbitrary local media with no
authentication in front of it, and should not land on the LAN by accident. Reaching the network is
an explicit choice — `--lan` is how you make it, and the [Docker image](/guides/docker/) makes it
too, because inside a container loopback is reachable only from the container itself and the
exposure is decided by which port you publish.

`--likes` is an escape hatch, not part of running this. The saving dates are normally already in
the archive: see [Liked and favorited dates](/guides/liked-dates/).

## The root is remembered

`--root` is the one thing this cannot work out on its own — nothing on the machine says which
directory ttdl downloads into. So it is asked for once and kept:

```bash
bun run start --root ~/code/ttdl/downloads   # remembered for next time
bun run start                                # and never needed again
```

It lands in `~/.config/ttdl-viewer/config.json` (or `$XDG_CONFIG_HOME`), which holds that one
setting and nothing else. This is the only thing the program writes, and it writes it outside every
archive — the promise is that nothing here can damage a download, not that the process never opens
a file for writing. Delete the file to forget it.

Only a root you actually named is kept; one that was found by probing is not, because a guess
frozen into a setting goes on serving the wrong directory after the reason for the guess is gone.

## Where it reads from

Resolution order:

1. `--root <dir>`
2. `TTDL_VIEWER_ROOT`
3. the remembered root, if one was saved
4. `./downloads`
5. `../ttdl/downloads`
6. `~/code/ttdl/downloads`
7. `./fixtures/downloads`

A path given explicitly that does not exist is an error, not a reason to fall through to the probe:
you named a directory and it is not there. If nothing in 4–7 exists either, the server exits and
lists every candidate it tried, because a missing root is the usual first-run problem.

`./fixtures/downloads` is last on purpose: it holds the synthetic archive `bun run fixtures`
generates, and a checkout that has one would otherwise shadow the real archives with fabricated
posts — which reads as data loss rather than as the wrong directory.

Each immediate subdirectory of the root is one archive. A directory holding a `.ttdl/.source` file
is a **list** archive (`downloads/liked/`) — many authors in one flat folder, with the folder name
meaning nothing. Anything else is a **profile** archive, where the folder name is the handle.

A directory carrying none of ttdl's bookkeeping — no `.ttdl/` — is not an archive at all, and is
kept out of the library rather than appearing there as a profile with zero posts. That is decided
by `stat` rather than by listing: the difference between under a millisecond and 411 ms on the
archives this was written against.

ttdl kept its bookkeeping flat, beside the videos, before the `.ttdl/` layout, and moves an archive
over on the first mutating command run against it. Only `.ttdl/` is read here — see
[reading ttdl's format](/reference/archive-format/) for what an archive still waiting on that move
looks like.
