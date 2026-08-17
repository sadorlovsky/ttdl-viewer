import { Link } from "wouter";
import styles from "./Empty.module.css";

export function NotFoundScreen() {
	return (
		<div className={styles.empty}>
			<h1 className={styles.title}>Nothing here</h1>
			<p className={styles.body}>That route does not match any archive or post.</p>
			<Link href="/" className={styles.action}>
				Back to the library
			</Link>
		</div>
	);
}
