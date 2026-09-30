"""Lean source-recording manifest; partitions are validated before any video access."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

FIELDS = ['source_id','sha256','path','original_fps','duration_s','partition',
          'label_path','label_version','consent_status']
PARTITIONS = {'development','evaluation','final'}
CONSENT = {'unknown','confirmed','not_permitted'}


def sha256(path):
    with Path(path).open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()


def validate_manifest(rows):
    hashes, sources = set(), {}
    for row in rows:
        if not isinstance(row,dict) or set(FIELDS)-row.keys(): raise ValueError('Missing manifest fields')
        for key in ('source_id','path'):
            if not isinstance(row[key],str) or not row[key].strip(): raise ValueError(f'Invalid {key}')
        h=row['sha256']
        if not isinstance(h,str) or len(h)!=64 or any(c not in '0123456789abcdef' for c in h): raise ValueError('Invalid SHA-256')
        if h in hashes: raise ValueError('Duplicate recording hash')
        hashes.add(h)
        if row['partition'] not in PARTITIONS: raise ValueError('Invalid partition')
        if row['source_id'] in sources and sources[row['source_id']]!=row['partition']:
            raise ValueError('Source recording has conflicting splits')
        sources[row['source_id']]=row['partition']
        for key in ('original_fps','duration_s'):
            v=row[key]
            if isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v) or v<=0: raise ValueError(f'Invalid {key}')
        if row['consent_status'] not in CONSENT: raise ValueError('Invalid consent status')
        if row['label_path'] is not None and (not isinstance(row['label_path'],str) or not row['label_path'].strip()): raise ValueError('Invalid label path')
        if row['label_path'] is not None and (not isinstance(row['label_version'],str) or not row['label_version'].strip()): raise ValueError('Label version required')
    return rows


def load_manifest(path):
    path=Path(path)
    if path.suffix.lower()=='.csv':
        with path.open(newline='') as stream: rows=list(csv.DictReader(stream))
        for row in rows:
            for key in ('original_fps','duration_s'):row[key]=float(row[key])
            for key in ('label_path','label_version'):row[key]=row[key] or None
    else:
        data=json.loads(path.read_text());rows=data['recordings'] if isinstance(data,dict) else data
    if not isinstance(rows,list): raise ValueError('Manifest must contain a recordings list')
    return validate_manifest(rows)


def write_manifest(rows,path):
    validate_manifest(rows)
    path=Path(path)
    if path.suffix.lower()=='.csv':
        with path.open('w',newline='') as stream:
            writer=csv.DictWriter(stream,fieldnames=FIELDS);writer.writeheader();writer.writerows(rows)
    else: path.write_text(json.dumps({'manifest_version':'v2-1','recordings':rows},indent=2,allow_nan=False)+'\n')


def select_recordings(rows,purpose,source_id=None):
    validate_manifest(rows)
    if purpose not in {'tuning','evaluation','final'}: raise ValueError('Unknown purpose')
    partition='development' if purpose=='tuning' else purpose
    selected=[r for r in rows if r['partition']==partition and (source_id is None or r['source_id']==source_id)]
    if source_id and not selected: raise ValueError('Recording is absent or forbidden for this partition/purpose')
    if any(r['consent_status']=='not_permitted' for r in selected): raise ValueError('Recording not permitted')
    return selected


def read_verified_labels(row,base):
    base=Path(base)
    if not row['label_path']: raise ValueError('No labels for selected recording')
    labels=json.loads((base/row['label_path']).read_text())
    if (labels.get('recording_sha256')!=row['sha256'] or
        labels.get('original_fps')!=row['original_fps'] or
        labels.get('label_version')!=row['label_version'] or
        labels.get('source_id')!=row['source_id']):
        raise ValueError('Recording/label identity or version mismatch')
    if sha256(base/row['path'])!=row['sha256']: raise ValueError('Source video hash mismatch')
    return labels


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest')
    p.add_argument('--csv-out');a=p.parse_args();rows=load_manifest(a.manifest)
    if a.csv_out:write_manifest(rows,a.csv_out)
    print(f'Validated {len(rows)} recordings (metadata only; no video read).')

if __name__=='__main__':main()
