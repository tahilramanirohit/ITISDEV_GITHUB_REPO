import pytest
from picklepro import evaluate as module

def score(times, detections):
    assert hasattr(module, 'evaluate_precise'), 'strict scorer is not implemented'
    labels={'time_resolution_s':0.1,'shots':[{'t':t,'player':1,'type':'drive'} for t in times]}
    result={'metrics':{'shot_classification':{'value':{'shots':[
        {'time_seconds':t,'hitter_track_id':p,'shot_type':k} for t,p,k in detections]}}}}
    return module.evaluate_precise(result,labels)

def test_competing_events_maximize_pairs_before_timing_error():
    r=score([1.,1.3],[(.85,1,'drive'),(1.1,1,'drive')])
    assert r['matched']==2
    assert [(p['label_index'],p['detection_index']) for p in r['matches']]==[(0,0),(1,1)]

def test_equal_cardinality_minimizes_total_time_error():
    r=score([1.],[(.81,1,'drive'),(1.01,1,'drive')])
    assert r['matches'][0]['detection_index']==1
    assert r['timing_error_s']['mean_absolute']==pytest.approx(.01)

def test_attributes_cannot_change_matches():
    a=score([1.,1.3],[(.85,1,'drive'),(1.1,9,'lob')])
    b=score([1.,1.3],[(.85,9,'lob'),(1.1,1,'drive')])
    assert a['matches']==b['matches']
    assert a['per_class']['drive']['support']==2
    assert a['per_class']['drive']['f1']==pytest.approx(2/3)

def test_missed_false_positive_and_unknown_hitter_are_explicit():
    r=score([1.,3.],[(1.05,None,'unclassified'),(6.,2,'lob')])
    assert r['precision']==.5 and r['recall']==.5
    assert r['unmatched_label_indices']==[1] and r['unmatched_detection_indices']==[1]
    assert r['unknown_hitter_rate']==.5 and r['unclassified_rate']==.5
    assert r['confusion']['drive']['unclassified']==1
    assert r['confusion']['drive']['__missed__']==1
    assert r['per_class']['lob']['false_positive']==1

def test_empty_is_unavailable_not_perfect():
    r=score([],[])
    assert r['precision'] is None and r['recall'] is None
    assert r['timing_error_s']['mean_absolute'] is None
    assert r['macro_f1_eligible'] is None

@pytest.mark.parametrize('extra',[{'resolution_s':1.},{'draft':True},{'confirmed':False}])
def test_strict_rejects_coarse_or_unconfirmed(extra):
    assert hasattr(module,'evaluate_precise')
    lab={'time_resolution_s':.1,'shots':[{'t':1.,'player':1,'type':'drive',**extra}]}
    with pytest.raises(ValueError): module.evaluate_precise({},lab)

def test_inclusive_point_two_boundary_and_negative_times():
    assert score([1.],[(1.2,1,'drive')])['matched']==1
    with pytest.raises(ValueError): score([float('nan')],[])
    with pytest.raises(ValueError): score([-1.],[])
