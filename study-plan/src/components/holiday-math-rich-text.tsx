import { memo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import styles from "./holiday-math-700.module.css";

const delimiters =
  /(\$\$[\s\S]+?\$\$|\$[^$]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
export default memo(function HolidayMathRichText({ text }: { text: string }) {
  return (
    <span className={styles.rich}>
      {text.split(delimiters).map((piece, index) => {
        const display = piece.startsWith("$$") || piece.startsWith("\\[");
        const math =
          piece.startsWith("$") ||
          piece.startsWith("\\(") ||
          piece.startsWith("\\[");
        if (!math) return <span key={index}>{piece}</span>;
        const trim = piece.startsWith("$$") || piece.startsWith("\\") ? 2 : 1;
        try {
          const html = katex.renderToString(piece.slice(trim, -trim), {
            displayMode: display,
            throwOnError: true,
            trust: false,
            minRuleThickness: 0.06,
            maxExpand: 1000,
            maxSize: 8,
            strict: "ignore",
          });
          return (
            <span
              key={index}
              className={display ? styles.displayMath : styles.inlineMath}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return (
            <span key={index} role="alert" className="text-rose-700">
              公式无法显示，请刷新重试
            </span>
          );
        }
      })}
    </span>
  );
});
