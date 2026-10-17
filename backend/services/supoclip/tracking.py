# SPDX-License-Identifier: AGPL-3.0-only
# Adapted from FujiwaraChoki/supoclip, commit c61076544365ef8b49ffe3210f8e12b25fb60b74.
# Original authors retain their copyrights. See THIRD_PARTY_NOTICES.md.
# Decupa adaptations: native SQLite storage, Windows-safe rendering, local fonts and jobs.
from pathlib import Path
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
def smooth_values(values: List[float], window: int = 15) -> List[float]:
    if not values:
        return []
    smoothed: List[float] = []
    half = window // 2
    for idx in range(len(values)):
        start = max(0, idx - half)
        end = min(len(values), idx + half + 1)
        smoothed.append(sum(values[start:end]) / (end - start))
    return smoothed

def compute_vertical_crop_dims(
    width: int, height: int, target_ratio: float = 9 / 16
) -> Tuple[int, int]:
    """Even-dimensioned 9:16 crop box that fits inside a source frame."""
    if width <= 0 or height <= 0:
        return width, height
    if width / height > target_ratio:
        crop_w = round_to_even(int(height * target_ratio))
        crop_h = round_to_even(height)
    else:
        crop_w = round_to_even(width)
        crop_h = round_to_even(int(width / target_ratio))
    return (
        max(2, min(crop_w, round_to_even(width))),
        max(2, min(crop_h, round_to_even(height))),
    )

def _open_face_detectors():
    """Initialise the YuNet (preferred) + Haar (fallback) face detectors.

    Returns (face_detector_or_None, haar). The YuNet wrapper also exposes a
    MediaPipe-style ``process``/``close`` so older call sites keep working.
    """
    return open_yunet_detector(), open_haar_cascade()

def _detect_dominant_face(frame_bgr, face_detector, haar) -> Optional[Tuple[float, float]]:
    """Return (center_x_fraction, area_fraction) of the dominant face, or None."""
    h, w = frame_bgr.shape[:2]
    frame_area = float(max(1, w * h))
    best: Optional[Tuple[float, float, float]] = None  # (score, cx, area_frac)

    if face_detector is not None:
        try:
            for fx, fy, fw, fh, conf in face_detector.detect(frame_bgr):
                score = fw * fh * conf
                if fw > 10 and fh > 10 and (best is None or score > best[0]):
                    best = (score, fx + fw / 2.0, (fw * fh) / frame_area)
        except Exception as exc:
            logger.debug("YuNet detection failed on frame: %s", exc)

    if best is None:
        try:
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            min_side = max(14, int(w * 0.04))
            faces = haar.detectMultiScale(
                gray,
                scaleFactor=1.2,  # coarser scale steps -> ~2x faster
                minNeighbors=3,
                minSize=(min_side, min_side),
                maxSize=(int(w * 0.7), int(h * 0.7)),
            )
            for (fx, fy, fw, fh) in faces:
                score = float(fw * fh)
                if best is None or score > best[0]:
                    best = (score, fx + fw / 2.0, (fw * fh) / frame_area)
        except Exception:
            pass

    if best is None:
        return None
    return best[1] / w, best[2]

def _scene_cuts_from_diffs(diffs: List[Tuple[float, float]]) -> List[float]:
    """Derive scene-cut timestamps from per-frame difference spikes."""
    if len(diffs) < 3:
        return []
    vals = [d for _, d in diffs]
    mean = sum(vals) / len(vals)
    std = (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5
    threshold = max(14.0, mean + 3.5 * std)
    cuts: List[float] = []
    for i, (t, d) in enumerate(diffs):
        if d <= threshold:
            continue
        if (i == 0 or d >= diffs[i - 1][1]) and (
            i == len(diffs) - 1 or d >= diffs[i + 1][1]
        ):
            cuts.append(t)
    return cuts

def analyze_vertical_clip(
    input_path: Path,
    *,
    sample_fps: float = 3.0,
    proc_width: int = 480,
) -> Tuple[List[Tuple[float, Optional[float], float]], List[float]]:
    """Fast single-pass clip analysis: face track + scene cuts in one decode.

    Replaces slow per-sample random seeks (and a separate scene-detect pass) with
    a single sequential ffmpeg decode at low fps/resolution, piped straight into
    lightweight face detection. Scene cuts come from frame differences computed
    in the same pass. Returns (track, scene_cuts) where track entries are
    (t, center_x_in_source_px or None, area_frac).
    """
    width, height = ffprobe_video_size(input_path)
    if width <= 0 or height <= 0:
        return [], []
    proc_w = round_to_even(min(proc_width, width))
    proc_h = round_to_even(max(2, int(round(proc_w * height / width))))
    frame_bytes = proc_w * proc_h * 3

    command = [
        "ffmpeg", "-v", "error", "-an", "-sn",
        "-i", str(input_path),
        "-vf", f"fps={sample_fps:.3f},scale={proc_w}:{proc_h}",
        "-pix_fmt", "bgr24", "-f", "rawvideo",
        "-threads", "0", "-",
    ]
    try:
        proc = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
    except Exception as exc:
        logger.warning("analyze_vertical_clip: ffmpeg spawn failed (%s)", exc)
        return [], []

    face_detector, haar = _open_face_detectors()
    track: List[Tuple[float, Optional[float], float]] = []
    diffs: List[Tuple[float, float]] = []
    prev_small = None
    idx = 0
    try:
        while True:
            raw = proc.stdout.read(frame_bytes)
            if not raw or len(raw) < frame_bytes:
                break
            frame = np.frombuffer(raw, dtype=np.uint8).reshape(proc_h, proc_w, 3)
            t = idx / sample_fps
            face = _detect_dominant_face(frame, face_detector, haar)
            if face is None:
                track.append((t, None, 0.0))
            else:
                cx_frac, area = face
                track.append((t, cx_frac * width, area))
            small = cv2.resize(frame, (32, 18)).astype(np.int16)
            if prev_small is not None:
                diffs.append((t, float(np.mean(np.abs(small - prev_small)))))
            prev_small = small
            idx += 1
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass
        proc.wait()

    return track, _scene_cuts_from_diffs(diffs)

def _median_filter(values: List[float], window: int = 3) -> List[float]:
    """Small median filter to remove single-frame detection spikes."""
    if window <= 1 or len(values) < window:
        return list(values)
    half = window // 2
    out: List[float] = []
    for i in range(len(values)):
        lo = max(0, i - half)
        hi = min(len(values), i + half + 1)
        seg = sorted(values[lo:hi])
        out.append(seg[len(seg) // 2])
    return out

def build_crop_trajectory(
    track: List[Tuple[float, Optional[float], float]],
    width: int,
    crop_w: int,
    *,
    deadzone_frac: float = 0.05,
    smooth_time: float = 0.9,
    max_pan_speed_frac: float = 0.4,
) -> List[Tuple[float, int]]:
    """Turn a raw face-centre track into a smooth, eased crop-x trajectory.

    Returns keyframes [(t, x)] for the crop's left edge. The motion is produced
    by a critically-damped spring (Unity-style SmoothDamp) easing toward a
    comfort-zone target, which gives natural ease-in/ease-out with no overshoot
    and no mechanical ramp-then-stop feel. A deadzone keeps the frame still for
    small head movements; a median pre-filter removes detection spikes. Returns
    [] when there isn't enough signal to track.
    """
    if not track:
        return []
    max_x = max(0, width - crop_w)
    if max_x <= 0:
        return []

    centers: List[Optional[float]] = [c for _, c, _ in track]
    times = [t for t, _, _ in track]
    detected = sum(1 for c in centers if c is not None)
    if detected < max(3, len(centers) // 5):
        return []  # too sparse to trust — caller falls back to a static crop

    # Gap-fill missing detections: forward fill, then back fill.
    last: Optional[float] = None
    for i in range(len(centers)):
        if centers[i] is None:
            centers[i] = last
        else:
            last = centers[i]
    last = None
    for i in range(len(centers) - 1, -1, -1):
        if centers[i] is None:
            centers[i] = last
        else:
            last = centers[i]
    if any(c is None for c in centers):
        return []

    desired = [min(max(c - crop_w / 2.0, 0.0), float(max_x)) for c in centers]
    desired = _median_filter(desired, window=3)

    deadzone = max(2.0, crop_w * deadzone_frac)
    max_speed = max(1.0, width * max_pan_speed_frac)
    smooth_time = max(0.05, smooth_time)
    omega = 2.0 / smooth_time

    # Comfort-zone target: a stable goal that only moves once the subject drifts
    # past the deadzone, so the spring isn't chasing sub-deadzone jitter.
    targets: List[float] = []
    anchor = desired[0]
    for d in desired:
        if d - anchor > deadzone:
            anchor = d - deadzone
        elif anchor - d > deadzone:
            anchor = d + deadzone
        targets.append(anchor)

    # Critically-damped spring toward the comfort-zone target.
    eased: List[float] = []
    cur = float(targets[0])
    vel = 0.0
    for i, tgt in enumerate(targets):
        dt = (times[i] - times[i - 1]) if i > 0 else 0.0
        if dt <= 0:
            eased.append(cur)
            continue
        x = omega * dt
        exp_factor = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
        change = cur - tgt
        max_change = max_speed * smooth_time
        change = max(-max_change, min(change, max_change))
        adj_target = cur - change
        temp = (vel + omega * change) * dt
        vel = (vel - omega * temp) * exp_factor
        out = adj_target + (change + temp) * exp_factor
        # Prevent overshoot past the target.
        if (tgt - cur > 0) == (out > tgt):
            out = tgt
            vel = (out - tgt) / dt
        cur = min(max(out, 0.0), float(max_x))
        eased.append(cur)

    # Final low-pass pass: removes residual velocity steps so the piecewise-
    # linear keyframes read as continuous, fluid motion.
    eased = smooth_values(eased, window=5)

    # Keep keyframes fine enough that linear interpolation tracks the smooth
    # curve without visible faceting.
    def simplify(tol: float) -> List[Tuple[float, int]]:
        keys: List[Tuple[float, int]] = [(0.0, int(round(eased[0])))]
        for i in range(1, len(eased)):
            if abs(eased[i] - keys[-1][1]) >= tol:
                keys.append((times[i], int(round(eased[i]))))
        if keys[-1][0] < times[-1]:
            keys.append((times[-1], int(round(eased[-1]))))
        return keys

    tol = max(1.5, crop_w * 0.006)
    keys = simplify(tol)
    while len(keys) > 90:
        tol *= 1.5
        keys = simplify(tol)

    if keys and keys[0][0] > 0.0:
        keys[0] = (0.0, keys[0][1])
    return keys

def trajectory_has_movement(keys: List[Tuple[float, int]], crop_w: int) -> bool:
    """Whether a trajectory pans enough to be worth a moving crop."""
    if len(keys) < 2:
        return False
    xs = [x for _, x in keys]
    return (max(xs) - min(xs)) >= max(8, crop_w * 0.04)

def build_smooth_pan_expression(keys: List[Tuple[float, int]]) -> str:
    """Piecewise-linear ffmpeg crop-x expression interpolating the keyframes.

    Commas are escaped for use inside a quoted filtergraph expression. The
    result is rounded to an even integer for clean chroma subsampling.
    """
    if not keys:
        return "0"
    if len(keys) == 1:
        return str(int(keys[0][1]))

    expr = str(int(keys[-1][1]))
    for i in range(len(keys) - 2, -1, -1):
        t0, x0 = keys[i]
        t1, x1 = keys[i + 1]
        span = max(1e-3, t1 - t0)
        lerp = f"({int(x0)}+({int(x1) - int(x0)})*(t-{t0:.3f})/{span:.3f})"
        expr = f"if(lt(t\\,{t1:.3f})\\,{lerp}\\,{expr})"
    return f"trunc(({expr})/2)*2"

def build_layout_plan(
    track: List[Tuple[float, Optional[float], float]],
    scene_cuts: List[float],
    duration: float,
) -> List[Dict[str, Any]]:
    """Classify a clip into 'face' (tracked crop) and 'fit' (full-frame) shots.

    Talking-head shots become a tracked crop; content shots (tweets, graphs,
    code — no real face) become a full-frame blurred-background fit so nothing
    is cropped off. Boundaries are debounced and snapped to scene cuts.
    """
    if duration <= 0 or not track:
        return [{"start": 0.0, "end": max(0.0, duration), "kind": "face"}]

    times = [t for t, _, _ in track]
    present = [
        1 if (c is not None and a >= FACE_PRESENCE_MIN_AREA) else 0
        for _, c, a in track
    ]

    # Classify by face-presence RATE over a window: a real talking shot has a
    # face in many frames (even if small/spotty); a content shot has ~none.
    diffs = [times[i] - times[i - 1] for i in range(1, len(times))]
    dt = sorted(diffs)[len(diffs) // 2] if diffs else 0.25
    half = max(1, int(round(FACE_RATE_WINDOW / 2.0 / max(dt, 0.05))))
    smoothed: List[int] = []
    for i in range(len(present)):
        seg = present[max(0, i - half) : min(len(present), i + half + 1)]
        rate = sum(seg) / len(seg)
        smoothed.append(1 if rate >= FACE_PRESENCE_RATE else 0)

    # Build runs of constant layout value.
    runs: List[List[float]] = []
    run_start, run_val = 0.0, smoothed[0]
    for i in range(1, len(times)):
        if smoothed[i] != run_val:
            runs.append([run_start, times[i], run_val])
            run_start, run_val = times[i], smoothed[i]
    runs.append([run_start, duration, run_val])

    def coalesce(rs: List[List[float]]) -> List[List[float]]:
        out = [rs[0][:]]
        for r in rs[1:]:
            if r[2] == out[-1][2]:
                out[-1][1] = r[1]
            else:
                out.append(r[:])
        return out

    # Merge any run shorter than the minimum layout duration (flip + coalesce).
    runs = coalesce(runs)
    changed = True
    while changed and len(runs) > 1:
        changed = False
        for r in runs:
            if r[1] - r[0] < MIN_LAYOUT_SECONDS:
                r[2] = 1 - r[2]
                changed = True
                break
        if changed:
            runs = coalesce(runs)

    # Snap internal boundaries to nearby scene cuts for clean switches.
    cuts = sorted(c for c in (scene_cuts or []) if 0.05 < c < duration - 0.05)
    for i in range(len(runs) - 1):
        boundary = runs[i][1]
        near = [c for c in cuts if abs(c - boundary) <= LAYOUT_SNAP_WINDOW]
        if not near:
            continue
        snapped = min(near, key=lambda c: abs(c - boundary))
        if runs[i][0] + 0.1 < snapped < runs[i + 1][1] - 0.1:
            runs[i][1] = snapped
            runs[i + 1][0] = snapped

    return [
        {"start": r[0], "end": r[1], "kind": "face" if r[2] == 1 else "fit"}
        for r in runs
    ]

def build_vertical_compositor_filter(
    crop_chain: str,
    face_intervals: List[Tuple[float, float]],
    fit_intervals: List[Tuple[float, float]],
    blur_sigma: int = 14,
) -> str:
    """filter_complex switching between a tracked face crop and a blurred-
    background full-frame fit over time. Produces a labelled [vout] stream.

    Layers: a blurred fill background (always), the face crop on top during face
    shots (covers the frame), and the centred full-frame fit during content
    shots (background shows around it).
    """
    def enable_expr(intervals: List[Tuple[float, float]]) -> str:
        if not intervals:
            return "0"
        return "+".join(
            f"between(t\\,{a:.3f}\\,{b:.3f})" for a, b in intervals
        )

    face_en = enable_expr(face_intervals)
    fit_en = enable_expr(fit_intervals)
    # Smooth Gaussian background: blur at half resolution (plenty of detail for a
    # heavy blur) with multiple passes for a true Gaussian falloff, then upscale
    # 2x with bilinear so there's no lanczos ringing/blockiness — a creamy blur.
    return (
        "[0:v]split=3[bgsrc][crsrc][ftsrc];"
        "[bgsrc]scale=540:960:force_original_aspect_ratio=increase,crop=540:960,"
        f"gblur=sigma={blur_sigma}:steps=2,scale=1080:1920:flags=bilinear,setsar=1[bg];"
        f"[crsrc]{crop_chain}[face];"
        "[ftsrc]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1[fit];"
        f"[bg][face]overlay=0:0:enable='{face_en}'[t1];"
        f"[t1][fit]overlay=(W-w)/2:(H-h)/2:enable='{fit_en}'[vout]"
    )

def filter_for_document(source, document):
    """Map original face samples onto the actual edited order before framing."""
    width,height=ffprobe_video_size(source)
    crop_w,crop_h=compute_vertical_crop_dims(width,height)
    if width/height <= 9/16:
        return 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1',False
    track,cuts=analyze_vertical_clip(source)
    mapped,mapped_cuts=[],[]
    cursor=0.0
    for segment in document.segments:
        selected=[(cursor+t-segment.start,cx,area) for t,cx,area in track if segment.start<=t<segment.end]
        if not selected:
            selected=[(cursor,None,0)]
        mapped.extend(selected)
        mapped_cuts.extend(cursor+c-segment.start for c in cuts if segment.start<c<segment.end)
        if cursor: mapped_cuts.append(cursor)
        cursor+=segment.end-segment.start
    plan=build_layout_plan(mapped,mapped_cuts,cursor)
    # Restart the spring at shot changes rather than pan across unrelated shots.
    keys=[]
    boundaries=sorted(set([0.0,*mapped_cuts,cursor]))
    for start,end in zip(boundaries,boundaries[1:]):
        shot=[(t-start,cx,area) for t,cx,area in mapped if start<=t<end]
        local=build_crop_trajectory(shot,width,crop_w)
        if local:
            keys.extend((start+t,x) for t,x in local)
    if not keys:
        keys=[(0,(width-crop_w)//2)]
    expression=build_smooth_pan_expression(keys)
    crop=f"crop={crop_w}:{crop_h}:x='{expression}':y=0,scale=1080:1920:flags=lanczos,setsar=1"
    fit=[(p['start'],p['end']) for p in plan if p['kind']=='fit']
    if not fit:return crop,False
    face=[(p['start'],p['end']) for p in plan if p['kind']=='face']
    chain=build_vertical_compositor_filter(crop,face,fit)
    return chain.replace('[0:v]','[video]').replace('[vout]','[framed]'),True
