"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./markdown.module.css";

const STATS_SPLIT = /\n---\n💡?\s*\*\*UAG Stats:\*\*[^\n]*(?:\n.*)?$/s;

export function splitResultContent(raw: string): { body: string; statsFooter: string | null } {
  const match = raw.match(/\n---\n([\s\S]*💡?\s*\*\*UAG Stats:\*\*[\s\S]*)$/);
  if (match && match.index != null) {
    return {
      body: raw.slice(0, match.index).trimEnd(),
      statsFooter: match[1]?.trim() ?? null,
    };
  }

  // Fallback: strip trailing --- + stats line(s)
  const fallback = raw.match(STATS_SPLIT);
  if (fallback && fallback.index != null) {
    return {
      body: raw.slice(0, fallback.index).trimEnd(),
      statsFooter: raw.slice(fallback.index).replace(/^\n---\n/, "").trim(),
    };
  }

  return { body: raw, statsFooter: null };
}

type Props = {
  content: string;
};

export function MarkdownResult({ content }: Props) {
  if (!content.trim()) {
    return <p className={styles.empty}>No content.</p>;
  }

  const { body, statsFooter } = splitResultContent(content);
  const looksLikeJson =
    (body.startsWith("{") || body.startsWith("[")) && !body.includes("\n## ");

  if (looksLikeJson) {
    return (
      <div className={styles.wrap}>
        <pre className={styles.plain}>{body}</pre>
        {statsFooter ? <aside className={styles.stats}>{statsFooter.replace(/\*\*/g, "")}</aside> : null}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.prose}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            pre: ({ children }) => <pre className={styles.codeBlock}>{children}</pre>,
            code: ({ className, children, ...props }) => {
              const isBlock = Boolean(className);
              if (isBlock) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code className={styles.inlineCode} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
      {statsFooter ? (
        <aside className={styles.stats}>
          {statsFooter.replace(/\*\*/g, "").replace(/^💡\s*/, "")}
        </aside>
      ) : null}
    </div>
  );
}
