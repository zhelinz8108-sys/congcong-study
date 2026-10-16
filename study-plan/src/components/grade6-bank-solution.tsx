import type { BankDetailedSolution } from "@/lib/grade6-bank-solution";
import { MathText } from "./math-text";
import styles from "./grade6-bank.module.css";

/** Only receives private teaching content from a successful submit/feedback
 * response. Plain React text is intentionally not interpreted as HTML. */
export function Grade6BankSolution({ solution }: { solution: BankDetailedSolution }) {
  return <div className={styles.solution} aria-label="逐步详解">
    {solution.reviewNote && <p className={styles.solutionReview} role="note"><MathText text={solution.reviewNote} /></p>}
    <div className={styles.solutionThought}><h4>解题思路</h4><p><MathText text={solution.thought} /></p></div>
    <ol className={styles.solutionSteps}>{solution.steps.map((step, index) => <li key={index}>
      <span className={styles.solutionNumber} aria-hidden="true">{index + 1}</span>
      <div><h4>{step.title}</h4><p><MathText text={step.content} /></p></div>
    </li>)}</ol>
    <div className={styles.solutionAnswer}><h4>参考答案</h4><p><MathText text={solution.answerSummary} /></p></div>
    <details className={styles.solutionPitfalls}><summary>易错点</summary><ul>{solution.pitfalls.map((pitfall, index) => <li key={index}><MathText text={pitfall} /></li>)}</ul></details>
  </div>;
}
