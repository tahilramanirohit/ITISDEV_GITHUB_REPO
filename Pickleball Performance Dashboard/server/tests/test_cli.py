import json

from conftest import write_constant_video

from picklepro.cli import EXIT_INSUFFICIENT, EXIT_OK, EXIT_USAGE, main


def test_cli_full_flow_on_synthetic_clip(tmp_path):
    video, calib, out = tmp_path / "demo.mp4", tmp_path / "calib.json", tmp_path / "result.json"
    assert main(["make-synthetic", str(video), "--duration", "12", "--calibration-out", str(calib)]) == EXIT_OK
    code = main(["analyze", str(video), "--calibration", str(calib), "--court-half", "near", "--out", str(out)])
    assert code == EXIT_OK
    result = json.loads(out.read_text())
    assert result["metrics"]["court_heatmap"]["status"] == "measured"


def test_cli_insufficient_exit_code(tmp_path):
    video = write_constant_video(tmp_path / "black.mp4", frames=20)
    assert main(["analyze", str(video), "--out", str(tmp_path / "r.json")]) == EXIT_INSUFFICIENT


def test_cli_rejects_bad_inputs(tmp_path):
    assert main(["analyze", str(tmp_path / "missing.mp4")]) == EXIT_USAGE
    bad = tmp_path / "calib.json"
    bad.write_text("{}")
    video = write_constant_video(tmp_path / "black.mp4", frames=5)
    assert main(["analyze", str(video), "--calibration", str(bad)]) == EXIT_USAGE


def test_extract_frame(tmp_path):
    video = write_constant_video(tmp_path / "v.mp4", frames=20)
    out = tmp_path / "frame.png"
    assert main(["extract-frame", str(video), "--at", "1", "--out", str(out)]) == EXIT_OK
    assert out.stat().st_size > 0
