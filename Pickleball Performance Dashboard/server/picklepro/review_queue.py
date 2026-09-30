"""Generate a local frame-stepping review artifact; never confirm labels automatically."""
import argparse
import hashlib
import html
import json
import math
from pathlib import Path
import cv2


def review_entries(labels, fps, frame_count):
    entries=[]
    for index,label in enumerate(labels['shots']):
        if label['type']=='not_a_shot': continue
        resolution=label.get('resolution_s',labels.get('time_resolution_s',1.))
        entries.append({'id':f'contact-{index+1}', 'legacy_index':index,
                        'legacy_t':label['t'],'legacy_type':label['type'],
                        'legacy_player':label.get('player'), 'legacy_resolution_s':resolution,
                        'start_frame':max(0,math.floor((label['t']-.35)*fps)),
                        'end_frame':min(frame_count-1,math.ceil((label['t']+resolution+.35)*fps)),
                        'confirmed':False})
    return entries


def build(video, labels_path, output):
    video, labels_path, output=Path(video),Path(labels_path),Path(output)
    labels=json.loads(labels_path.read_text())
    digest=hashlib.file_digest(video.open('rb'),'sha256').hexdigest()
    capture=cv2.VideoCapture(str(video))
    if not capture.isOpened(): raise ValueError('Cannot open source recording')
    fps=capture.get(cv2.CAP_PROP_FPS)
    count=int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps<=0 or count<=0: raise ValueError('Source FPS/frame count unavailable')
    entries=review_entries(labels,fps,count)
    output.mkdir(parents=True,exist_ok=True)
    (output/'frames').mkdir(exist_ok=True)
    frames={}
    needed=sorted({f for entry in entries for f in range(entry['start_frame'],entry['end_frame']+1)})
    # Decode in original sequence; retain source frame index and decoder timestamp.
    needed_set=set(needed)
    for index in range(max(needed)+1 if needed else 0):
        ok,image=capture.read()
        if not ok: raise ValueError(f'Cannot decode source frame {index}')
        if index not in needed_set: continue
        timestamp=capture.get(cv2.CAP_PROP_POS_MSEC)/1000
        path=f'frames/{index:06d}.jpg'
        width=960
        resized=cv2.resize(image,(width,round(image.shape[0]*width/image.shape[1])))
        if not cv2.imwrite(str(output/path),resized,[cv2.IMWRITE_JPEG_QUALITY,82]): raise OSError(path)
        frames[str(index)]={'path':path,'t':timestamp,'frame_index':index}
    capture.release()
    queue={'source_id':labels.get('source_id', video.stem),'recording_sha256':digest,'video':video.name,
           'original_fps':fps,'label_version':'review-v2-1','identity_scheme':'human',
           'time_resolution_s':1/fps,'entries':entries,'frames':frames,
           'legacy_negative_count':sum(l['type']=='not_a_shot' for l in labels['shots'])}
    (output/'queue.json').write_text(json.dumps(queue,indent=2))
    template=Path(__file__).with_name('review_queue.html').read_text()
    payload=json.dumps(queue).replace('<','\\u003c')
    (output/'index.html').write_text(template.replace('__QUEUE_DATA__',payload))
    return queue


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('video');p.add_argument('labels');p.add_argument('output')
    a=p.parse_args();q=build(a.video,a.labels,a.output)
    print(f"Prepared {len(q['entries'])} unconfirmed contacts: {Path(a.output)/'index.html'}")

if __name__=='__main__': main()
