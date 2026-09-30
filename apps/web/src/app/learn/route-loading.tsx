import styles from "../../components/route-state.module.css";

export default function LearningLoading({ message }: Readonly<{ message: string }>) {
  return (
    <div className={`${styles.state} ${styles.loading}`} role="status">
      <p className={styles.description}>{message}</p>
      <div aria-hidden="true" className={styles.loadingRail} />
    </div>
  );
}
