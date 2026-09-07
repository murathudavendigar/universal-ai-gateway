"use client";

import { splitResultContent } from "./markdown";
import styles from "./markdown.module.css";

type Props = {
  content: string;
};

export function CopyResultButton({ content }: Props) {
  const { body } = splitResultContent(content);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(body || content);
    } catch {
      /* ignore */
    }
  };

  return (
    <button type="button" className={styles.copyBtn} onClick={() => void onCopy()}>
      Copy markdown
    </button>
  );
}
