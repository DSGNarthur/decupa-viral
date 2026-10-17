"""Import the audited AGPL modules, keeping only dependency-free editor/media code."""
from pathlib import Path
import ast
import shutil

root=Path(__file__).resolve().parents[1]
upstream=root.parent/'Supoclip-Lab-20261017/source/backend/src'
target=root/'backend/services/supoclip'
target.mkdir(parents=True,exist_ok=True)
notice='''# SPDX-License-Identifier: AGPL-3.0-only
# Adapted from FujiwaraChoki/supoclip, commit c61076544365ef8b49ffe3210f8e12b25fb60b74.
# Original authors retain their copyrights. See THIRD_PARTY_NOTICES.md.
# Decupa adaptations: native SQLite storage, Windows-safe rendering, local fonts and jobs.
'''
(target/'__init__.py').write_text(notice,encoding='utf-8')
source=(upstream/'editor_document.py').read_text(encoding='utf-8')
tree=ast.parse(source)
names={'Model','Segment','Word','CaptionStyle','Framing','Effects','EditDocument','output_size','mapped_words','caption_groups','write_ass','run_render','render_document','atomic_json'}
parts=[ast.get_source_segment(source,node) for node in tree.body if isinstance(node,(ast.ClassDef,ast.FunctionDef)) and node.name in names]
code=notice+'''from __future__ import annotations
from pathlib import Path
from typing import Literal
import json, os, subprocess, time, uuid
from pydantic import BaseModel, ConfigDict, Field, model_validator
from backend.services.supoclip.support import (
    _ass_color, _ass_timestamp, _escape_ass_text, _escape_filter_path, _ffprobe_size,
)
'''+ '\n\n'.join(parts)+'\n'
code=code.replace('font: Literal["TikTokSans-Regular", "Poppins-ExtraBold", "THEBOLDFONT"] = (\n        "Poppins-ExtraBold"\n    )','font: Literal["Arial", "Arial Black", "DejaVu Sans"] = "Arial"')
code=code.replace('accent: str = Field(default="#FACC15"','accent: str = Field(default="#FFFFFF"')
code=code.replace('class Framing(Model):','class Framing(Model):\n    mode: Literal["manual", "face"] = "manual"')
code=code.replace('    from .clip_editor import _ass_color, _ass_timestamp, _escape_ass_text\n    from .font_registry import get_font_family_name, find_font_path\n','')
code=code.replace('    font_path = find_font_path(style.font)\n    font = (get_font_family_name(font_path) if font_path else None) or "Arial"','    font = style.font')
code=code.replace('    from .clip_editor import _ffprobe_size, _escape_filter_path\n    from .video_utils import ass_fonts_dir\n','    from backend.services.caption_service import EMOJI_FONT_DIR\n')
code=code.replace('    fonts = ass_fonts_dir(document.captions.font)','    fonts = EMOJI_FONT_DIR')
code=code.replace('    filters.append(\n        f"[video]{geometry},{effects},ass=', '    if framing.mode == "face" and framing.aspect == "vertical":\n        from .tracking import filter_for_document\n        geometry, complex_mode = filter_for_document(source, document)\n        if complex_mode:\n            filters.append(geometry)\n            geometry = "null"\n            video_label = "[framed]"\n        else:\n            video_label = "[video]"\n    else:\n        video_label = "[video]"\n    filters.append(\n        f"{video_label}{geometry},{effects},ass=')
code=code.replace('        "-filter_complex",','        "-filter_complex_threads", "1",\n        "-filter_complex",')
code=code.replace('        "-preset",\n        "fast",','        "-threads", "2",\n        "-preset",\n        "fast",')
code=code.replace('path.write_text(header + "".join(lines))','path.write_text(header + "".join(lines), encoding="utf-8")')
code=code.replace('log_path.open("w+")','log_path.open("w+", encoding="utf-8", errors="replace")')
code=code.replace('_escape_filter_path','ff_filter_path')
(target/'document.py').write_text(code,encoding='utf-8')

face=(upstream/'media/face_detection.py').read_text(encoding='utf-8')
face=face.replace('from .common import logger','import logging\nlogger = logging.getLogger(__name__)')
(target/'face_detection.py').write_text(notice+face,encoding='utf-8')
models=target/'models'
models.mkdir(exist_ok=True)
for f in (upstream/'media/models').iterdir():
    if f.is_file():shutil.copy2(f,models/f.name)

src=(upstream/'media/reframing.py').read_text(encoding='utf-8')
keep={'compute_vertical_crop_dims','_open_face_detectors','_detect_dominant_face','_scene_cuts_from_diffs','analyze_vertical_clip','_median_filter','build_crop_trajectory','trajectory_has_movement','build_smooth_pan_expression','build_layout_plan','smooth_values','build_vertical_compositor_filter'}
parts=[ast.get_source_segment(src,node) for node in ast.parse(src).body if isinstance(node,ast.FunctionDef) and node.name in keep]
tracking=notice+'''from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
import subprocess, logging
import cv2
import numpy as np
from .face_detection import open_yunet_detector, open_haar_cascade
from .support import _ffprobe_size as ffprobe_video_size
logger=logging.getLogger(__name__)
FACE_PRESENCE_MIN_AREA=0.002
FACE_RATE_WINDOW=2.0
FACE_PRESENCE_RATE=0.25
MIN_LAYOUT_SECONDS=1.5
LAYOUT_SNAP_WINDOW=0.6
def round_to_even(value): return max(2, int(round(value/2))*2)
'''+ '\n\n'.join(parts)+'\n'
adapter=(root/'scripts/tracking_adapter.txt').read_text(encoding='utf-8')
(target/'tracking.py').write_text(tracking+adapter,encoding='utf-8')
shutil.copy2(root.parent/'Supoclip-Lab-20261017/source/LICENSE',target/'LICENSE')
print('Audited Supoclip editor and face trajectory modules imported.')
