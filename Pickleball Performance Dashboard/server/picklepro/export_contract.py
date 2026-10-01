"""Regenerate the shared contract artifacts consumed by the TypeScript side.

    python -m picklepro.export_contract

Writes (relative to the dashboard project root):

* contracts/analysis_result.v1.schema.json
* contracts/fixtures/analysis_result.test_fixture.v1.json  — worker test-mode payload
* contracts/fixtures/analysis_result.insufficient.v1.json  — uncalibrated synthetic run

Both fixtures come from the SYNTHETIC clip in picklepro.fixtures, never from
real footage. Tests fail if the committed files drift from the models.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from .contract import AnalysisResultV1, json_schema
from .court import calibration_from_dict
from .fixtures import write_synthetic_clip
from .pipeline import AnalysisOptions, analyze_video
from .spatial import Selection

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
FIXED_TIME = "2026-01-01T00:00:00+00:00"
MAX_SNAPSHOTS = 40


def _stable(result: AnalysisResultV1, **overrides) -> dict:
    data = result.model_dump(mode="json")
    data["provenance"]["generated_at"] = FIXED_TIME
    data["provenance"]["source"] = {"filename": "synthetic_fixture.mp4", "sha256": None}
    data["player_positions"] = data["player_positions"][:MAX_SNAPSHOTS]
    data.update(overrides)
    return AnalysisResultV1.model_validate(data).model_dump(mode="json")


def build_fixtures() -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        clip = write_synthetic_clip(Path(tmp) / "synthetic_fixture.mp4", duration_s=20, fps=15)
        calibrated = analyze_video(clip.path, AnalysisOptions(
            calibration=calibration_from_dict(clip.calibration),
            selection=Selection("court_half", court_half="near"),
            experimental_zones=True, compute_sha256=False))
        uncalibrated = analyze_video(clip.path, AnalysisOptions(compute_sha256=False))
    return {
        "analysis_result.test_fixture.v1.json": _stable(
            calibrated, data_origin="test_fixture",
            message="TEST DATA: produced from a synthetic clip by the worker's test_fixture mode. "
                    "It is not an analysis of your video."),
        "analysis_result.insufficient.v1.json": _stable(uncalibrated),
    }


def main() -> None:
    (CONTRACTS / "fixtures").mkdir(parents=True, exist_ok=True)
    (CONTRACTS / "analysis_result.v1.schema.json").write_text(json.dumps(json_schema(), indent=2) + "\n")
    for name, data in build_fixtures().items():
        (CONTRACTS / "fixtures" / name).write_text(json.dumps(data, indent=2) + "\n")
    print(f"wrote contract artifacts to {CONTRACTS}")


if __name__ == "__main__":
    main()
