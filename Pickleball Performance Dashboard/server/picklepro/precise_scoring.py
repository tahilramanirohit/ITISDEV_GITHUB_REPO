"""Fixed strict contact protocol. Matching sees only timestamps, never attributes."""
from collections import Counter, defaultdict
import math

SCORER_VERSION = 'contacts-0.2s-optimal-v1'
TOLERANCE_S = 0.2


def _time(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Event time must be finite and nonnegative')
    return float(value)


def optimal_pairs(label_times, detection_times):
    """Sorted 1-D absolute-distance matching admits an optimal non-crossing assignment.

    DP objective: maximize cardinality, then minimize total absolute error.
    Input indices are preserved. O(n*m) time/memory, with deterministic ties.
    """
    a = sorted(enumerate(label_times), key=lambda x: (x[1], x[0]))
    b = sorted(enumerate(detection_times), key=lambda x: (x[1], x[0]))
    n, m = len(a), len(b)
    scores = [[(0, 0.) for _ in range(m + 1)] for _ in range(n + 1)]
    moves = [bytearray(m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            options = [(scores[i-1][j], 1), (scores[i][j-1], 2)]
            error = abs(a[i-1][1] - b[j-1][1])
            if error <= TOLERANCE_S + 1e-12:
                count, cost = scores[i-1][j-1]
                options.append(((count+1, cost+error), 3))
            value, move = min(options, key=lambda item: (-item[0][0], item[0][1], -item[1]))
            scores[i][j], moves[i][j] = value, move
    pairs = []
    i, j = n, m
    while i and j:
        move = moves[i][j]
        if move == 3:
            pairs.append((a[i-1][0], b[j-1][0]))
            i, j = i-1, j-1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    return list(reversed(pairs))


def evaluate_precise(result, labels):
    all_labels = labels.get('shots', [])
    real = []
    real_indices = []
    for index, label in enumerate(all_labels):
        _time(label['t'])
        if label.get('draft') or label.get('confirmed') is False:
            raise ValueError('Strict evaluation rejects unconfirmed/draft labels')
        resolution = label.get('resolution_s', labels.get('time_resolution_s', 1.))
        if isinstance(resolution, bool) or not isinstance(resolution, (int, float)) or not 0 < resolution <= .1:
            raise ValueError('Strict evaluation requires precise labels; coarse labels must be reviewed')
        if label['type'] != 'not_a_shot':
            real.append(label)
            real_indices.append(index)
    detected = (result.get('metrics', {}).get('shot_classification', {}).get('value') or {}).get('shots', [])
    lt = [_time(l['t']) for l in real]
    dt = [_time(d['time_seconds']) for d in detected]
    pairs = optimal_pairs(lt, dt)
    used_l, used_d = {i for i,j in pairs}, {j for i,j in pairs}
    canonical = lambda k: {'third_shot_drop':'drop', 'third_shot_drive':'drive'}.get(k, k)
    confusion = defaultdict(Counter)
    for i,j in pairs: confusion[canonical(real[i]['type'])][canonical(detected[j]['shot_type'])] += 1
    for i,l in enumerate(real):
        if i not in used_l: confusion[canonical(l['type'])]['__missed__'] += 1
    for j,d in enumerate(detected):
        if j not in used_d: confusion['__spurious__'][canonical(d['shot_type'])] += 1
    classes = sorted({canonical(l['type']) for l in real} | {canonical(d['shot_type']) for d in detected})
    per_class = {}
    for k in classes:
        support = sum(canonical(l['type']) == k for l in real)
        predicted = sum(canonical(d['shot_type']) == k for d in detected)
        tp = confusion[k][k]
        fp, fn = predicted-tp, support-tp
        p, r = tp/predicted if predicted else None, tp/support if support else None
        per_class[k] = {'support':support, 'predicted':predicted, 'true_positive':tp,
                        'false_positive':fp, 'false_negative':fn, 'precision':p, 'recall':r,
                        'f1':2*tp/(2*tp+fp+fn) if support+predicted else None,
                        'eligible_for_macro_f1':support >= 20}
    eligible = [c['f1'] for c in per_class.values() if c['eligible_for_macro_f1']]
    errors = [abs(lt[i]-dt[j]) for i,j in pairs]
    mapping = labels.get('tracker_mapping') or {}
    if labels.get('identity_scheme') == 'human' and len(set(mapping.values())) != len(mapping):
        raise ValueError('Each human player must map to a different tracker ID')
    scored = []
    for i,j in pairs:
        person = real[i].get('player')
        expected = mapping.get(str(person)) if labels.get('identity_scheme') == 'human' else person
        if expected is not None: scored.append(detected[j].get('hitter_track_id') == expected)
    negatives = [l for l in all_labels if l['type'] == 'not_a_shot']
    return {'protocol':SCORER_VERSION, 'tolerance_s':TOLERANCE_S,
            'labelled_shots':len(real), 'detected_shots':len(detected), 'matched':len(pairs),
            'precision':len(pairs)/len(detected) if detected else None,
            'recall':len(pairs)/len(real) if real else None,
            'matches':[{'label_index':real_indices[i], 'detection_index':j} for i,j in pairs],
            'unmatched_label_indices':[real_indices[i] for i in range(len(real)) if i not in used_l],
            'unmatched_detection_indices':[j for j in range(len(detected)) if j not in used_d],
            'timing_error_s':{'mean_absolute':sum(errors)/len(errors) if errors else None,
                              'maximum_absolute':max(errors) if errors else None, 'absolute_errors':errors},
            'confusion':{k:dict(v) for k,v in confusion.items()}, 'per_class':per_class,
            'macro_f1_eligible':sum(eligible)/len(eligible) if eligible else None,
            'insufficient_support_classes':[k for k,c in per_class.items() if c['support'] < 20],
            'unclassified_rate':sum(d['shot_type']=='unclassified' for d in detected)/len(detected) if detected else None,
            'unknown_hitter_rate':sum(d.get('hitter_track_id') is None for d in detected)/len(detected) if detected else None,
            'unknown_label_hitter_rate':sum(l.get('player') is None for l in real)/len(real) if real else None,
            'hitter_labels_scored':len(scored), 'hitter_accuracy':sum(scored)/len(scored) if scored else None,
            'detections_at_negative_moments':sum(any(abs(dt[j]-l['t']) <= TOLERANCE_S+1e-12 for l in negatives)
                                                for j in range(len(detected)) if j not in used_d)}
