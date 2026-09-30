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
