import { MBTI_QUESTIONS } from "./mbti-data";
import type { MBTIType } from "./mbti-data";


export type AnswerRecord = Record<string, number>;

export function computeMBTI(answers: AnswerRecord): MBTIType {
  const scores = computeMBTIScores(answers);

  const e = scores.EI > 0 ? "E" : "I";
  const s = scores.SN >= 0 ? "S" : "N";
  const t = scores.TF >= 0 ? "T" : "F";
  const j = scores.JP >= 0 ? "J" : "P";

  return (e + s + t + j) as MBTIType;
}
export function computeMBTIScores(answers: AnswerRecord): Record<string, number> {
  const scores: Record<string, number> = { EI: 0, SN: 0, TF: 0, JP: 0 };

  for (const q of MBTI_QUESTIONS) {
    const rating = answers[q.id];
    if (rating === undefined) continue;

    // Điểm từ -3 đến 3
    const point = rating - 4; // 1-> -3, 2-> -2, 3-> -1, 4-> 0, 5-> 1, 6-> 2, 7-> 3

    if (q.dimension === "E_I") {
      if (q.agree === "E") {
        scores.EI += point; // E dương
      } else {
        scores.EI -= point; // I âm, đảo dấu
      }
    } else if (q.dimension === "S_N") {
      if (q.agree === "S") {
        scores.SN += point;
      } else {
        scores.SN -= point;
      }
    } else if (q.dimension === "T_F") {
      if (q.agree === "T") {
        scores.TF += point;
      } else {
        scores.TF -= point;
      }
    } else if (q.dimension === "J_P") {
      if (q.agree === "J") {
        scores.JP += point;
      } else {
        scores.JP -= point;
      }
    }
  }

  return scores;
}
