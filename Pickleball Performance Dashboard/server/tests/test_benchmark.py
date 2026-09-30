import pytest
from picklepro import benchmark

def row():return {'source_id':'a','sha256':'a'*64,'original_fps':30.,'label_version':'v1','partition':'development','consent_status':'unknown'}
def labels():return {'source_id':'a','recording_sha256':'a'*64,'original_fps':30.,'label_version':'v1','time_resolution_s':.1,'shots':[{'t':1,'type':'drive','player':None}]}
def result():return {'provenance':{'source':{'sha256':'a'*64}},'metrics':{'shot_classification':{'value':{'shots':[]}}}}
def meta():return {'code_revision':'c'*40,'working_tree_sha256':'d'*64,'checkpoint_hashes':{'ball':'b'*64},'sampling_settings':{'ball_fps':15,'target_fps':10},'runtime_s':2,'hardware':'test-fixture'}

def test_benchmark_records_provenance_and_split_manifest():
    report=benchmark.build_benchmark(row(),result(),labels(),meta(),[row()])
    assert report['provenance']['checkpoint_hashes']=={'ball':'b'*64}
    assert report['provenance']['code_revision']=='c'*40
    assert report['split_manifest']==[row()]
    assert report['scores']['protocol']=='contacts-0.2s-optimal-v1'
    assert report['scores']['recall']==0

@pytest.mark.parametrize('key',['code_revision','checkpoint_hashes','sampling_settings','working_tree_sha256'])
def test_missing_provenance_rejected(key):
    metadata=meta();del metadata[key]
    with pytest.raises(ValueError):benchmark.build_benchmark(row(),result(),labels(),metadata,[row()])

def test_result_from_another_video_rejected():
    r=result();r['provenance']['source']['sha256']='b'*64
    with pytest.raises(ValueError):benchmark.build_benchmark(row(),r,labels(),meta(),[row()])

def test_label_identity_checked_even_when_scoring_stored_result():
    lab=labels();lab['original_fps']=60
    with pytest.raises(ValueError):benchmark.build_benchmark(row(),result(),lab,meta(),[row()])

@pytest.mark.parametrize('coverage',[None,'partial','unknown'])
def test_partial_or_unreviewed_coverage_blocks_full_recording_benchmark(coverage):
    lab=labels()
    if coverage is not None:lab['label_coverage']=coverage
    with pytest.raises(ValueError,match='complete'):
        benchmark.require_complete_contacts(lab)


def test_explicit_complete_review_coverage_accepted():
    lab=labels();lab['label_coverage']='complete'
    benchmark.require_complete_contacts(lab)


def test_three_repeat_cli_records_actual_stride_without_changing_defaults(tmp_path, monkeypatch):
    import json
    import sys
    from types import SimpleNamespace
    from picklepro import dataset, models, pipeline
    video=tmp_path/'dev.mp4';video.write_bytes(b'fixture-not-a-real-video')
    source_hash=dataset.sha256(video)
    lab={**labels(),'recording_sha256':source_hash,'label_coverage':'complete'}
    (tmp_path/'labels.json').write_text(json.dumps(lab))
    recording={**row(),'sha256':source_hash,'path':'dev.mp4','duration_s':5.,'label_path':'labels.json'}
    dataset.write_manifest([recording],tmp_path/'manifest.json')
    weights=tmp_path/'weights.pt';weights.write_bytes(b'fixture-not-a-checkpoint')
    monkeypatch.setattr(models,'resolve_models',lambda:SimpleNamespace(detector='yolo',yolo_weights=str(weights),court_weights=str(weights),ball_weights=str(weights)))
    calls=[]
    def analyze(path, options):
        calls.append(options)
        r=result();r['provenance']['source']['sha256']=source_hash
        r['coverage']={'sample_stride':3,'ball_sample_stride':1}
        return SimpleNamespace(model_dump=lambda **kwargs:r)
    monkeypatch.setattr(pipeline,'analyze_video',analyze)
    monkeypatch.setattr(benchmark,'code_identity',lambda:('c'*40,'d'*64))
    monkeypatch.setattr(sys,'argv',['benchmark',str(tmp_path/'manifest.json'),'--source-id','a',
                                  '--ball-fps','30','--repeats','3','--output',str(tmp_path/'candidate.json')])
    benchmark.main()
    assert len(calls)==3 and all(o.ball_fps==30 and o.target_fps==10 for o in calls)
    for i in range(1,4):
        report=json.loads((tmp_path/f'candidate.run{i}.json').read_text())
        assert report['provenance']['sampling_settings']['effective_ball_fps']==30.
        assert report['provenance']['sampling_settings']['effective_player_fps']==10.
        assert report['provenance']['repeat_index']==i
        assert report['label_coverage']=='complete'
        assert (tmp_path/f'candidate.run{i}.result.json').exists()
    assert pipeline.AnalysisOptions().ball_fps==15.
