import { jsPDF } from "jspdf";
import { criterionLabel, type Persona } from "./personas";
import { JUDGE_CRITERIA } from "./debate/judge";
import type { JudgeScorecard, Side } from "./debate/types";

export type VerdictDoc = {
  title: string;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
  decision: string;
  signoff: string;
};

/**
 * Build the printable brief from a real judge scorecard.
 *
 * The reference generated this document from a separate LLM call. Here the
 * scorecard the judge already produced is the source, so the PDF can never
 * disagree with the scores shown on screen.
 */
export function verdictDocFromScorecard(
  scorecard: JudgeScorecard,
  persona: Persona,
  topic: string,
  names: Record<Side, string>,
): VerdictDoc {
  const winnerName =
    scorecard.winner === "tie" ? "a draw" : scorecard.winner === "alpha" ? names.alpha : names.beta;

  // One section per criterion, pairing both sides' scores with the judge's own
  // stated reason, so the brief explains the number rather than just repeating it.
  const sections = JUDGE_CRITERIA.map((criterion) => {
    const a = scorecard.alpha;
    const b = scorecard.beta;
    const body = [
      `${names.alpha} ${a.scores[criterion]?.toFixed(1) ?? "—"} / ${scorecard.scale} — ${
        a.reasons?.[criterion] ?? "No reason recorded."
      }`,
      `${names.beta} ${b.scores[criterion]?.toFixed(1) ?? "—"} / ${scorecard.scale} — ${
        b.reasons?.[criterion] ?? "No reason recorded."
      }`,
      `Weight applied by the ${persona.title}: ×${persona.weights[criterion]}`,
    ].join("\n");
    return { heading: criterionLabel(criterion), body };
  });

  const provenance = scorecard.simulated
    ? "Scored heuristically in simulation mode — no model was reachable."
    : `Scored by the judge model${scorecard.interim ? " while the debate was still in progress" : ""}.`;

  return {
    title: topic,
    summary: [scorecard.alpha.summary, scorecard.beta.summary].filter(Boolean).join(" "),
    sections,
    decision: `${scorecard.verdict} Result: ${winnerName} (${scorecard.alpha.total.toFixed(1)} vs ${scorecard.beta.total.toFixed(1)} of a possible ${scorecard.maxTotal}).`,
    signoff: `${persona.name}, ${persona.docFraming}. ${provenance}`,
  };
}

export function downloadVerdictPdf(
  doc: VerdictDoc,
  persona: Persona,
  topic: string,
  winner: string,
  proTotal: number,
  conTotal: number,
) {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const M = 56;
  const W = 612 - M * 2;
  let y = M;

  const page = () => {
    if (y > 720) {
      pdf.addPage();
      y = M;
    }
  };

  const text = (
    value: string,
    size: number,
    style: "normal" | "bold" | "italic",
    color: [number, number, number],
    gap = 14,
  ) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    for (const line of pdf.splitTextToSize(value, W) as string[]) {
      page();
      pdf.text(line, M, y);
      y += size * 1.35;
    }
    y += gap;
  };

  pdf.setFillColor(24, 22, 20);
  pdf.rect(0, 0, 612, 118, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(212, 168, 83);
  pdf.text(`${persona.title} — ${persona.doc.toUpperCase()}`, M, 48);
  pdf.setFontSize(19);
  pdf.setTextColor(245, 242, 236);
  for (const line of pdf.splitTextToSize(doc.title, W) as string[]) {
    pdf.text(line, M, 74);
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(170, 165, 155);
  pdf.text(persona.docFraming, M, 98);

  y = 152;
  text(`MOTION: ${topic}`, 10, "italic", [90, 88, 84], 6);
  text(
    `Winner: ${winner}   |   PRO ${proTotal} vs CON ${conTotal}   |   Judged by the ${persona.title}`,
    10,
    "bold",
    [30, 30, 30],
    18,
  );

  text("Bottom line", 12, "bold", [176, 132, 46], 4);
  text(doc.summary, 11, "normal", [35, 35, 35], 16);

  for (const s of doc.sections ?? []) {
    text(s.heading, 12, "bold", [176, 132, 46], 4);
    text(s.body, 11, "normal", [35, 35, 35], 14);
  }

  text("Decision", 12, "bold", [176, 132, 46], 4);
  text(doc.decision, 11, "bold", [25, 25, 25], 18);
  text(`— ${doc.signoff}`, 10, "italic", [110, 105, 100], 0);

  pdf.save(`${persona.title}-${persona.doc.replace(/\s+/g, "-")}.pdf`);
}
