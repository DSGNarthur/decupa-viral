# SPDX-License-Identifier: AGPL-3.0-only
# Caption helpers adapted from FujiwaraChoki/supoclip at c6107654.
from pathlib import Path
import json
import subprocess
from backend.services.ffmpeg_service import ff_filter_path as _escape_filter_path
from backend.services.video_utils import ff_filter_path


def probe(path):
    result=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],capture_output=True,text=True,check=True,timeout=30)
    data=json.loads(result.stdout)
    video=next((s for s in data['streams'] if s['codec_type']=='video'),None)
    if not video:raise ValueError('O arquivo não tem uma faixa de vídeo válida.')
    return {'width':int(video['width']),'height':int(video['height']),'duration':float(data['format']['duration']),'audio':any(s['codec_type']=='audio' for s in data['streams'])}


def _ffprobe_size(path):
    data=probe(path)
    return data['width'],data['height']


def _ass_timestamp(seconds):
    seconds=max(0,float(seconds))
    hours=int(seconds//3600);minutes=int(seconds%3600//60)
    return f'{hours}:{minutes:02d}:{seconds-hours*3600-minutes*60:05.2f}'


def _ass_color(value):
    raw=value.lstrip('#')
    return f'&H00{raw[4:6]}{raw[2:4]}{raw[0:2]}&'


def _escape_ass_text(value):
    return value.replace('\\','\\\\').replace('{','\\{').replace('}','\\}')
