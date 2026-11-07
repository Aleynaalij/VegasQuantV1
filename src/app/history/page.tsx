import { getDeskOrEmpty } from "@/lib/data";
import DeskApp from "@/components/desk";
import styles from "@/app/record-presentation.module.css";
export const dynamic = "force-dynamic";
export default async function History() {
  return (
    <div className={styles.history}>
      <DeskApp initial={await getDeskOrEmpty()} page="history" />
    </div>
  );
}
