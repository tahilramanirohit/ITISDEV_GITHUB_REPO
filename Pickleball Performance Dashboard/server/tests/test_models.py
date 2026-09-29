"""Automatic model discovery and setup checks (no model is loaded here)."""

import pytest

from picklepro import models
from picklepro.worker.__main__ import supabase_mismatch


@pytest.fixture
def models_dir(tmp_path):
    (tmp_path / "court_best.pt").write_bytes(b"x")
    (tmp_path / "ball,person,paddle.pt").write_bytes(b"x")
    return tmp_path


def test_finds_court_and_object_models_in_the_models_folder(models_dir, monkeypatch):
    monkeypatch.setattr(models, "_ultralytics_installed", lambda: True)
    setup = models.resolve_models({"PICKLEPRO_MODELS_DIR": str(models_dir)})
    assert setup.detector == "yolo"
    assert setup.court_weights.endswith("court_best.pt")
    assert setup.yolo_weights.endswith("ball,person,paddle.pt") and setup.ball_weights == setup.yolo_weights
    info = setup.describe()
    assert info["can_estimate_shots"] and info["court_model"] == "court_best.pt"
    assert str(models_dir) not in str(info), "absolute paths must not reach the browser"


def test_separate_person_model_is_preferred_for_players(models_dir, monkeypatch):
    (models_dir / "yolo11n.pt").write_bytes(b"x")
    monkeypatch.setattr(models, "_ultralytics_installed", lambda: True)
    setup = models.resolve_models({"PICKLEPRO_MODELS_DIR": str(models_dir)})
    assert setup.yolo_weights.endswith("yolo11n.pt")
    assert setup.ball_weights.endswith("ball,person,paddle.pt")
    assert setup.court_weights.endswith("court_best.pt")


def test_explicit_motion_detector_explains_the_override(models_dir, monkeypatch):
    monkeypatch.setattr(models, "_ultralytics_installed", lambda: True)
    setup = models.resolve_models({"PICKLEPRO_MODELS_DIR": str(models_dir), "PICKLEPRO_DETECTOR": "motion"})
    assert setup.detector == "motion" and any("delete that line" in n for n in setup.notes)


def test_missing_env_path_falls_back_to_the_models_folder(models_dir, monkeypatch):
    monkeypatch.setattr(models, "_ultralytics_installed", lambda: True)
    setup = models.resolve_models({"PICKLEPRO_MODELS_DIR": str(models_dir),
                                   "PICKLEPRO_COURT_WEIGHTS": "/old/place/court_best.pt"})
    assert setup.court_weights.endswith("court_best.pt") and setup.notes


def test_without_ultralytics_uses_motion_and_says_why(models_dir, monkeypatch):
    monkeypatch.setattr(models, "_ultralytics_installed", lambda: False)
    setup = models.resolve_models({"PICKLEPRO_MODELS_DIR": str(models_dir)})
    assert setup.detector == "motion" and setup.court_weights is None and setup.ball_weights is None
    assert any("Ultralytics" in note for note in setup.notes)


def test_discovery_can_be_turned_off(models_dir, monkeypatch):
    monkeypatch.setattr(models, "_ultralytics_installed", lambda: True)
    setup = models.resolve_models({"PICKLEPRO_MODELS_DIR": str(models_dir), "PICKLEPRO_AUTO_MODELS": "0"})
    assert setup.detector == "motion" and setup.court_weights is None


def test_worker_warns_when_web_app_uses_another_supabase_project(tmp_path):
    env = tmp_path / ".env.local"
    env.write_text("VITE_SUPABASE_URL=https://aaaa.supabase.co\n")
    assert "aaaa" in supabase_mismatch("https://bbbb.supabase.co", env)
    assert supabase_mismatch("https://aaaa.supabase.co", env) is None
