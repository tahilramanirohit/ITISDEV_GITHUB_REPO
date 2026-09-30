from copy import deepcopy
import pytest
from picklepro.sampling_gate import compare_runs


def run(fps, recall=.7, precision=.8, runtime=10):
    return {'benchmark_version':'v2-1','partition':'development','source_id':'dev',
            'recording_sha256':'a'*64,'label_version':'v1','labels_sha256':'b'*64,
            'label_coverage':'complete','scorer_version':'contacts-0.2s-optimal-v1',
            'split_manifest':[{'source_id':'dev','partition':'development'}],
            'provenance':{'code_revision':'c'*40,'working_tree_sha256':'d'*64,
                          'checkpoint_hashes':{'ball':'e'*64},'hardware':'mac',
                          'sampling_settings':{'ball_fps':fps,'target_fps':10,'original_fps':30},
                          'analysis_options':{'ball_fps':fps,'target_fps':10,'detector':'yolo'},'runtime_s':runtime},
            'scores':{'labelled_shots':100,'recall':recall,'precision':precision}}


def copies(r):
    rows=[deepcopy(r) for _ in range(3)]
    for i,row in enumerate(rows,1):row['provenance']['repeat_index']=i
    return rows


def test_exact_thresholds_pass_and_median_runtime_used():
    base=copies(run(15));candidate=copies(run(30,.75,.78,22))
    candidate[0]['provenance']['runtime_s']=100
    result=compare_runs(base,candidate)
    assert result['promote'] is True
    assert result['runtime_ratio']==2.2
    assert result['decision']=='eligible for development selection; no default change'


@pytest.mark.parametrize('metric,value',[('recall',.749),('precision',.779)])
def test_score_gate_failure_retains_baseline(metric,value):
    candidate=copies(run(30,.76,.8));candidate[1]['scores'][metric]=value
    assert compare_runs(copies(run(15)),candidate)['promote'] is False


def test_runtime_failure_retains_baseline():
    assert not compare_runs(copies(run(15)),copies(run(30,.8,.8,22.01)))['promote']


@pytest.mark.parametrize('key,value',[('partition','evaluation'),('label_coverage','partial'),
    ('labels_sha256','changed'),('scorer_version','legacy'),('split_manifest',[])])
def test_incompatible_evidence_cannot_promote(key,value):
    candidate=copies(run(30,.8,.8));candidate[0][key]=value
    assert not compare_runs(copies(run(15)),candidate)['promote']


@pytest.mark.parametrize('key,value',[('hardware','different'),('checkpoint_hashes',{'ball':'f'*64}),
    ('analysis_options',{'ball_fps':30,'target_fps':20,'detector':'yolo'})])
def test_incompatible_runtime_models_or_player_sampling_rejected(key,value):
    candidate=copies(run(30,.8,.8));candidate[0]['provenance'][key]=value
    assert not compare_runs(copies(run(15)),candidate)['promote']


def test_three_runs_required_and_null_or_nan_score_rejected():
    assert not compare_runs([run(15)],copies(run(30,.8,.8)))['promote']
    for bad in (None,float('nan')):
        candidate=copies(run(30,.8,.8));candidate[0]['scores']['recall']=bad
        assert not compare_runs(copies(run(15)),candidate)['promote']


def test_same_run_cannot_be_counted_three_times():
    base=copies(run(15));candidate=copies(run(30,.8,.8))
    candidate[1]=deepcopy(candidate[0])
    assert not compare_runs(base,candidate)['promote']
