# CLAUDE.md

`DESIGN.md` is the design system — tokens, component recipes, and the darkroom the app is.
`PRODUCT.md` is the product spec — the vocabulary, the three jobs, and what future work must not
fabricate. `FEATURES.md` is the behaviour inventory — every feature against the shared surfaces it
leans on, and what verifies each; a change to a feature updates its entry in the same commit. None
of the three is repeated here; read them before changing anything they cover.

## The two guarantees

Both are enforced by a mechanism that fails loudly, not by discipline, and any new feature inherits
that burden.

- **Nothing goes out.** `scripts/check-offline.ts` fails the build on any remote reference in
  `dist/`, a strict CSP covers the page, and the indexer discards `formats[]` and `thumbnails[]`
  because they carry live signed CDN URLs. The allow-list is specific paths, never whole hosts.
- **Nothing is written to an archive.** The only file this program writes is the remembered root, in
  `~/.config/ttdl-viewer/config.json`, outside every archive. A viewer that never writes cannot
  migrate a pre-`.ttdl/` archive, which is why only `.ttdl/` is read and the flat layout is not a
  fallback.

## Docs

The site is a separate Astro + Starlight project under `docs/`, with its own dependencies and its
own lockfile. The root `tsconfig.json` excludes it.

- **English is the root locale**, so `/start/install/`-shaped URLs stay bare; Russian lives under
  `/ru/`. The README and ttdl's own site link to the English paths — do not move them into an `en/`
  directory.
- **A page added on one side needs its pair on the other**, plus a `translations: { ru: … }` label
  in the sidebar of `docs/astro.config.mjs`, or the locales drift.
- **Inside a Russian page every internal link and heading anchor is the Russian one.** Starlight
  slugifies Cyrillic, so `#курсор-это-ключ-а-не-смещение` is a real id and an English anchor would
  be a dead link. Links out to ttdl's site point at its `/ru/` pages. Terms come from ttdl's own
  Russian pages — просмотрщик, загрузчик, карточка автора — rather than being invented again.
- **Don't document what the reader cannot act on.** A migration nobody starting today can be in, a
  limit the code no longer has, a half of a check that was never built.
- **The README delegates.** Depth lives on the site; two copies of the same prose drift. Every
  README section ends in a `→` link into it, and `## Documentation` mirrors the sidebar.
- Badges need something real to point at. CI and `LICENSE` are both real now.

## Prose

The site was toned down deliberately. Keep it there.

- **Fact before rationale.** The subject of the sentence is the thing being documented, not the
  reason for it.
- **A heading names its subject**, and is not an epigram or a claim.
- **The literal thing, not a metaphor for it.**
- **No kicker** — the closing sentence that restates the point with a snap after the mechanism has
  already been given. Cut it; don't replace it.
- **No self-congratulation.** "That guard was earned", "which is the whole point", "not cosmetic".
- **No dramatization.** Superlatives and worst-moment framing go; measured hedges stay.
- **Fragments become sentences and vague pronouns get named.**
- **Numbers, measurements, tables and inline code are untouched**, and so is any anchor another page
  links to.

## Commit messages

- Subject: `scope: short phrase`. Lowercase after the colon, no full stop, 70 characters at most.
  The scope is one word for the area touched: `docs`, `state`, `feed`, `media`, `ci`, and so on.
- Body: bullets starting with `- `, wrapped at 78 columns, continuations indented two spaces.
- **Four bullets at most, fewer where possible.** Say what was wrong and why this fix. Leave out
  detail the diff already shows.
- **Plain language.** Short sentences. No em-dash asides, no build-up, no flourishes.
- Keep numbers, versions and issue references exact. Do not round them.
- **No usernames.** Not real accounts, and not fixtures like `@alice` either. Write "an account".

## Releases

`package.json` holds the version, and it is the only place it is written: the server imports it for
`/api/stats`, and `.github/workflows/release.yml` refuses to publish when the tag and that field
disagree.

```bash
bun run release patch          # or minor, major, or an exact 0.4.0-rc.1
git push origin main --follow-tags
```

`scripts/release.ts` runs the checks first, then bumps, commits `release: v0.2.0` and tags. It
pushes nothing. The tag is what starts the release; a tag made by hand without the bump fails the
first job.

- **`ci.yml` is called, not copied.** Release runs it through `workflow_call`, so an image can never
  come from a tree that did not pass. Its `edge` job is guarded on the ref being `main`, which is
  how it stays skipped when Release is the caller.
- **Images go to `ghcr.io/sadorlovsky/ttdl-viewer`** for `linux/amd64` and `linux/arm64`. A tag gets
  `0.2.0`, `0.2` and `latest`; a push to `main` gets `edge` and `sha-<commit>`. The tag table is on
  the [Docker page](docs/src/content/docs/guides/docker.md), in both locales.

## Checks

```bash
bun test           # filename parsing, ttdl parity, Range matrix
bun run typecheck
bun run lint
bun run build      # vite build, then the offline guard over dist/
cd docs && bun run build
```

`bun run fixtures` generates the archive everything is developed against — it carries every edge
case the format can produce, and it is the demonstration surface for any UI work.
