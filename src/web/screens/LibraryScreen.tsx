import { Link } from "wouter";
import type { Archive } from "../../shared/types.ts";
import { useArchives, useStats } from "../api/client.ts";
import { bytes, dateRange } from "../lib/format.ts";
import empty from "./Empty.module.css";
import styles from "./LibraryScreen.module.css";

/**
 * The archive's newest cover, or its initials when it has none.
 *
 * A mosaic of several covers would read better, but the archive summary carries only one — the
 * rest would mean a posts query per card, and a library of a dozen archives should not fire a
 * dozen queries just to decorate itself. One cover costs a request we were already making.
 */
function CardArt({ archive }: { archive: Archive }) {
	if (!archive.cover) {
		return (
			<div className={styles.art} data-empty>
				<span className={styles.artGlyph}>{archive.name.slice(0, 2).toUpperCase()}</span>
			</div>
		);
	}
	return (
		<div className={styles.art}>
			<img src={archive.cover} alt="" className={styles.artImage} loading="lazy" decoding="async" />
		</div>
	);
}

function ArchiveCard({ archive }: { archive: Archive }) {
	const { counts } = archive;
	const facts = [
		`${counts.posts.toLocaleString()} posts`,
		counts.carousels > 0 ? `${counts.carousels} carousels` : null,
		archive.bytes > 0 ? bytes(archive.bytes) : null,
		dateRange(archive.dateRange) || null,
	].filter(Boolean);

	return (
		<Link href={`/a/${archive.id}`} className={styles.card}>
			<CardArt archive={archive} />
			<div className={styles.cardBody}>
				<div className={styles.cardHead}>
					<h2 className={styles.cardName}>{archive.name}</h2>
					<span className={styles.badge} data-kind={archive.kind}>
						{archive.kind}
					</span>
					{archive.downloadInProgress && (
						<span className={styles.live} title="ttdl is running in this archive right now">
							<span className={styles.liveDot} />
							downloading
						</span>
					)}
				</div>
				<p className={styles.cardFacts}>{facts.join(" · ")}</p>
				{archive.kind === "list" && archive.authors.length > 1 && (
					<p className={styles.cardSub}>
						{archive.authors.length} authors
						{archive.source ? ` · from ${archive.source}` : ""}
					</p>
				)}
				{counts.incomplete > 0 && <p className={styles.cardWarn}>{counts.incomplete} incomplete</p>}
			</div>
		</Link>
	);
}

export function LibraryScreen() {
	const archives = useArchives();
	const stats = useStats();

	if (archives.isPending) {
		return <div className={styles.loading}>Reading archives…</div>;
	}

	if (archives.isError) {
		return (
			<div className={empty.empty}>
				<h1 className={empty.title}>The indexer is not answering</h1>
				<p className={empty.body}>{archives.error.message}</p>
				<pre className={empty.command}>bun run dev</pre>
			</div>
		);
	}

	const found = archives.data ?? [];
	const withPosts = found.filter((a) => a.counts.posts > 0 || a.counts.incomplete > 0);
	const barren = found.filter((a) => a.counts.posts === 0 && a.counts.incomplete === 0);

	if (found.length === 0) {
		return (
			<div className={empty.empty}>
				<h1 className={empty.title}>No archives yet</h1>
				<p className={empty.body}>Nothing was found under the archive root:</p>
				<p className={empty.path}>{stats.data?.root ?? "…"}</p>
				<p className={empty.body}>Download one with ttdl, then reload:</p>
				<pre className={empty.command}>cd ~/code/ttdl && ./ttdl.py @username</pre>
				<p className={empty.body}>Or generate a test archive to look around:</p>
				<pre className={empty.command}>bun run fixtures</pre>
			</div>
		);
	}

	return (
		<main className={styles.screen}>
			<header className={styles.header}>
				<h1 className={styles.title}>Archives</h1>
				<p className={styles.root} title={stats.data?.root}>
					{stats.data?.root}
				</p>
			</header>

			<div className={styles.grid}>
				{withPosts.map((archive) => (
					<ArchiveCard key={archive.id} archive={archive} />
				))}
			</div>

			{barren.length > 0 && (
				<section className={styles.barren}>
					<h2 className={styles.barrenTitle}>Nothing indexable</h2>
					{/* Hiding these would make "why isn't my archive showing" impossible to debug. */}
					<ul className={styles.barrenList}>
						{barren.map((archive) => (
							<li key={archive.id}>
								<span className={styles.barrenName}>{archive.name}</span>
								<span className={styles.barrenWhy}>
									{archive.counts.ghosts > 0
										? `${archive.counts.ghosts} metadata files with no media`
										: "no files matching ttdl's naming"}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
}
