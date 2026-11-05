import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PeerFeedback } from "./PeerFeedback";
import type { PeerRating } from "../../lib/coaching/peerFeedback";

afterEach(cleanup);

function fakeSb(shares: Record<string, unknown>[] = [], notes: Record<string, unknown>[] = []) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "my_partners") return { data: [{ id: "l1", status: "active", direction: "sent", other_id: "k", other_name: "Kyle" }], error: null };
    if (fn === "session_peer_notes") return { data: notes, error: null };
    if (fn === "share_session") {
      shares.splice(0, shares.length, { partner_id: args?.p_partner_id, focus_skills: args?.p_focus_skills, with_video: args?.p_with_video });
      return { data: null, error: null };
    }
    if (fn === "unshare_session") { shares.splice(0); return { data: null, error: null }; }
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
  const from = vi.fn(() => ({ select: () => ({ eq: async () => ({ data: shares, error: null }) }) }));
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc };
}

const kyle = (skill: PeerRating["skill"], rating: number): PeerRating =>
  ({ author_id: "k", author_name: "Kyle", skill, rating, updated_at: "2026-11-05T10:00:00Z" });

describe("Peer feedback (owner)", () => {
  it("asks a partner to look at up to 3 skills, goal skills first, and says what stays private", async () => {
    const { sb, rpc } = fakeSb();
    render(<PeerFeedback sb={sb} sessionId="s1" hasVideo selfRatings={null} peerRatings={[]} goalSkills={["dinking", "third_shot"]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask for feedback" }));
    const sheet = screen.getByRole("dialog", { name: "Ask for feedback" });
    const skills = within(sheet).getByRole("group", { name: "Skills to look at" });
    expect(within(skills).getAllByRole("button")[0].textContent).toBe("Dinking · your goal");
    // The two goal skills start selected; a third can be added, a fourth cannot.
    fireEvent.click(within(skills).getByRole("button", { name: "Serve" }));
    fireEvent.click(within(skills).getByRole("button", { name: "Volleys & hands" }));
    expect(within(skills).getByRole("button", { name: "Volleys & hands" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(sheet).getByText("Kyle sees the video and these 3 skills. Not your ratings, journal or plan.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Send to Kyle" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("share_session",
      { p_session_id: "s1", p_partner_id: "k", p_focus_skills: ["dinking", "third_shot", "serve"], p_with_video: true }));
    expect(await screen.findByText(/Sent to Kyle/)).toBeTruthy();
    expect(screen.getByText(/Dinking · Third-shot drop · Serve · with video/)).toBeTruthy();
  });

  it("offers ratings only when the session has no video", async () => {
    const { sb, rpc } = fakeSb();
    render(<PeerFeedback sb={sb} sessionId="s1" hasVideo={false} selfRatings={null} peerRatings={[]} goalSkills={["consistency"]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask for feedback" }));
    const sheet = screen.getByRole("dialog", { name: "Ask for feedback" });
    expect((within(sheet).getByRole("button", { name: "With video" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(sheet).getByText(/Kyle sees the session's name and date and this skill/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Send to Kyle" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("share_session",
      { p_session_id: "s1", p_partner_id: "k", p_focus_skills: ["consistency"], p_with_video: false }));
  });

  it("shows You vs Kyle per skill and Kyle's notes grouped by skill, jumping to a note's moment", async () => {
    const onWatch = vi.fn();
    const { sb } = fakeSb([{ partner_id: "k", focus_skills: ["dinking", "serve"], with_video: true }], [
      { id: "n1", author_id: "k", author_name: "Kyle", mine: false, video_time_s: 134, body: "Paddle up before the dink", skill: "dinking",
        created_at: "", updated_at: "" },
    ]);
    render(<PeerFeedback sb={sb} sessionId="s1" hasVideo selfRatings={{ dinking: 4, serve: 3 }} peerRatings={[kyle("dinking", 2), kyle("serve", 3)]}
      goalSkills={[]} onWatch={onWatch} />);
    const list = await screen.findByRole("list", { name: "You vs Kyle" });
    expect(within(list).getByText("Kyle rated this 2 lower than you")).toBeTruthy();
    expect(within(list).getByText("You agree")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Watch at 2:14" }));
    expect(onWatch).toHaveBeenCalledWith(134);
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing with Kyle" }));
    expect(await screen.findByText("Stopped sharing with Kyle.")).toBeTruthy();
  });

  it("opens the Ask sheet for the partner picked on their Players card", async () => {
    const { sb } = fakeSb();
    render(<PeerFeedback sb={sb} sessionId="s1" hasVideo selfRatings={null} peerRatings={[]} goalSkills={["dinking"]} askFor="k" />);
    const sheet = await screen.findByRole("dialog", { name: "Ask for feedback" });
    expect(within(sheet).getByRole("button", { name: "Kyle" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("after a buddy session, offers to ask that buddy, or to invite them as a partner first", async () => {
    const { sb } = fakeSb();
    const view = render(<PeerFeedback sb={sb} sessionId="s1" hasVideo selfRatings={null} peerRatings={[]} goalSkills={["dinking"]}
      playedWith={{ id: "k", name: "Kyle" }} />);
    expect(await screen.findByText("You played with Kyle. Ask Kyle for feedback on your dinking?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask Kyle" }));
    expect(screen.getByRole("dialog", { name: "Ask for feedback" })).toBeTruthy();
    view.unmount();

    const rpc = vi.fn(async (fn: string) => {
      if (fn === "my_partners") return { data: [], error: null };
      if (fn === "session_peer_notes") return { data: [], error: null };
      if (fn === "invite_buddy_as_partner") return { data: "l9", error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    const from = vi.fn(() => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }));
    render(<PeerFeedback sb={{ rpc, from } as unknown as SupabaseClient} sessionId="s1" hasVideo={false} selfRatings={null} peerRatings={[]}
      goalSkills={[]} playedWith={{ id: "j", name: "Jun" }} />);
    expect(await screen.findByText(/You and Jun are buddies. Partner for video feedback first/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Partner with Jun for video feedback" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("invite_buddy_as_partner", { p_player: "j" }));
    expect(await screen.findByText(/Video partner invite sent to Jun/)).toBeTruthy();
  });
});
