import json
import pytest
from picklepro import dataset

def row(**extra):
    return dict(source_id='match-1',sha256='a'*64,path='clip.mp4',original_fps=30.,duration_s=51.,
                partition='development',label_path='clip.labels.json',label_version='v1',consent_status='unknown',**extra)

def test_reject_duplicate_hash_even_with_different_source_ids():
    with pytest.raises(ValueError,match='Duplicate'):dataset.validate_manifest([row(),{**row(),'source_id':'other'}])

def test_reject_conflicting_source_splits():
    with pytest.raises(ValueError,match='conflicting'):dataset.validate_manifest([row(),{**row(),'sha256':'b'*64,'partition':'evaluation'}])

def test_tuning_does_not_select_evaluation_recording():
    rows=[row(),{**row(),'source_id':'reserved','sha256':'b'*64,'partition':'evaluation'}]
    assert [r['source_id'] for r in dataset.select_recordings(rows,'tuning')]==['match-1']
    with pytest.raises(ValueError):dataset.select_recordings(rows,'tuning','reserved')

def test_csv_and_json_share_validation(tmp_path):
    dataset.write_manifest([row()],tmp_path/'manifest.json')
    dataset.write_manifest([row()],tmp_path/'manifest.csv')
    assert dataset.load_manifest(tmp_path/'manifest.csv')==dataset.load_manifest(tmp_path/'manifest.json')

@pytest.mark.parametrize('patch',[{'sha256':'bad'},{'original_fps':float('nan')},{'duration_s':0},
                                 {'consent_status':'assumed'},{'label_version':None},{'source_id':''}])
def test_invalid_metadata_rejected(patch):
    with pytest.raises(ValueError):dataset.validate_manifest([{**row(),**patch}])

def test_source_and_label_identity_mismatch(tmp_path):
    video=tmp_path/'clip.mp4';video.write_bytes(b'video')
    r=row();r['sha256']=dataset.sha256(video)
    (tmp_path/'clip.labels.json').write_text(json.dumps({'recording_sha256':'b'*64,'original_fps':30,'label_version':'v1','shots':[]}))
    with pytest.raises(ValueError,match='identity'):dataset.read_verified_labels(r,tmp_path)
