import type { CoachScript, CoachSource } from "./coachScript";

export type CoachWord = { text: string; start: number };
/** One spoken sentence. Speaking a sentence at a time avoids Chrome cutting long speech off and makes pause reliable. */
export type CoachSentence = { section: number; source: CoachSource; text: string; words: CoachWord[]; first: boolean };
/** exact: the browser reports each word; estimated: words follow a slow speaking pace; text: no voice available. */
export type TimingMode = "exact" | "estimated" | "text";

/** Characters per second at 1x, set slower than real speech so estimated text trails the voice and never gets ahead. */
export const ESTIMATE_CPS = 12.5;

export function splitWords(text: string): CoachWord[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index ?? 0 }));
}

export function flattenScript(script: CoachScript): CoachSentence[] {
  const out: CoachSentence[] = [];
  script.sections.forEach((section, si) => {
    section.lines.forEach((line) => {
      for (const text of line.text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
        out.push({ section: si, source: line.source, text, words: splitWords(text), first: !out.some((s) => s.section === si) });
      }
    });
  });
  return out;
}

/** Index of the word being spoken at a character position, or -1 before the first word. */
export function wordAt(words: CoachWord[], charPos: number): number {
  let index = -1;
  for (let i = 0; i < words.length && words[i].start <= charPos; i++) index = i;
  return index;
}

export function estimatedCharPos(elapsedMs: number, rate: number): number {
  return (elapsedMs / 1000) * ESTIMATE_CPS * rate - 2;
}

const englishRank = (v: SpeechSynthesisVoice) =>
  (/en[-_]US/i.test(v.lang) ? 0 : 1) + (v.localService ? 0 : 2) + (/samantha|aria|jenny|google us/i.test(v.name) ? -0.5 : 0);

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.filter((v) => /^en([-_]|$)/i.test(v.lang)).sort((a, b) => englishRank(a) - englishRank(b))[0] ?? null;
}

export type CoachSpeechEvents = {
  /** A new word has been spoken (or estimated to have been). */
  onWord: (sentence: number, word: number) => void;
  /** Sentence finished: all its words have been said. */
  onSentenceEnd: (sentence: number) => void;
  onTiming: (mode: TimingMode) => void;
  onFinish: () => void;
};

/** Speaks a script sentence by sentence and reports which word has been said. */
export class CoachSpeech {
  private gen = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  rate = 1;

  constructor(private sentences: CoachSentence[], private events: CoachSpeechEvents) {}

  private get synth(): SpeechSynthesis | null {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window ? window.speechSynthesis : null;
  }

  get hasVoice(): boolean { return !!this.synth; }

  stop() {
    this.gen++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.synth?.cancel();
  }

  /** Must first be called from a tap: iPhone only allows speech that starts from one. */
  play(index: number) {
    this.stop();
    const sentence = this.sentences[index];
    if (!sentence) return this.events.onFinish();
    const gen = this.gen;
    const live = () => gen === this.gen;
    let last = -1, exact = false, estimating = false;

    const reveal = (charPos: number) => {
      const w = wordAt(sentence.words, charPos);
      if (w > last) { last = w; this.events.onWord(index, w); }
    };
    const estimate = () => {
      if (estimating || exact || !live()) return;
      estimating = true;
      const t0 = performance.now();
      this.interval = setInterval(() => {
        if (!live() || exact) return;
        reveal(estimatedCharPos(performance.now() - t0, this.rate));
      }, 50);
    };
    const end = () => {
      if (!live()) return;
      if (this.interval) clearInterval(this.interval);
      this.interval = null;
      this.events.onSentenceEnd(index);
      const next = this.sentences[index + 1];
      this.timers.push(setTimeout(() => { if (live()) this.play(index + 1); }, next?.first ? 700 : 260));
    };
    const textOnly = () => {
      this.events.onTiming("text");
      estimate();
      this.timers.push(setTimeout(end, (sentence.text.length / (ESTIMATE_CPS * this.rate)) * 1000 + 300));
    };

    const synth = this.synth;
    if (!synth) return textOnly();
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    const voice = pickVoice(synth.getVoices());
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = "en-US";
    utterance.rate = 0.95 * this.rate;
    utterance.onstart = () => { if (live() && !exact) { this.events.onTiming("estimated"); estimate(); } };
    utterance.onboundary = (e) => {
      if (!live() || (e.name && e.name !== "word")) return;
      if (!exact) { exact = true; this.events.onTiming("exact"); }
      reveal(e.charIndex);
    };
    utterance.onend = end;
    utterance.onerror = (e) => { if (live() && e.error !== "interrupted" && e.error !== "canceled") textOnly(); };
    synth.speak(utterance);
    // Some browsers never fire onstart.
    this.timers.push(setTimeout(estimate, 400));
  }
}

/** Call inside the tap that opens the coach: iPhone only allows speech after one spoken from a tap. */
export function unlockSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}
