"""Frozen Phase 2 development gate; reads benchmark JSON, never footage or weights."""
import argparse
import json
import math
from pathlib import Path
from statistics import median
from .precise_scoring import SCORER_VERSION

GATE_VERSION = 'sampling-15-30-v1'
RULE = {'recall_gain_min':.05,'precision_loss_max':.02,'runtime_ratio_max':2.2,'runs_per_configuration':3}


def number(value, lower, upper=float('inf')):
    return not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value) and lower<=value<=upper


def comparable_settings(settings):
    return {k:v for k,v in settings.items() if k not in {'ball_fps','ball_sample_stride','effective_ball_fps'}}


def compare_runs(baseline, candidate):
    report={'gate_version':GATE_VERSION,'rule':dict(RULE),'promote':False,'decision':'retain 15-FPS baseline',
            'reasons':[], 'scope':'development selection only; no generalization claim'}
    errors=report['reasons']
    if len(baseline)!=3 or len(candidate)!=3:
        errors.append('Exactly three full inference runs per configuration are required');return report
    reference=baseline[0]
    common=('benchmark_version','source_id','recording_sha256','label_version','labels_sha256','split_manifest')
    runs=baseline+candidate
    try:
        for index,r in enumerate(runs):
            if any(not r.get(k) or r[k]!=reference.get(k) for k in common):
                errors.append(f'Run {index+1}: incompatible recording, labels or split manifest')
            if r.get('partition')!='development' or r.get('label_coverage')!='complete' or r.get('scorer_version')!=SCORER_VERSION:
                errors.append(f'Run {index+1}: complete development labels and strict scorer required')
            p=r['provenance'];rp=reference['provenance'];fps=15 if index<3 else 30
            for key in ('checkpoint_hashes','hardware'):
                if not p.get(key) or p[key]!=rp.get(key):errors.append(f'Run {index+1}: incompatible {key}')
            if not p.get('code_revision') or not p.get('working_tree_sha256'):
                errors.append(f'Run {index+1}: missing code provenance')
            sampling=p['sampling_settings'];options=p['analysis_options']
            if sampling.get('ball_fps')!=fps or options.get('ball_fps')!=fps:
                errors.append(f'Run {index+1}: expected ball sampling {fps}')
            if (not number(sampling.get('original_fps'),.001) or sampling.get('target_fps')!=10
                or comparable_settings(sampling)!=comparable_settings(rp['sampling_settings'])
                or {k:v for k,v in options.items() if k!='ball_fps'}!={k:v for k,v in rp['analysis_options'].items() if k!='ball_fps'}):
                errors.append(f'Run {index+1}: incompatible sampling or analysis options')
            scores=r['scores']
            if (not number(scores.get('labelled_shots'),1) or scores['labelled_shots']!=reference['scores'].get('labelled_shots')
                or not number(scores.get('recall'),0,1) or not number(scores.get('precision'),0,1)
                or not number(p.get('runtime_s'),.000001)):
                errors.append(f'Run {index+1}: unavailable or invalid scores/runtime')
        # Retuned code may differ between configurations; repeats within one must not.
        for group in (baseline,candidate):
            if sorted(r['provenance'].get('repeat_index',0) for r in group)!=[1,2,3]:
                errors.append('Three distinct repeat indices (1, 2, 3) are required')
            for key in ('code_revision','working_tree_sha256'):
                if len({r['provenance'][key] for r in group})!=1:errors.append('Code changed within repeated runs')
    except (KeyError,TypeError,AttributeError):
        errors.append('Missing or malformed benchmark evidence')
    if errors:return report
    gain=min(r['scores']['recall'] for r in candidate)-max(r['scores']['recall'] for r in baseline)
    loss=max(r['scores']['precision'] for r in baseline)-min(r['scores']['precision'] for r in candidate)
    base_time=median(r['provenance']['runtime_s'] for r in baseline)
    candidate_time=median(r['provenance']['runtime_s'] for r in candidate)
    ratio=candidate_time/base_time
    report.update(recall_gain=gain,precision_loss=loss,runtime_ratio=ratio,
                  baseline_median_runtime_s=base_time,candidate_median_runtime_s=candidate_time,
                  code_provenance=[{'code_revision':r['provenance']['code_revision'],
                                   'working_tree_sha256':r['provenance']['working_tree_sha256']} for r in runs])
    if gain+1e-12<.05:errors.append('Recall gain below 5 percentage points')
    if loss>.02+1e-12:errors.append('Precision loss above 2 percentage points')
    if ratio>2.2+1e-12:errors.append('Median runtime above 2.2x baseline')
    if not errors:report.update(promote=True,decision='eligible for development selection; no default change')
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',nargs=3,required=True);parser.add_argument('--candidate',nargs=3,required=True)
    parser.add_argument('--output',required=True);args=parser.parse_args()
    load=lambda paths:[json.loads(Path(p).read_text()) for p in paths]
    report=compare_runs(load(args.baseline),load(args.candidate))
    report['input_files']={'baseline':args.baseline,'candidate':args.candidate}
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(report['decision']);print(output)

if __name__=='__main__':main()
