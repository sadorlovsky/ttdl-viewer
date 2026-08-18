import { Link } from "wouter";
import styles from "./Empty.module.css";

export function NotFoundScreen() {
	return (
		<div className={styles.empty}>
			<h1 className={styles.title}>No such route</h1>
			<p className={styles.body}>
				Every link here names an archive, or a post inside one. This one names neither.
			</p>
			<Link href="/" className={styles.action}>
				Back to the library
			</Link>
		</div>
	);
}
