from picklepro import review_queue

def test_coarse_contacts_become_unconfirmed_review_items():
    labels={'time_resolution_s':1.,'shots':[{'t':18,'type':'drop','player':2},
        {'t':18,'type':'volley','player':3},{'t':5,'type':'not_a_shot','player':2}]}
    entries=review_queue.review_entries(labels,30.,1500)
    assert len(entries)==2
    assert entries[0]['confirmed'] is False and entries[1]['confirmed'] is False
    assert entries[0]['legacy_resolution_s']==1.
    assert entries[0]['start_frame']==529
    assert entries[0]['end_frame']==581
    assert entries[0]['legacy_player']==2
    assert entries[1]['legacy_player']==3
