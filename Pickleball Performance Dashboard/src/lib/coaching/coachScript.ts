import type { CoachingReport } from "../analysis/coaching";
import { skillInfo, type SelfProgressRow, type SelfReport } from "./selfAssessment";

/** Where a spoken line comes from, shown as a tag so ratings and video findings are never mixed up. */
export type CoachSource = "rating" | "video" | null;
export type CoachLine = { text: string; source: CoachSource };
export type CoachSection = { eyebrow?: string; title: string; lines: CoachLine[] };
export type CoachScript = { sections: CoachSection[] };
export type CoachLength = "short" | "full";

const NUMBER = ["zero", "one", "two", "three", "four", "five"];
const outOfFive = (n: number) => `${NUMBER[n]} out of five`;

/** Rewrites units and symbols the way a coach would say them; the screen shows the same words. */
export function spoken(text: string): string {
  return text
    .replace(/"/g, "")
    .replace(/-plus-/g, " plus ")
    .replace(/(\d+) cm\b/g, "$1 centimetres")
    .replace(/(\d+) m\b/g, "$1 metre")
    .replace(/(\d)\/5\b/g, (_, n: string) => ` ${outOfFive(Number(n))}`)
    .replace(/\s+/g, " ")
    .trim();
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const firstSentence = (s: string) => s.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? s;
const line = (text: string, source: CoachSource = null): CoachLine => ({ text: spoken(text), source });

export function selfCoachScript({ report, progress, sessionTitle, playFormat, length }: {
  report: SelfReport; progress?: SelfProgressRow[] | null; sessionTitle?: string | null; playFormat?: string | null; length: CoachLength;
}): CoachScript {
  const full = length === "full";
  const sections: CoachSection[] = [{
    title: "Intro",
    lines: [line(`Here's your ${full ? "full " : ""}coaching for ${sessionTitle?.trim() || "this session"}. Everything in it is based on your own ratings.`)],
  }];

  const strengths = full ? report.strengths : report.strengths.slice(0, 1);
  if (strengths.length) {
    sections.push({
      title: "What's working",
      lines: strengths.map((s, i) => i === 0
        ? line(`You rated your ${s.title.toLowerCase()} as a strength, ${outOfFive(s.rating)}. Keep doing what works there.`, "rating")
        : line(`You also rated your ${s.title.toLowerCase()} ${outOfFive(s.rating)}.`, "rating")),
    });
  }

  const focus = full ? report.focus : report.focus.slice(0, 1);
  focus.forEach((f, i) => {
    const anchors = skillInfo(f.skill, playFormat).anchors as readonly string[];
    const skill = f.label.toLowerCase();
    const lines: CoachLine[] = [
      line(i === 0 ? `Based on your ratings, your main focus this week is your ${skill}.` : `Your next focus is your ${skill}.`, "rating"),
      line(`You rated it ${outOfFive(f.rating)}: ${lowerFirst(anchors[f.rating - 1])}.`, "rating"),
    ];
    if (f.reasons.includes("you mentioned it as a struggle")) lines.push(line("You also mentioned it as a struggle.", "rating"));
    if (full) lines.push(line(f.why));
    lines.push(line(`Try the ${f.drill.name.toLowerCase()} drill. ${full ? f.drill.how : firstSentence(f.drill.how)}`));
    if (anchors[f.rating]) lines.push(line(`Next session, aim to rate it a ${NUMBER[f.rating + 1]}: ${lowerFirst(anchors[f.rating])}.`));
    sections.push({ eyebrow: full ? `Focus ${i + 1} of ${focus.length}` : "Main focus", title: f.label, lines });
  });

  if (full && progress?.length) {
    const changed = progress.filter((r) => r.change !== "same").slice(0, 3);
    const same = progress.filter((r) => r.change === "same").slice(0, 2);
    const lines = changed.map((r) => line(`Your ${r.label.toLowerCase()} rating went ${r.change === "better" ? "up" : "down"} from ${NUMBER[r.before]} to ${NUMBER[r.after]}.`, "rating"));
    if (same.length) lines.push(line(`Your ${same.map((r) => r.label.toLowerCase()).join(" and ")} rating${same.length > 1 ? "s" : ""} stayed the same.`, "rating"));
    if (lines.length) sections.push({ title: "Since last time", lines: [line("Compared with your last rated session.", "rating"), ...lines] });
  }

  const more = report.focus.length > 1 || report.strengths.length > 1 || !!progress?.length;
  sections.push({
    title: "Wrap-up",
    lines: [line(!report.focus.length
      ? "You rated every skill five out of five. Keep the same habits, and rate yourself again after your next session."
      : full || !more
        ? "Do this week's drill three times, then rate yourself again. See you on court."
        : "That's the short version. Tap hear full plan for the rest of your coaching.")],
  });
  return { sections };
}

export function videoCoachScript({ report, sessionTitle, length }: {
  report: CoachingReport; sessionTitle?: string | null; length: CoachLength;
}): CoachScript {
  const full = length === "full";
  const sections: CoachSection[] = [{
    title: "Intro",
    lines: [line(`Here's your ${full ? "full " : ""}video coaching for ${sessionTitle?.trim() || "this session"}. Tips marked from video come from what the camera could see.`)],
  }];
  const strengths = full ? report.strengths : report.strengths.slice(0, 1);
  if (strengths.length) sections.push({ title: "What's working", lines: strengths.map((s) => line(`${s.title}. ${s.observation}`, "video")) });
  const focus = full ? report.focus : report.focus.slice(0, 1);
  focus.forEach((f, i) => {
    const lines = [line(f.observation, "video")];
    if (f.why) lines.push(line(f.why));
    if (f.drill) lines.push(line(`Try the ${f.drill.name.toLowerCase()} drill. ${full ? f.drill.how : firstSentence(f.drill.how)}`));
    if (f.target && full) lines.push(line(f.target));
    sections.push({ eyebrow: full ? `Focus ${i + 1} of ${focus.length}` : "Main focus", title: f.title, lines });
  });
  const more = report.focus.length > 1 || report.strengths.length > 1;
  sections.push({
    title: "Wrap-up",
    lines: [
      line("Video tips are estimates from one camera angle, so treat them as a guide."),
      line(full || !more ? "Record another short clip after you practise, so you can compare." : "That's the short version. Tap hear full plan for the rest of your coaching."),
    ],
  });
  return { sections };
}

/** Rough spoken length at normal speed, for the button label. */
export function scriptSeconds(script: CoachScript): number {
  const words = script.sections.flatMap((s) => s.lines).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  return Math.round(words / 2.5 + script.sections.length * 0.8);
}

export function formatSeconds(s: number): string {
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
