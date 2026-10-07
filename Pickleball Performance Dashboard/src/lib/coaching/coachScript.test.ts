import { describe, expect, it } from "vitest";
import type { CoachingReport } from "../analysis/coaching";
import { formatSeconds, scriptSeconds, selfCoachScript, spoken, videoCoachScript, type CoachScript } from "./coachScript";
import { estimatedCharPos, flattenScript, splitWords, wordAt } from "./coachSpeech";
import { buildSelfReport, compareSelfRatings } from "./selfAssessment";

const allText = (script: CoachScript) => script.sections.flatMap((s) => s.lines.map((l) => l.text)).join(" ");
const report = buildSelfReport({ ratings: { serve: 4, return: 5, dinking: 2, third_shot: 2, volleys: 3, kitchen_line: 3, strategy: 4 }, goals: [], biggestStruggle: "my dinks kept popping up" });

describe("self-rating coaching script", () => {
  it("short version covers one strength and the main focus with its drill and target", () => {
    const script = selfCoachScript({ report, sessionTitle: "Tuesday doubles", length: "short" });
    expect(script.sections.map((s) => s.eyebrow ?? s.title)).toEqual(["Intro", "What's working", "Main focus", "Wrap-up"]);
    const text = allText(script);
    expect(text).toContain("Tuesday doubles");
    expect(text).toContain("Based on your ratings, your main focus this week is your dinking.");
    expect(text).toContain("You also mentioned it as a struggle.");
    expect(text).toMatch(/Try the cross-court dink count drill\./);
    expect(text).toContain("aim to rate it a three");
    expect(text).toContain("Tap hear full plan");
    expect(scriptSeconds(script)).toBeLessThan(60);
  });

  it("full version adds every focus and the change in ratings", () => {
    const previous = compareSelfRatings({ serve: 4, dinking: 2, third_shot: 2 }, { serve: 3, dinking: 2, third_shot: 2 });
    const script = selfCoachScript({ report, progress: previous, length: "full" });
    expect(script.sections.filter((s) => s.eyebrow?.startsWith("Focus")).map((s) => s.eyebrow)).toEqual(["Focus 1 of 3", "Focus 2 of 3", "Focus 3 of 3"]);
    const text = allText(script);
    expect(text).toContain("Your serve rating went up from three to four.");
    expect(text).not.toContain("Tap hear full plan");
  });

  it("attributes claims to the player's ratings and never states them as measured ability", () => {
    const text = allText(selfCoachScript({ report, length: "full" }));
    expect(text).not.toMatch(/you are (developing|advanced|solid)|you improved|your level/i);
    const tagged = selfCoachScript({ report, length: "short" }).sections.flatMap((s) => s.lines).filter((l) => l.source);
    expect(tagged.every((l) => l.source === "rating")).toBe(true);
  });

  it("says units and ratings out loud", () => {
    expect(spoken('Put a towel 1 m inside, net-plus-30 cm, aim for 3/5, "steady"')).toBe("Put a towel 1 metre inside, net plus 30 centimetres, aim for three out of five, steady");
  });
});

describe("video coaching script", () => {
  const video: CoachingReport = {
    available: true,
    introduction: "",
    strengths: [{ title: "Kitchen line", observation: "You reached the line often.", evidence: "" }],
    focus: [{ title: "Leave the transition zone", observation: "You stayed mid-court after returns.", drill: { name: "Return-and-close", how: "Hit deep. Move up." }, evidence: "" }],
    limitation: "",
  };
  it("tags video findings and reminds that they are estimates", () => {
    const script = videoCoachScript({ report: video, length: "short" });
    expect(script.sections.flatMap((s) => s.lines).filter((l) => l.source === "video").map((l) => l.text)).toEqual([
      "Kitchen line. You reached the line often.", "You stayed mid-court after returns."]);
    expect(allText(script)).toContain("estimates from one camera angle");
  });
});

describe("karaoke timing", () => {
  it("splits lines into sentences and marks the first sentence of each part", () => {
    const flat = flattenScript({ sections: [{ title: "A", lines: [{ text: "One two. Three.", source: null }] }, { title: "B", lines: [{ text: "Four.", source: "rating" }] }] });
    expect(flat.map((s) => [s.text, s.first])).toEqual([["One two.", true], ["Three.", false], ["Four.", true]]);
  });

  it("never reveals a word before the voice reaches it", () => {
    const words = splitWords("Keep your dinks low");
    expect(wordAt(words, -1)).toBe(-1);
    expect(wordAt(words, 0)).toBe(0);
    expect(wordAt(words, 5)).toBe(1);
    expect(wordAt(words, 4)).toBe(0);
    // The estimate runs slower than normal speech (about 15 characters per second).
    expect(estimatedCharPos(1000, 1)).toBeLessThan(15);
    expect(estimatedCharPos(0, 1)).toBeLessThan(0);
  });

  it("formats lengths for the button", () => {
    expect(formatSeconds(42)).toBe("42 s");
    expect(formatSeconds(95)).toBe("1:35");
  });
});
