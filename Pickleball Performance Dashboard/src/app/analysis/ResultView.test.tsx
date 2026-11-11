import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import testFixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import insufficient from "../../../contracts/fixtures/analysis_result.insufficient.v1.json";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { ResultView } from "./ResultView";
import type { SessionRow } from "../../lib/api/types";

afterEach(cleanup);

describe("ResultView", () => {
  it("labels test-fixture results so they cannot be mistaken for the player's data", () => {
    render(<ResultView result={parseAnalysisResult(testFixture)} videoUrl={null} />);
    expect(screen.getByText(/Test data. Not from your video/)).toBeTruthy();
    expect(screen.getByText(/None\s+of the numbers below describe your video/)).toBeTruthy();
    expect(screen.getByText(/Coaching is unavailable for sample results/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play audio coaching" })).toBeNull();
  });

  it("shows what the analysis found, without the per-metric research table", () => {
    const measured = { ...structuredClone(testFixture), data_origin: "measured" };
    render(<ResultView result={parseAnalysisResult(measured)} videoUrl={null} />);
    // One line of checks under the video instead of four cards (adviser notes, 10 Nov).
    const found = screen.getByRole("list", { name: "What the video analysis found" });
    expect(found.textContent).toContain("Court found");
    expect(found.textContent).toContain("Ball not found");
    expect(screen.queryByText("MEASURED FROM THIS VIDEO")).toBeNull();
    expect(screen.queryByText("Court lines found")).toBeNull();
    // Removed for players (adviser notes, 7 Nov): metrics list, provenance and coverage.
    expect(screen.queryByText(/Research details/)).toBeNull();
    expect(screen.queryByText("Share of video analyzed")).toBeNull();
    expect(screen.queryByText("NOT COMPUTED")).toBeNull();
    expect(screen.queryByRole("button", { name: /Download analysis result/ })).toBeNull();
  });

  it("opens one section at a time and keeps the video controls under Video settings", () => {
    const measured = { ...structuredClone(testFixture), data_origin: "measured" };
    const rerun = vi.fn();
    render(<ResultView result={parseAnalysisResult(measured)} videoUrl={null} notes={() => <p>Comments here</p>}
      settings={<p>Upload record here</p>} playersOnCourt={2} onChangePlayersOnCourt={rerun} />);
    const tabs = screen.getByRole("tablist", { name: "Report sections" });
    fireEvent.click(within(tabs).getByRole("tab", { name: "Comments" }));
    expect(screen.getByText("Comments here")).toBeTruthy();
    expect(screen.getByText("Video settings")).toBeTruthy();
    expect(screen.getByText("Upload record here")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Doubles" }));
    expect(screen.getByText(/Analyse again for doubles\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    expect(rerun).toHaveBeenCalledWith(4);
  });

  it("keeps the raw result downloadable in research mode", () => {
    const measured = { ...structuredClone(testFixture), data_origin: "measured" };
    render(<ResultView result={parseAnalysisResult(measured)} videoUrl={null} experimentalReview />);
    expect(screen.getByRole("button", { name: "Download analysis result (JSON)" })).toBeTruthy();
  });

  it("explains insufficient data instead of showing a heatmap", () => {
    render(<ResultView result={parseAnalysisResult(insufficient)} videoUrl={null} />);
    expect(screen.getAllByText("LIMITED RESULT").length).toBe(1); // the overall status (the metric table is gone)
    expect(screen.getAllByText(/Court not calibrated/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /Court heatmap/ })).toBeNull();
  });

  it("leaves out the goals card when the video cannot measure them", () => {
    const session = {
      improvement_goals: ["positioning", "shot_outcomes", "shot_technique"],
      positioning_rating: 3, shot_outcomes_rating: 2, shot_technique_rating: null,
    } as SessionRow;
    render(<ResultView result={parseAnalysisResult(insufficient)} videoUrl={null} session={session} />);
    expect(screen.queryByText("Your goals and video evidence")).toBeNull();
    expect(screen.queryByText(/cannot assess from this analysis/)).toBeNull();
  });

  it("offers a spoken video review when the video gives no practice plan", () => {
    const result = structuredClone(testFixture);
    result.data_origin = "measured";
    const onRate = vi.fn();
    render(<ResultView result={parseAnalysisResult(result)} videoUrl={null} onRateSession={onRate} />);
    expect(screen.getByText(/No practice plan from this video\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rate this session" }));
    expect(onRate).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Play video review/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Hear full plan/ })).toBeNull();
  });

  it("counts errors from the video for you or everyone, each one a tap from the video", () => {
    const result = structuredClone(testFixture) as Record<string, any>;
    result.data_origin = "measured";
    const zero = { serve_fault: 0, out: 0, kitchen_fault: 0, no_mans_land: 0, stayed_back: 0 };
    result.players = [
      { player_id: 1, label: "Near left", on_court: true, side: "near", first_seen_s: 0, last_seen_s: 20, observed_frames: 100 },
      { player_id: 2, label: "Far right", on_court: true, side: "far", first_seen_s: 0, last_seen_s: 20, observed_frames: 100 },
    ];
    result.player_selection = { method: "track_id", track_id: 1, court_half: null, tracked_time_s: 18, tracked_fraction: 0.9, ambiguous_frames: 0 };
    result.metrics.error_counts = { status: "experimental", validation: "not_evaluated", scope: "whole_clip", reason: null, value: {
      definitions: {}, counts: { ...zero, serve_fault: 1, out: 2, no_mans_land: 1 },
      players: [{ player_id: 1, side: "near", counts: { ...zero, serve_fault: 1, no_mans_land: 1 } },
        { player_id: 2, side: "far", counts: { ...zero, out: 2 } }],
      events: [
        { time_seconds: 4.2, kind: "serve_fault", player_id: 1, side: "near", rally_index: 0, detail: "The serve landed outside the service court." },
        { time_seconds: 9.5, kind: "no_mans_land", player_id: 1, side: "near", rally_index: 1, detail: "2.4 s in the transition zone." },
        { time_seconds: 11.0, kind: "out", player_id: 2, side: "far", rally_index: 1, detail: "The ball landed outside the court." },
        { time_seconds: 15.0, kind: "out", player_id: 2, side: "far", rally_index: 2, detail: "The ball landed outside the court." },
      ] } };
    render(<ResultView result={parseAnalysisResult(result)} videoUrl={null} />);
    const card = screen.getByRole("region", { name: "Errors from the video" });
    const tile = (label: string) => within(card).getAllByText(label).find((el) => el.tagName === "DT")?.nextElementSibling?.textContent;
    expect(tile("Serve faults")).toBe("1");
    expect(tile("Shots out")).toBe("0"); // "You" (player 1) by default
    fireEvent.click(within(card).getByRole("button", { name: "Everyone" }));
    expect(tile("Shots out")).toBe("2");
    expect(within(card).getByText("Watch each error (4)")).toBeTruthy();
  });

  it("shows a partner the shared report without the owner's plan or audio, with notes under the video", () => {
    const result = structuredClone(testFixture);
    result.data_origin = "measured";
    render(<ResultView result={parseAnalysisResult(result)} videoUrl={null} sharedBy="Pia"
      notes={() => <p>Partner notes here</p>} />);
    expect(screen.queryByText(/Practice plan from this video/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Play video review/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Watch Pia's video" })).toBeTruthy();
    expect(screen.getByText("Partner notes here")).toBeTruthy();
  });

  it("offers optional audio coaching that reveals words only after they are spoken", () => {
    const result = structuredClone(testFixture);
    result.data_origin = "measured";
    result.provenance.detector = { name: "ultralytics-yolov8-person", confidence_is_model_score: true };
    result.metrics.positioning.validation = "evaluated_on_real_footage";
    result.metrics.court_heatmap.validation = "evaluated_on_real_footage";
    const speak = vi.fn();
    const cancel = vi.fn();
    class Utterance {
      text: string;
      lang = "";
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const originalSpeech = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
    const originalUtterance = Object.getOwnPropertyDescriptor(window, "SpeechSynthesisUtterance");
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak, cancel, getVoices: () => [] } });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    try {
      render(<ResultView result={parseAnalysisResult(result)} videoUrl={null} />);
      // The written plan is always there; audio is an extra.
      expect(screen.getByText("Focus for your next session")).toBeTruthy();
      expect(screen.getAllByText(/^Drill:/).length).toBeGreaterThan(0);
      expect(speak).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /^Play coaching/ }));
      const dialog = screen.getByRole("dialog", { name: "Audio coaching" });
      const first = speak.mock.calls.map((c) => c[0] as Utterance).find((u) => u.text);
      expect(first?.text).toMatch(/^Here's your video coaching/);
      expect(dialog.textContent).not.toContain("video coaching");
      act(() => first?.onend?.());
      expect(dialog.textContent).toContain("Here's your video coaching for this session.");
      fireEvent.click(screen.getByRole("button", { name: "Full text" }));
      expect(dialog.textContent).toContain("estimates from one camera angle");
      fireEvent.click(screen.getByRole("button", { name: "Close coaching" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(cancel).toHaveBeenCalled();
      expect(screen.getByText(/Record and analyze another session/)).toBeTruthy();
    } finally {
      cleanup();
      localStorage.removeItem("picklepro.coach.fullText");
      if (originalSpeech) Object.defineProperty(window, "speechSynthesis", originalSpeech);
      else Reflect.deleteProperty(window, "speechSynthesis");
      if (originalUtterance) Object.defineProperty(window, "SpeechSynthesisUtterance", originalUtterance);
      else Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
    }
  });

  it("shows progress against an earlier coachable session", () => {
    const coachable = (kitchenLine: number) => {
      const r = structuredClone(testFixture);
      r.data_origin = "measured";
      r.provenance.detector = { name: "ultralytics-yolov8-person", confidence_is_model_score: true };
      r.metrics.positioning.validation = "evaluated_on_real_footage";
      r.metrics.court_heatmap.validation = "evaluated_on_real_footage";
      const parsed = parseAnalysisResult(r);
      const v = parsed.metrics.positioning.value!;
      v.fraction_of_mapped_time = { ...v.fraction_of_mapped_time, kitchen_line: kitchenLine };
      return parsed;
    };
    render(<ResultView result={coachable(0.45)} videoUrl={null}
      previous={{ label: "Tuesday drills (2026-09-01)", result: coachable(0.2) }} />);
    expect(screen.getByText("Progress since Tuesday drills (2026-09-01)")).toBeTruthy();
    const row = screen.getByText("Time at the kitchen line").closest("tr")!;
    expect(row.textContent).toContain("20%");
    expect(row.textContent).toContain("45%");
    expect(row.textContent).toContain("Improved");
  });

  it("lists estimated shots in plain words and jumps the video to one", () => {
    const result = structuredClone(testFixture) as any;
    result.data_origin = "measured";
    const shot = (time: number, type: string, mine: boolean) => ({
      time_seconds: time, rally_index: 0, shot_number: 1, hitter_track_id: mine ? 1 : 2, hitter_side: mine ? "near" : "far",
      by_selected_player: mine, hitter_court_m: [3, 1], shot_type: type, contact: "after_bounce", ground_speed_mps: 4,
      landing_court_m: null, landed_in: mine ? true : null, evidence: "soft shot from the back",
    });
    result.metrics.shot_classification = {
      status: "experimental", validation: "not_evaluated", scope: "whole_clip", reason: "Rule-based estimate.",
      value: {
        type_definitions: {}, bounces: [],
        shots: [shot(1, "serve", true), shot(2.5, "return", false), shot(4, "drop", true), shot(6, "dink", false)],
        counts_by_type: {}, selected_player_counts_by_type: {},
      },
    };
    result.message = "The selected player was tracked. 4 hits were estimated from the ball's flight.";
    result.players = [
      { player_id: 1, label: "Near side, left", on_court: true, side: "near", first_seen_s: 0, last_seen_s: 20,
        observed_frames: 150, median_court_m: [2, 3], thumbnail: "data:image/jpeg;base64,AAAA" },
      { player_id: 2, label: "Far side, right", on_court: true, side: "far", first_seen_s: 0, last_seen_s: 20,
        observed_frames: 150, median_court_m: [4, 11], thumbnail: null },
      { player_id: 9, label: "Off court (not counted as a player)", on_court: false, side: null, first_seen_s: 0,
        last_seen_s: 5, observed_frames: 20, median_court_m: [-2, 6], thumbnail: null },
    ];
    window.localStorage.clear();
    // A saved player report shows the same estimates, marked experimental.
    const report = render(<ResultView result={parseAnalysisResult(result)} videoUrl="/demo.mp4" />);
    expect(screen.getByRole("radio", { name: "All, 4 shots" })).toBeTruthy();
    expect(screen.getAllByText("EXPERIMENTAL").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Serve at 0:01\. Jump the video here/ })).toBeTruthy();
    report.unmount();
    window.localStorage.clear();
    render(<ResultView result={parseAnalysisResult(result)} videoUrl="/demo.mp4" experimentalReview />);
    expect(screen.getByText("The selected player was tracked.")).toBeTruthy();
    expect(screen.queryByText(/4 hits were estimated/)).toBeNull();
    // Experimental labels are shown, clearly marked, for every player.
    expect(screen.getAllByText("EXPERIMENTAL").length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: "All, 4 shots" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Shots by player", hidden: true })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Jump the video here/ })).toHaveLength(4);
    // Only people on the court can be picked.
    expect(screen.getByText("Which player are you?")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /This is me/ })).toHaveLength(2);

    // Choosing Player 2 shows their two shots straight away, on your side of the chat.
    fireEvent.click(screen.getAllByRole("button", { name: /This is me/ })[1]);
    fireEvent.click(screen.getByRole("radio", { name: "You, 2 shots" }));
    expect(screen.getAllByRole("button", { name: /Jump the video here/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^You, Return at 0:02/ })).toBeTruthy();
    expect(window.localStorage.getItem(`picklepro:me:${result.provenance.source.sha256 ?? result.provenance.generated_at}`)).toBe("2");

    // Teams can be fixed by hand: moving one player makes the teams uneven until another moves too.
    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    const sheet = screen.getByRole("dialog", { name: "Fix teams" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Move player 1 to the other team" }));
    expect(within(sheet).getByRole("alert").textContent).toContain("Each team needs 1 player.");
    expect((within(sheet).getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Move you to the other team" }));
    expect((within(sheet).getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("without a court map, shows where each player stood, with the estimated share visible", () => {
    const measured = structuredClone(testFixture) as Record<string, any>;
    measured.data_origin = "measured";
    measured.metrics.court_heatmap = { ...measured.metrics.court_heatmap, status: "not_computed", value: null };
    measured.players = [{ player_id: 1, label: "Near side, left", on_court: true, side: "near", first_seen_s: 0,
      last_seen_s: 10, observed_frames: 90 }];
    measured.metrics.zone_time = {
      status: "experimental", validation: "not_evaluated", scope: "whole_clip", reason: "not checked",
      value: {
        zone_definitions: { kitchen: "k", transition: "t", baseline: "b", outside: "o", kitchen_line: "l" },
        window: "detected_rallies", window_s: 42, estimate_rules: "Feet below the picture: placed from the head.",
        players: [{ player_id: 1, side: "near", evaluable_s: 42, observed_s: 30, estimated_s: 12, unknown_s: 0,
          coverage: 0.714, estimated_share: 0.286, kitchen_line_share: 0.45,
          zone_seconds: { kitchen: 4.2, transition: 29.4, baseline: 6.3, outside: 2.1 },
          zone_share: { kitchen: 0.1, transition: 0.7, baseline: 0.15, outside: 0.05 } }],
      },
    };
    render(<ResultView result={parseAnalysisResult(measured)} videoUrl={null} />);
    expect(screen.getByText("Where each player stood")).toBeTruthy();
    expect(screen.getByText("Kitchen 10% · Transition 70% · Baseline 15% · Outside 5%")).toBeTruthy();
    expect(screen.getByText("29%")).toBeTruthy(); // estimated position share
    expect(screen.getByRole("img", { name: /Transition 70%/ })).toBeTruthy();
  });

  it("always shows the court map on the Position tab, even before positions are checked on real footage", () => {
    const measured = structuredClone(testFixture) as Record<string, any>;
    measured.data_origin = "measured";
    measured.metrics.court_heatmap.validation = "not_evaluated";
    render(<ResultView result={parseAnalysisResult(measured)} videoUrl={null} />);
    expect(screen.getByRole("tab", { name: "Position" })).toBeTruthy();
    expect(screen.getByText("Where you moved")).toBeTruthy();
    expect(screen.getByRole("img", { name: /half of the court from above/ })).toBeTruthy();
    const zones = screen.getByRole("group", { name: "Zones" });
    const noMansLand = within(zones).getByRole("button", { name: /No-man's land/ });
    fireEvent.click(noMansLand);
    expect(noMansLand.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/hardest spot to defend/)).toBeTruthy();
  });
});
