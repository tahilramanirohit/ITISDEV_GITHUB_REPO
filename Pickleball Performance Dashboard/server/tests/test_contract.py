import json
from pathlib import Path

from picklepro.contract import AnalysisResultV1, json_schema

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"


def test_committed_schema_matches_models():
    committed = json.loads((CONTRACTS / "analysis_result.v1.schema.json").read_text())
    assert committed == json_schema(), "Run `python -m picklepro.export_contract` and commit the result."


def test_fixtures_validate_and_are_labelled():
    fixture = AnalysisResultV1.model_validate_json(
        (CONTRACTS / "fixtures" / "analysis_result.test_fixture.v1.json").read_text())
    assert fixture.data_origin == "test_fixture"
    assert fixture.message.startswith("TEST DATA")

    insufficient = AnalysisResultV1.model_validate_json(
        (CONTRACTS / "fixtures" / "analysis_result.insufficient.v1.json").read_text())
    assert insufficient.status == "insufficient_data"
    assert insufficient.metrics.court_heatmap.value is None
