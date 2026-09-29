"""Find the local court, player, and ball models without manual path setup.

Resolution order for each model:

1. An explicit environment variable (``PICKLEPRO_COURT_WEIGHTS``,
   ``PICKLEPRO_YOLO_WEIGHTS``, ``PICKLEPRO_BALL_WEIGHTS``) that points to an
   existing file.
2. A weights file in the models folder (``server/models`` or
   ``PICKLEPRO_MODELS_DIR``). The court model is a ``.pt`` file with "court" in
   its name; the object model is any other ``.pt`` file, preferring names that
   mention "ball" or "person".

The person detector defaults to ``yolo`` when Ultralytics is installed and an
object model was found, and to ``motion`` otherwise. ``PICKLEPRO_DETECTOR``
still overrides this. Set ``PICKLEPRO_AUTO_MODELS=0`` to turn discovery off
(the test suite does this so results do not depend on local files).

Nothing is downloaded. Class names are checked when a model is loaded.
"""

from __future__ import annotations

import importlib.util
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Mapping, Optional

logger = logging.getLogger(__name__)

SERVER_DIR = Path(__file__).resolve().parents[1]
DEFAULT_MODELS_DIR = SERVER_DIR / "models"


def load_dotenv(path: Path = SERVER_DIR / ".env") -> None:
    """Read KEY=VALUE lines into the environment without overriding real variables."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass
class ModelSetup:
    detector: str
    yolo_weights: Optional[str] = None
    court_weights: Optional[str] = None
    ball_weights: Optional[str] = None
    ultralytics_installed: bool = False
    notes: List[str] = field(default_factory=list)

    def describe(self) -> dict:
        """A browser-safe summary: file names only, never absolute paths."""
        name = lambda p: Path(p).name if p else None  # noqa: E731
        return {
            "player_detector": self.detector,
            "player_model": name(self.yolo_weights) if self.detector == "yolo" else None,
            "court_model": name(self.court_weights),
            "ball_model": name(self.ball_weights),
            "ultralytics_installed": self.ultralytics_installed,
            "can_map_court": bool(self.court_weights),
            "can_find_players": True,
            "players_are_confirmed_people": self.detector == "yolo",
            "can_find_ball": bool(self.ball_weights),
            "can_estimate_shots": bool(self.ball_weights and self.court_weights),
            "notes": list(self.notes),
        }


def _ultralytics_installed() -> bool:
    return importlib.util.find_spec("ultralytics") is not None


def _existing(value: Optional[str], label: str, notes: List[str]) -> Optional[str]:
    if not value:
        return None
    if Path(value).is_file():
        return str(Path(value).resolve())
    notes.append(f"{label} points to a missing file ({Path(value).name}); looking in the models folder instead.")
    return None


def _discover(models_dir: Path) -> tuple[Optional[str], Optional[str]]:
    if not models_dir.is_dir():
        return None, None
    weights = sorted(p for p in models_dir.glob("*.pt") if p.is_file())
    court = next((p for p in weights if "court" in p.name.lower()), None)
    objects = [p for p in weights if p != court]
    preferred = [p for p in objects if any(k in p.name.lower() for k in ("ball", "person", "player"))]
    obj = (preferred or objects or [None])[0]
    return (str(court.resolve()) if court else None, str(obj.resolve()) if obj else None)


def resolve_models(env: Optional[Mapping[str, str]] = None) -> ModelSetup:
    env = os.environ if env is None else env
    notes: List[str] = []
    installed = _ultralytics_installed()
    auto = env.get("PICKLEPRO_AUTO_MODELS", "1") != "0"

    court = _existing(env.get("PICKLEPRO_COURT_WEIGHTS"), "PICKLEPRO_COURT_WEIGHTS", notes)
    person = _existing(env.get("PICKLEPRO_YOLO_WEIGHTS"), "PICKLEPRO_YOLO_WEIGHTS", notes)
    ball = _existing(env.get("PICKLEPRO_BALL_WEIGHTS"), "PICKLEPRO_BALL_WEIGHTS", notes)
    if auto:
        found_court, found_objects = _discover(Path(env.get("PICKLEPRO_MODELS_DIR") or DEFAULT_MODELS_DIR))
        court = court or found_court
        person = person or found_objects
        ball = ball or found_objects

    if (court or person or ball) and not installed:
        notes.append("Model files were found, but Ultralytics is not installed "
                     "(pip install -r requirements-yolo.txt). Using motion detection without court or ball models.")
        court = person = ball = None

    requested = env.get("PICKLEPRO_DETECTOR")
    if requested in ("motion", "yolo"):
        detector = requested
    else:
        detector = "yolo" if person else "motion"
    if detector == "yolo" and not person:
        notes.append("PICKLEPRO_DETECTOR=yolo but no person model was found; using motion detection.")
        detector = "motion"
    return ModelSetup(detector=detector, yolo_weights=person if detector == "yolo" else None,
                      court_weights=court, ball_weights=ball, ultralytics_installed=installed, notes=notes)


def log_setup(setup: ModelSetup, log: logging.Logger = logger) -> None:
    info = setup.describe()
    log.info("models: players=%s (%s), court=%s, ball=%s",
             info["player_detector"], info["player_model"] or "no model",
             info["court_model"] or "none", info["ball_model"] or "none")
    for note in setup.notes:
        log.warning(note)
