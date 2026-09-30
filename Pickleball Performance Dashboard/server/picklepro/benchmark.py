"""Reproducible local benchmark. Tuning selects development data before accessing files."""
import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time
from .dataset import load_manifest, read_verified_labels, select_recordings, sha256
from .precise_scoring import evaluate_precise, SCORER_VERSION


def require_complete_contacts(labels):
    if labels.get('label_coverage') != 'complete':
        raise ValueError('Explicit complete-contact review coverage required; partial/hidden contacts cannot support full-recording scoring')


def build_benchmark(row,result,labels,metadata,manifest):
    for key in ('code_revision','working_tree_sha256','checkpoint_hashes','sampling_settings','runtime_s','hardware'):
        if not metadata.get(key) and metadata.get(key)!=0: raise ValueError(f'Missing benchmark provenance: {key}')
    checkpoints=metadata['checkpoint_hashes']
    if not isinstance(checkpoints,dict) or not checkpoints or any(
        not isinstance(v,str) or len(v)!=64 or any(c not in '0123456789abcdef' for c in v) for v in checkpoints.values()):
        raise ValueError('Exact checkpoint hashes are required')
    settings=metadata['sampling_settings']
    if not isinstance(settings,dict) or any(not isinstance(settings.get(k),(int,float)) or settings[k]<=0 for k in ('ball_fps','target_fps')):
        raise ValueError('Sampling settings are required')
    if result.get('provenance',{}).get('source',{}).get('sha256')!=row['sha256']: raise ValueError('Result source identity mismatch')
    if any(labels.get(k)!=row[r] for k,r in [('recording_sha256','sha256'),('original_fps','original_fps'),
        ('label_version','label_version'),('source_id','source_id')]): raise ValueError('Label identity mismatch')
    return {'benchmark_version':'v2-1','source_id':row['source_id'],'recording_sha256':row['sha256'],
            'partition':row['partition'],'consent_status':row['consent_status'],
            'label_coverage':labels.get('label_coverage','unknown'),
            'scorer_version':SCORER_VERSION,'label_version':row['label_version'],
            'labels_sha256':hashlib.sha256(json.dumps(labels,sort_keys=True,allow_nan=False).encode()).hexdigest(),
            'split_manifest':manifest,'provenance':metadata,'scores':evaluate_precise(result,labels),
            'claim_status':('partial/unknown label coverage; not full-recording accuracy' if labels.get('label_coverage')!='complete'
                            else 'development only' if row['partition']=='development' else 'single-recording evidence; no generalization claim')}


def code_identity():
    server=Path(__file__).resolve().parents[1]
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=server,text=True).strip()
    digest=hashlib.sha256()
    for file in sorted((server/'picklepro').rglob('*')):
        if file.is_file() and file.suffix in {'.py','.html'}:
            digest.update(str(file.relative_to(server)).encode());digest.update(file.read_bytes())
    return revision,digest.hexdigest()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest');p.add_argument('--source-id',required=True)
    p.add_argument('--purpose',choices=['tuning','evaluation','final'],default='tuning')
    p.add_argument('--ball-fps',type=float,choices=[15,30],required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--repeats',type=int,choices=[1,3],default=1)
    a=p.parse_args()
    manifest_path=Path(a.manifest).resolve();rows=load_manifest(manifest_path)
    selected=select_recordings(rows,a.purpose,a.source_id)
    if len(selected)!=1:raise ValueError('Select one unique recording variant for benchmarking')
    row=selected[0]
    labels=read_verified_labels(row,manifest_path.parent)
    require_complete_contacts(labels)
    readiness=evaluate_precise({},labels)
    if not readiness['labelled_shots']: raise ValueError('Human-confirmed precise contact labels are required')
    from .models import resolve_models
    from .ball_detection import split_weights
    from .pipeline import AnalysisOptions, analyze_video
    models=resolve_models()
    if models.detector!='yolo' or not models.ball_weights or not models.court_weights or not models.yolo_weights:
        raise ValueError('Reviewed local player/court/ball YOLO checkpoints are required')
    checkpoints={'player':sha256(models.yolo_weights),'court':sha256(models.court_weights)}
    for i,path in enumerate(split_weights(models.ball_weights)):checkpoints[f'ball_{i}']=sha256(path)
    options=AnalysisOptions(detector='yolo',yolo_weights=models.yolo_weights,court_weights=models.court_weights,
                            ball_weights=models.ball_weights,ball_fps=a.ball_fps,target_fps=10.)
    revision,snapshot=code_identity()
    output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True)
    for repeat in range(1,a.repeats+1):
        start=time.perf_counter()
        result=analyze_video(manifest_path.parent/row['path'],options).model_dump(mode='json')
        elapsed=time.perf_counter()-start
        coverage=result['coverage']
        ball_stride=coverage.get('ball_sample_stride')
        player_stride=coverage['sample_stride']
        metadata={'code_revision':revision,'working_tree_sha256':snapshot,'checkpoint_hashes':checkpoints,
                  'sampling_settings':{'ball_fps':a.ball_fps,'target_fps':10.,'original_fps':row['original_fps'],
                                       'ball_sample_stride':ball_stride,'sample_stride':player_stride,
                                       'effective_ball_fps':row['original_fps']/ball_stride if ball_stride else None,
                                       'effective_player_fps':row['original_fps']/player_stride},
                  'analysis_options':asdict(options),'runtime_s':elapsed,'repeat_index':repeat,
                  'hardware':f'{platform.node()} / {platform.machine()} / {platform.platform()}'}
        report_path=output if a.repeats==1 else output.with_name(f'{output.stem}.run{repeat}{output.suffix}')
        report_path.with_suffix('.result.json').write_text(json.dumps(result,indent=2,allow_nan=False))
        report_path.write_text(json.dumps(build_benchmark(row,result,labels,metadata,rows),indent=2,allow_nan=False))
        print(report_path)

if __name__=='__main__': main()
