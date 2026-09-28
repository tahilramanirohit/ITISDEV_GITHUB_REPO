"""PicklePro video-analysis pipeline.

Everything in this package runs outside the browser: locally from the CLI, behind
the FastAPI prototype endpoint, or inside the job worker.
"""

# Bump whenever a change could alter a metric value for the same input video.
PIPELINE_VERSION = "0.6.0-dev"
