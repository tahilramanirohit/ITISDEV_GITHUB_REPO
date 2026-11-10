import { ChevronRight, MessageSquareText, Video } from "lucide-react";
import type { SharedSession } from "../../lib/api/partners";
import { CONTEXT_LABELS, FORMAT_LABELS } from "../../lib/api/types";
import { feedbackDue } from "../../lib/coaching/people";
import { SKILL_INFO, type SelfSkill } from "../../lib/coaching/selfAssessment";
import { GREEN, INK, ROSE, WHITE_DIM } from "../theme";
import { Card, PrimaryButton, SectionTitle } from "../shell/primitives";
import { Avatar, shortDate } from "./parts";
import type { PlayersData, Section } from "./PlayersPage";

const skillList = (keys: readonly string[]) => keys.filter((k): k is SelfSkill => k in SKILL_INFO).map((k) => SKILL_INFO[k].label).join(", ");

/** A session a partner shared with you, linking to their report and video. */
export function SharedCard({ s }: { s: SharedSession }) {
  const due = feedbackDue(s);
  return <a href={`#/shared/${s.session_id}`} className="block rounded-[var(--radius-lg)] focus:outline-none focus-visible:ring-2"
    aria-label={`${s.owner_name}: ${s.title}`}><Card>
    <div className="flex items-center gap-3">
      <Avatar name={s.owner_name} id={s.owner_id} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>From {s.owner_name}</p>
        <p className="truncate text-base font-bold" style={{ color: INK }}>{s.title}</p>
        <p className="text-sm" style={{ color: WHITE_DIM }}>
          {shortDate(s.session_date)} · {CONTEXT_LABELS[s.session_context]} · {FORMAT_LABELS[s.play_format]}{s.with_video === false ? " · ratings only" : " · with video"}</p>
        {s.focus_skills?.length ? <p className="mt-1 text-sm" style={{ color: INK }}>Asked: <b>{skillList(s.focus_skills)}</b></p> : null}
        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: due || s.has_report || s.focus_skills?.length ? GREEN : ROSE }}>
          {s.focus_skills?.length
            ? due ? "Rate and send feedback" : "✓ Feedback sent"
            : s.has_report ? <><MessageSquareText size={14} aria-hidden="true" />
              {s.my_notes ? `${s.my_notes} note${s.my_notes === 1 ? "" : "s"} from you` : "Watch and leave notes"}</>
            : "No video report yet"}</p>
      </div>
      <ChevronRight size={20} aria-hidden="true" style={{ color: WHITE_DIM }} />
    </div>
  </Card></a>;
}

/** One of your sessions shared with a partner: open the video, and see whether they answered. */
function MySharedCard({ title, date, partner, partnerId, skills, withVideo, rated, sessionId }: {
  title: string; partnerId: string; date: string; partner: string; skills: string[]; withVideo: boolean; rated: number; sessionId: string;
}) {
  const answered = skills.length ? rated >= skills.length : rated > 0;
  return <a href={`#/sessions/${sessionId}?tab=${withVideo ? "video" : "plan"}`} className="block rounded-[var(--radius-lg)] focus:outline-none focus-visible:ring-2"
    aria-label={`You shared ${title} with ${partner}`}><Card>
    <div className="flex items-center gap-3">
      <Avatar name={partner} id={partnerId} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>You shared with {partner}</p>
        <p className="truncate text-base font-bold" style={{ color: INK }}>{title}</p>
        <p className="text-sm" style={{ color: WHITE_DIM }}>{shortDate(date)}{withVideo ? " · with video" : " · ratings only"}</p>
        {skills.length > 0 && <p className="mt-1 text-sm" style={{ color: INK }}>Asked: <b>{skillList(skills)}</b></p>}
        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: answered ? GREEN : WHITE_DIM }}>
          {withVideo && <Video size={14} aria-hidden="true" />}
          {answered ? `✓ ${partner} sent feedback` : skills.length && rated ? `${partner} rated ${rated} of ${skills.length}` : `Waiting for ${partner}`}</p>
      </div>
      <ChevronRight size={20} aria-hidden="true" style={{ color: WHITE_DIM }} />
    </div>
  </Card></a>;
}

/**
 * Shared sessions, both ways: sessions partners shared with you (feedback they asked for first)
 * and the sessions you shared with them. Both players reach the video from here.
 */
export function SharedSection({ data, onOpen }: { data: PlayersData; onOpen: (s: Section) => void }) {
  const due = data.shared.filter(feedbackDue);
  const done = data.shared.filter((s) => !feedbackDue(s));
  const sessionById = new Map(data.sessions.map((s) => [s.id, s]));
  const partnerName = new Map(data.links.filter((l) => l.other_id).map((l) => [l.other_id!, l.other_name ?? "Partner"]));
  const mine = data.shares.flatMap((sh) => {
    const session = sessionById.get(sh.session_id);
    if (!session) return [];
    const rated = data.peerRatings.filter((r) => r.session_id === sh.session_id && r.author_id === sh.partner_id).length;
    return [{ ...sh, session, partner: partnerName.get(sh.partner_id) ?? "A former partner", rated }];
  }).sort((a, b) => b.session.session_date.localeCompare(a.session.session_date));

  return <>
    {due.length > 0 && <section aria-labelledby="due-heading" className="space-y-3">
      <SectionTitle><span id="due-heading">Feedback asked of you ({due.length})</span></SectionTitle>
      <ul className="space-y-3" aria-label="Feedback asked of you">{due.map((s) => <li key={s.session_id}><SharedCard s={s} /></li>)}</ul>
    </section>}

    {mine.length > 0 && <section aria-labelledby="mine-heading" className="space-y-3">
      <SectionTitle><span id="mine-heading">You shared</span></SectionTitle>
      <ul className="space-y-3" aria-label="Sessions you shared">{mine.map((m) => <li key={`${m.session_id}-${m.partner_id}`}>
        <MySharedCard title={m.session.title} date={m.session.session_date} partner={m.partner} partnerId={m.partner_id} skills={m.focus_skills ?? []}
          withVideo={m.with_video ?? true} rated={m.rated} sessionId={m.session_id} /></li>)}</ul>
    </section>}

    {done.length > 0 && <section aria-labelledby="shared-heading" className="space-y-3">
      <SectionTitle><span id="shared-heading">Shared with you</span></SectionTitle>
      <ul className="space-y-3" aria-label="Sessions shared with you">{done.map((s) => <li key={s.session_id}><SharedCard s={s} /></li>)}</ul>
    </section>}

    {due.length + mine.length + done.length === 0 && <Card>
      <p className="text-sm" style={{ color: WHITE_DIM }}>Nothing shared yet. Partner with a buddy for video feedback, then share a session from
        its Rate &amp; plan tab with <b>Ask for feedback</b>. You both see it here: they watch and rate it, you see their feedback.</p>
      <PrimaryButton className="mt-3" tone="light" onClick={() => onOpen("partners")}>Go to My partners</PrimaryButton>
    </Card>}
  </>;
}
