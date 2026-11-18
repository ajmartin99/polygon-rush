"""
Beat maps for Polygon Rush's recorded music.

Listens to each track and writes the time of every beat as it really is in
the audio (not an ideal fixed-tempo grid), how strong each beat hits, where
the bars start and how loud each beat's surroundings are. The game charts
its jumps on these beats, so a press on the beat you hear clears the
obstacle. Like a rhythm game's chart, but made from the drums of the song.

    pip install librosa
    python3 tools/beatmap/analyze.py            # all tracks -> src/data/beatmaps.json
    python3 tools/beatmap/analyze.py --report   # also compare with the old fixed grids

Reads track metadata (file, bpm hint) from src/core/tracks.ts.
"""
import json
import re
import sys
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MUSIC = ROOT / "public" / "music"
OUT = ROOT / "src" / "data" / "beatmaps.json"
SR = 22050
HOP = 128  # ~5.8 ms per frame: fine enough for beat timing


def track_list():
    """(file, bpm, offset) for every recorded track in tracks.ts."""
    src = (ROOT / "src" / "core" / "tracks.ts").read_text()
    out = []
    for m in re.finditer(r"file: '([^']+\.mp3)'[^}]*?bpm: ([\d.]+),\s*offset: ([\d.]+)", src, re.S):
        out.append((m.group(1), float(m.group(2)), float(m.group(3))))
    return out


def norm(x):
    hi = np.percentile(x, 95) or 1.0
    return np.clip(x / hi, 0, 1)


def analyze(path: Path, bpm_hint: float):
    y, sr = librosa.load(str(path), sr=SR, mono=True)
    dur = len(y) / sr
    _, perc = librosa.effects.hpss(y)
    # Onset strength from the drums (percussive part), and a low band for kicks.
    env = librosa.onset.onset_strength(y=perc, sr=sr, hop_length=HOP)
    S = np.abs(librosa.stft(perc, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low = S[freqs < 160].sum(axis=0)
    kick = np.maximum(0, np.diff(low, prepend=low[:1]))
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    times = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=HOP)

    # The tempo the track was tagged with can be half/double what the drums say: pick the one the
    # beat tracker agrees with best, then track beats tightly around it (follows slow drift).
    best = None
    for start in (bpm_hint, bpm_hint * 2, bpm_hint / 2):
        if not 55 <= start <= 210:
            continue
        tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, start_bpm=start, tightness=300, units="time", trim=False)
        if len(beats) < 8:
            continue
        ib = np.diff(beats)
        med = np.median(ib)
        steady = np.mean(np.abs(ib - med) < 0.08 * med)
        hit = np.mean([env[max(0, int(b * sr / HOP) - 4) : int(b * sr / HOP) + 5].max() for b in beats])
        score = steady * hit
        # Prefer the tagged tempo when scores are close (it's what the music director expects).
        if start == bpm_hint:
            score *= 1.15
        if best is None or score > best[0]:
            best = (score, beats, med)
    _, beats, med = best

    # Snap each beat to the nearest drum onset peak within +-35 ms (librosa beats sit on frame centres).
    win = int(0.035 * sr / HOP)
    snapped = []
    for b in beats:
        f = int(round(b * sr / HOP))
        a, z = max(0, f - win), min(len(env), f + win + 1)
        seg = env[a:z]
        k = a + int(np.argmax(seg))
        snapped.append(times[k] if seg.max() > np.median(env) * 1.5 else b)
    beats = np.array(snapped)

    # Clean up: a gap of ~2 beats gets the missing beat; doubled-up beats are dropped.
    clean = [beats[0]]
    for b in beats[1:]:
        gap = b - clean[-1]
        if gap < 0.6 * med:
            continue
        n = int(round(gap / med))
        for i in range(1, n):
            clean.append(clean[-1] + gap / n)
        clean.append(b)
    beats = np.array(clean)

    # Smooth the timing a little (local tempo from neighbours) without losing real drift.
    sm = beats.copy()
    for i in range(len(beats)):
        a, z = max(0, i - 4), min(len(beats), i + 5)
        k = np.arange(a, z)
        p = np.polyfit(k, beats[a:z], 1)
        sm[i] = 0.5 * beats[i] + 0.5 * np.polyval(p, i)
    beats = sm

    # Extend back to the start and on to the end with the local tempo (intros and outros are often drumless).
    while beats[0] - med > -0.02:
        beats = np.insert(beats, 0, beats[0] - (beats[1] - beats[0]))
    while beats[-1] + med < dur:
        beats = np.append(beats, beats[-1] + (beats[-1] - beats[-2]))
    beats = beats[beats >= 0]

    def at(sig, t, w=0.03):
        f = int(round(t * sr / HOP))
        r = int(w * sr / HOP)
        a, z = max(0, f - r), min(len(sig), f + r + 1)
        return float(sig[a:z].max()) if z > a else 0.0

    def kick_ratio(bs):
        mids = (bs[:-1] + bs[1:]) / 2
        on = np.mean([at(kick, t) for t in bs])
        off = np.mean([at(kick, t) for t in mids])
        return on / max(off, 1e-9)

    # The tracker sometimes follows the off-beat (hi-hats, claps): if the kicks land between
    # our beats, the real beat is half a beat later.
    if kick_ratio(beats) < 0.8:
        beats = (beats[:-1] + beats[1:]) / 2
    # Counted at half speed (a slow pulse under a fast song): split every beat in two.
    if 60 / np.median(np.diff(beats)) < 88:
        beats = np.sort(np.concatenate([beats, (beats[:-1] + beats[1:]) / 2]))
        if kick_ratio(beats) < 0.8:
            beats = (beats[:-1] + beats[1:]) / 2
    while beats[0] - np.median(np.diff(beats)) > -0.02:
        beats = np.insert(beats, 0, beats[0] - (beats[1] - beats[0]))
    beats = beats[beats >= 0]

    # Ticks: every beat and every half-beat, each scored by how hard the drums hit there.
    # The game's charts put taps on the strongest ticks, like a rhythm game's note chart.
    mids = (beats[:-1] + beats[1:]) / 2
    ticks = np.sort(np.concatenate([beats, mids]))
    onset = norm(np.array([at(env, t) for t in ticks]))
    kk = norm(np.array([at(kick, t) for t in ticks]))
    energy = norm(np.array([at(rms, t, 0.15) for t in ticks]))
    # Sharp drum attacks are what you hear (and jump to); a deep bass thump with no attack counts less.
    score = np.clip(0.65 * onset + 0.35 * kk, 0, 1)
    onbeat = np.isin(ticks, beats)

    # Bar lines: the beat (mod 4) with the strongest hits you hear (sharp attacks first, then kick).
    bs = score[onbeat]
    phase = int(np.argmax([bs[p::4].mean() for p in range(4)]))

    peak = np.median(env) * 2
    conf = float(np.mean([at(env, t, 0.04) > peak for t in beats]))
    return {
        "duration": round(dur, 3),
        "bpm": round(60 / float(np.median(np.diff(beats))), 2),
        "downbeat": phase,
        "confidence": round(conf, 2),
        "kickRatio": round(float(kick_ratio(beats)), 2),
        "beats": [round(float(t), 3) for t in beats],
        "ticks": [round(float(t), 3) for t in ticks],
        "score": [round(float(v), 2) for v in score],
        "onbeat": [int(v) for v in onbeat],
        "energy": [round(float(v), 2) for v in energy],
    }


def encode(m):
    """Compact form for the game: times as millisecond steps, scores and energy as digits 0-9."""
    def deltas(ts):
        out, prev = [], 0
        for t in ts:
            ms = int(round(t * 1000))
            out.append(ms - prev)
            prev = ms
        return out
    digit = lambda xs: "".join(str(min(9, int(v * 10))) for v in xs)
    return {
        "bpm": m["bpm"],
        "duration": m["duration"],
        "downbeat": m["downbeat"],
        "beats": deltas(m["beats"]),
        "ticks": deltas(m["ticks"]),
        "score": digit(m["score"]),
        "energy": digit(m["energy"]),
    }


def grid_error(m, bpm, offset):
    """How far the old fixed grid drifts from the real beats (ms)."""
    beats = np.array(m["beats"])
    unit = 60 / bpm
    # The old grid may count every other beat or twice per beat: compare at the map's own tempo.
    ratio = m["bpm"] / bpm
    if abs(ratio - 2) < 0.15:
        unit /= 2
    elif abs(ratio - 0.5) < 0.08:
        unit *= 2
    k = np.round((beats - offset) / unit)
    err = np.abs(beats - (offset + k * unit))
    return float(np.mean(err) * 1000), float(np.max(err) * 1000), float(np.mean(err[-16:]) * 1000)


def main():
    report = "--report" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    maps = json.loads(OUT.read_text()) if OUT.exists() and only else {}
    for file, bpm, offset in track_list():
        if only and file not in only:
            continue
        m = analyze(MUSIC / file, bpm)
        maps[file] = encode(m)
        line = f"{file:32s} bpm {bpm:6.1f} -> {m['bpm']:6.2f}  beats {len(m['beats']):4d}  confidence {m['confidence']:.2f}  kicks on/off {m['kickRatio']:.2f}"
        if report:
            mean, mx, end = grid_error(m, bpm, offset)
            line += f"  old grid: mean {mean:5.0f} ms, max {mx:5.0f} ms, at the end {end:5.0f} ms"
        print(line, flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(maps, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
