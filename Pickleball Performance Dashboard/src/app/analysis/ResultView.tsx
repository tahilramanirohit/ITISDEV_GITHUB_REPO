import { AlertTriangle, FlaskConical, Info } from "lucide-react";
import {
  METRIC_KEYS, METRIC_LABELS, VALIDATION_LABELS,
  type AnalysisResultV1, type MetricKey, type MetricStatus,
} from "../../lib/analysis/contract";
import { BLUE_SKY, BORDER, NEON, ORANGE, ORANGE_L, ROSE, VIOLET, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice, Pill, WidgetHeader } from "../shell/primitives";
import { CourtDwellHeatmap } from "./CourtDwellHeatmap";
import { CoachingPanel, type PreviousSession } from "./CoachingPanel";
import { VideoOverlayPlayer } from "./VideoOverlayPlayer";

const STATUS_COLORS: Record<MetricStatus, string> = {
  measured: NEON,
  insufficient_data: ORANGE,
  not_computed: WHITE_SUB,
  experimental: VIOLET,
};
const STATUS_TEXT: Record<MetricStatus, string> = {
  measured: "Measured",
  insufficient_data: "Insufficient data",
  not_computed: "Not computed",
  experimental: "Experimental",
};

const fmtS = (s: number | null | undefined) => (s == null ? "unknown" : `${s.toFixed(1)} s`);
const pct = (f: number | null | undefined) => (f == null ? "unknown" : `${Math.round(f * 100)}%`);

export function OriginBadge({ origin }: { origin: AnalysisResultV1["data_origin"] }) {
  return origin === "test_fixture" ? (
    <Pill color={ROSE} title="Canned result produced by the worker's test mode. It is not an analysis of this video.">
      <FlaskConical size={10} /> TEST DATA — NOT FROM YOUR VIDEO
    </Pill>
  ) : (
    <Pill color={NEON} title="Computed by the analysis pipeline from this video.">MEASURED FROM THIS VIDEO</Pill>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b text-xs" style={{ borderColor: BORDER }}>
      <span style={{ color: WHITE_DIM }}>{k}</span>
      <span className="font-mono text-right" style={{ color: WHITE }}>{v}</span>
    </div>
  );
}

export function ResultView({ result, videoUrl, previous }: {
  result: AnalysisResultV1; videoUrl: string | null; previous?: PreviousSession | null;
}) {
  const c = result.coverage;
  const heat = result.metrics.court_heatmap;
  const zones = result.metrics.zone_occupancy;
  const sel = result.player_selection;

  return (
    <div className="space-y-4" data-testid="result-view">
      {result.data_origin === "test_fixture" && (
        <Notice tone="error">
          <strong>Test data.</strong> This result was produced by the worker's test mode from a synthetic clip. None
          of the numbers below describe your video.
        </Notice>
      )}

      <Card accent={result.status === "ok" ? NEON : ORANGE}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <OriginBadge origin={result.data_origin} />
          <Pill color={result.status === "ok" ? NEON : ORANGE}>
            {result.status === "ok" ? "RESULT" : "INSUFFICIENT DATA"}
          </Pill>
          <Pill color={BLUE_SKY}>WHOLE-CLIP METRICS</Pill>
        </div>
        <p className="text-sm text-white">{result.message}</p>
        {result.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {result.warnings.map((w) => (
              <li key={w} className="text-xs flex gap-2" style={{ color: ORANGE_L }}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> {w}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CoachingPanel result={result} previous={previous} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <VideoOverlayPlayer src={videoUrl} positions={result.player_positions} ballPositions={result.ball_positions ?? []}
            selectedTrackId={sel?.method === "track_id" ? sel.track_id : null} />

          <Card>
            <WidgetHeader title="Metrics" subtitle="Each metric reports its own status. Nothing here is a rally-level or shot-level finding." />
            <ul className="space-y-2">
              {METRIC_KEYS.map((key: MetricKey) => {
                const m = result.metrics[key];
                return (
                  <li key={key} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{METRIC_LABELS[key]}</span>
                      <Pill color={STATUS_COLORS[m.status]}>{STATUS_TEXT[m.status].toUpperCase()}</Pill>
                      {m.status !== "not_computed" && <Pill color={WHITE_SUB}>{VALIDATION_LABELS[m.validation]}</Pill>}
                    </div>
                    {m.reason && <p className="text-xs mt-1" style={{ color: WHITE_DIM }}>{m.reason}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <WidgetHeader title="Court heatmap" subtitle="Where the selected player's feet were, weighted by time. Positional accuracy is not yet evaluated on real footage." />
            {heat.status === "measured" && heat.value ? (
              <>
                <CourtDwellHeatmap value={heat.value} />
                <div className="mt-3">
                  <Row k="Tracked time" v={fmtS(heat.value.tracked_time_s)} />
                  <Row k="Outside mapped area" v={fmtS(heat.value.outside_mapped_area_s)} />
                </div>
              </>
            ) : (
              <p className="text-xs flex gap-2" style={{ color: ORANGE_L }}>
                <Info size={12} className="flex-shrink-0 mt-0.5" /> {heat.reason ?? "Not available."}
              </p>
            )}
            {zones.status === "experimental" && zones.value && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-white">Zone occupancy</span>
                  <Pill color={VIOLET}>EXPERIMENTAL</Pill>
                </div>
                {Object.entries(zones.value.fraction_of_tracked_time).map(([zone, f]) => (
                  <Row key={zone} k={zone.replace(/_/g, " ")} v={pct(f)} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <WidgetHeader title="Provenance & coverage" subtitle="How this result was produced and how much of the video it covers." />
            <Row k="Origin" v={result.data_origin === "test_fixture" ? "test fixture" : "measured"} />
            <Row k="Pipeline version" v={result.provenance.pipeline_version} />
            <Row k="Detector" v={result.provenance.detector.name} />
            <Row k="Ball detector" v={result.provenance.ball_detector?.name ?? "not configured"} />
            <Row k="Detection confidence" v={result.provenance.detector.confidence_is_model_score ? "model score" : "not available"} />
            <Row k="Video length" v={fmtS(result.video.container_duration_s)} />
            <Row k="Analyzed" v={`${fmtS(c.analyzed_start_s)} – ${fmtS(c.analyzed_end_s)}`} />
            <Row k="Share of video analyzed" v={pct(c.fraction_of_video_analyzed)} />
            <Row k="Frames analyzed" v={`${c.frames_analyzed} (every ${c.sample_stride}${c.sample_stride === 1 ? "" : "th"} frame)`} />
            <Row k="Frames with player detections" v={c.frames_with_detections} />
            <Row k="Frames with ball detections" v={c.frames_with_ball_detections ?? 0} />
            {c.decode_failures > 0 && <Row k="Undecodable frames" v={c.decode_failures} />}
            <Row k="Calibration" v={result.calibration
              ? `${result.calibration.method === "auto_model_landmarks" ? "automatic" : "manual"} · ${result.calibration.landmarks_used.length} landmarks · ${result.calibration.quality} (${result.calibration.reprojection_rmse_m.toFixed(2)} m)`
              : "none"} />
            <Row k="Player selection" v={sel
              ? `${sel.method === "court_half" ? `${sel.court_half} half` : `track #${sel.track_id}`} · tracked ${pct(sel.tracked_fraction)}`
              : "none"} />
            {result.tracks.length > 0 && <Row k="Player track IDs" v={result.tracks
              .slice().sort((a, b) => b.observed_frames - a.observed_frames)
              .slice(0, 8).map((track) => `#${track.track_id}`).join(", ")} />}
            <Row k="Generated" v={new Date(result.provenance.generated_at).toLocaleString()} />
            {result.provenance.source.filename && <Row k="Source file" v={result.provenance.source.filename} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
