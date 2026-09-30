"""Find the local court, player, and ball models without manual path setup.

Resolution order for each model:

1. An explicit environment variable (``PICKLEPRO_COURT_WEIGHTS``,
   ``PICKLEPRO_YOLO_WEIGHTS``, ``PICKLEPRO_BALL_WEIGHTS``) that points to an
   existing file. ``PICKLEPRO_BALL_WEIGHTS`` may list several files separated
   by ``;`` on Windows or ``:`` elsewhere.
2. A weights file in the models folder (``server/models`` or
   ``PICKLEPRO_MODELS_DIR``). The court model is a ``.pt`` file with "court" in
   its name and the ball model one with "ball" in its name (the
   pickleball-analysis ``ball,person,paddle.pt`` when present; extra ball
   models run only when listed in ``PICKLEPRO_BALL_WEIGHTS``). Any other ``.pt``
   file (for example ``yolo11n.pt``) is the person model; without one, the
   ball model's own person class is used.

``python -m picklepro.fetch_models`` downloads the reviewed files.

The person detector defaults to ``yolo`` when Ultralytics is installed and an
object model was found, and to ``motion`` otherwise. ``PICKLEPRO_DETECTOR``
still overrides this. Set ``PICKLEPRO_AUTO_MODELS=0`` to turn discovery off
(the test suite does this so results do not depend on local files).

Discovery never downloads anything. Class names are checked when a model is loaded.
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
DEFAULT_BALL_MODEL = "ball,person,paddle.pt"


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
            "ball_model": ", ".join(Path(p).name for p in self.ball_weights.split(os.pathsep))
        if self.ball_weights else None,
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


def _discover(models_dir: Path) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (court, person, ball) weights found in the models folder.

    One ball model is used: the pickleball-analysis model when present. On
    the labelled test clip, pooling extra ball models found more balls but
    also many false hits, so they run only when listed in
    ``PICKLEPRO_BALL_WEIGHTS``.
    """
    if not models_dir.is_dir():
        return None, None, None
    weights = sorted(p for p in models_dir.glob("*.pt") if p.is_file())
    court = next((p for p in weights if "court" in p.name.lower()), None)
    balls = [p for p in weights if p != court and "ball" in p.name.lower()]
    others = [p for p in weights if p != court and p not in balls]
    # A pose model finds the same people and also their joints, which the
    # shot detector uses to see swings, so it is preferred.
    person = next((p for p in others if "pose" in p.name.lower()), None) \
        or next((p for p in others if any(k in p.name.lower() for k in ("person", "player"))), None) \
        or (others[0] if others else None) \
        or next((p for p in balls if "person" in p.name.lower()), None)
    if not balls and others:
        balls = [others[0]]
    balls = sorted(balls, key=lambda p: (p.name.lower() != DEFAULT_BALL_MODEL, p.name.lower()))[:1]
    path = lambda p: str(p.resolve()) if p else None  # noqa: E731
    ball = os.pathsep.join(str(p.resolve()) for p in balls) or None
    return path(court), path(person), ball


def resolve_models(env: Optional[Mapping[str, str]] = None) -> ModelSetup:
    env = os.environ if env is None else env
    notes: List[str] = []
    installed = _ultralytics_installed()
    auto = env.get("PICKLEPRO_AUTO_MODELS", "1") != "0"

    court = _existing(env.get("PICKLEPRO_COURT_WEIGHTS"), "PICKLEPRO_COURT_WEIGHTS", notes)
    person = _existing(env.get("PICKLEPRO_YOLO_WEIGHTS"), "PICKLEPRO_YOLO_WEIGHTS", notes)
    ball = os.pathsep.join(
        found for value in (env.get("PICKLEPRO_BALL_WEIGHTS") or "").split(os.pathsep)
        if (found := _existing(value, "PICKLEPRO_BALL_WEIGHTS", notes))
    ) or None
    if auto:
        found_court, found_person, found_ball = _discover(Path(env.get("PICKLEPRO_MODELS_DIR") or DEFAULT_MODELS_DIR))
        court = court or found_court
        person = person or found_person
        ball = ball or found_ball

    if (court or person or ball) and not installed:
        notes.append("Model files were found, but Ultralytics is not installed "
                     "(pip install -r requirements-yolo.txt). Using motion detection without court or ball models.")
        court = person = ball = None

    requested = env.get("PICKLEPRO_DETECTOR")
    if requested in ("motion", "yolo"):
        detector = requested
        if requested == "motion" and person:
            notes.append("PICKLEPRO_DETECTOR=motion in server/.env overrides the person model that was found; "
                         "delete that line to detect players with the model.")
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
