#!/usr/bin/env python3
"""
DR PHONE — "Kinetic Red" original soundtrack.

Bright, commercial, uplifting: plucky chords, warm bass, handclaps, I-V-vi-IV.
Written sample-by-sample to a 44.1 kHz 16-bit stereo WAV. No dependencies
beyond the standard library (numpy is not available in the build environment),
and no sampled or licensed material — every sound here is synthesised from
oscillators and noise, so the track is original and royalty-free.

The tempo is chosen so the music and the picture share one clock:

    120 BPM @ 30 fps  ->  beat = 15 frames = 0.5 s
                          bar  = 60 frames = 2.0 s
                          film = 21 bars   = 1260 frames = 42.000 s

Every scene cut in render-video.js lands on a downbeat because both files
derive their timing from the constants below.
"""

import math
import random
import struct
import wave
from pathlib import Path

# ---------------------------------------------------------------- the grid

SR = 44100          # sample rate
BPM = 120.0
BEATS_PER_BAR = 4
BARS = 21

SEC_PER_BEAT = 60.0 / BPM              # 0.5
SEC_PER_BAR = SEC_PER_BEAT * BEATS_PER_BAR   # 2.0
DURATION = BARS * SEC_PER_BAR          # 42.0
N = int(SR * DURATION)

random.seed(20260906)   # deterministic: the same track every render

# ---------------------------------------------------------------- harmony

def note(semitones_from_a4: float) -> float:
    return 440.0 * (2.0 ** (semitones_from_a4 / 12.0))

# I - V - vi - IV in C major, the uplifting standard.
# Voiced around the octave above middle C so the plucks stay bright.
PROGRESSION = [
    # (root semitones from A4, chord tones)
    (3,   [3, 7, 10]),    # C  major   C  E  G
    (10,  [10, 14, 17]),  # G  major   G  B  D
    (0,   [0, 3, 7]),     # A  minor   A  C  E
    (8,   [8, 12, 15]),   # F  major   F  A  C
]

def chord_at_bar(bar: int):
    """Bars advance the progression one chord per bar, looping every four."""
    return PROGRESSION[bar % len(PROGRESSION)]

# ---------------------------------------------------------------- buffers

left = [0.0] * N
right = [0.0] * N

def add(buf_l, buf_r, start_sample: int, samples_l, samples_r=None):
    """Mix a mono/stereo voice into the master at a sample offset."""
    if samples_r is None:
        samples_r = samples_l
    end = min(N, start_sample + len(samples_l))
    if start_sample >= N:
        return
    for i in range(max(0, -start_sample), end - start_sample):
        buf_l[start_sample + i] += samples_l[i]
        buf_r[start_sample + i] += samples_r[i]

def at(beat: float) -> int:
    """Absolute beat number -> sample index."""
    return int(beat * SEC_PER_BEAT * SR)

# ---------------------------------------------------------------- voices

def kick(gain=1.0):
    """Sine sweep 120 -> 45 Hz with a fast exponential decay, plus a click."""
    dur = 0.34
    n = int(SR * dur)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 45.0 + (120.0 - 45.0) * math.exp(-t * 32.0)
        phase += 2.0 * math.pi * f / SR
        env = math.exp(-t * 9.0)
        click = math.exp(-t * 420.0) * 0.5
        out[i] = (math.sin(phase) * env + click) * gain
    return out

def clap(gain=0.5):
    """Three short noise bursts (the classic 'clap' smear) then a tail."""
    dur = 0.30
    n = int(SR * dur)
    out = [0.0] * n
    bursts = [0.0, 0.011, 0.022]
    lp = 0.0
    for i in range(n):
        t = i / SR
        env = 0.0
        for b in bursts:
            if t >= b:
                env += math.exp(-(t - b) * 190.0)
        env += math.exp(-t * 14.0) * 0.35        # body tail
        noise = random.uniform(-1.0, 1.0)
        # band-pass-ish: high-passed by differencing, then gently smoothed
        lp += (noise - lp) * 0.55
        out[i] = (noise - lp) * env * gain
    return out

def hat(gain=0.22, dur=0.045, bright=0.85):
    """High-passed noise with a very fast decay."""
    n = int(SR * dur)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        noise = random.uniform(-1.0, 1.0)
        lp += (noise - lp) * bright
        out[i] = (noise - lp) * math.exp(-t * 95.0) * gain
    return out

def bass(freq, dur, gain=0.5):
    """Saw through a one-pole lowpass — warm, round, sits under the chords."""
    n = int(SR * dur)
    out = [0.0] * n
    phase = 0.0
    lp = 0.0
    inc = freq / SR
    for i in range(n):
        t = i / SR
        phase = (phase + inc) % 1.0
        saw = 2.0 * phase - 1.0
        sub = math.sin(2.0 * math.pi * phase)      # sub-octave body
        raw = saw * 0.55 + sub * 0.7
        cutoff = 0.10 + 0.16 * math.exp(-t * 7.0)  # slight filter movement
        lp += (raw - lp) * cutoff
        env = min(1.0, t * 260.0) * math.exp(-t * 2.6)
        out[i] = lp * env * gain
    return out

def pluck(freq, dur, gain=0.30, detune=1.0):
    """Additive sine stack, fast attack / medium decay — the bright hook."""
    n = int(SR * dur)
    out = [0.0] * n
    partials = [(1.0, 1.0), (2.0, 0.42), (3.0, 0.20), (4.0, 0.10), (6.0, 0.05)]
    for i in range(n):
        t = i / SR
        env = min(1.0, t * 700.0) * math.exp(-t * 5.2)
        s = 0.0
        for mult, amp in partials:
            s += math.sin(2.0 * math.pi * freq * mult * detune * t) * amp
            # higher partials decay faster — makes it read as a pluck
            amp_decay = math.exp(-t * mult * 1.1)
            s *= 1.0 if mult == 1.0 else amp_decay
        out[i] = s * env * gain * 0.35
    return out

def riser(dur, gain=0.30):
    """Noise + rising sine sweeping up into a drop."""
    n = int(SR * dur)
    out = [0.0] * n
    phase = 0.0
    lp = 0.0
    for i in range(n):
        t = i / SR
        p = t / dur
        f = 200.0 * (2.0 ** (p * 3.6))
        phase += 2.0 * math.pi * f / SR
        noise = random.uniform(-1.0, 1.0)
        lp += (noise - lp) * (0.10 + 0.7 * p)
        env = p ** 1.6
        out[i] = (math.sin(phase) * 0.5 + (noise - lp) * 0.8) * env * gain
    return out

def crash(gain=0.34):
    """Bright noise wash for downbeat accents."""
    dur = 1.5
    n = int(SR * dur)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        noise = random.uniform(-1.0, 1.0)
        lp += (noise - lp) * 0.75
        out[i] = (noise - lp) * math.exp(-t * 3.1) * gain
    return out

# ---------------------------------------------------------------- arrangement
#
# Bars 1-2   intro       chords only, riser
# Bars 3-5   beat enters kick + clap + plucks       (type slams, one per bar)
# Bars 6-7   build       + hats + bass              (the counters)
# Bars 8-11  full groove                            (grid assembly)
# Bars 12-14 lift        + extra percussion         (category strobe)
# Bars 15-16 riser       filter sweep up
# Bar  17    DROP        crash + full band          (the "60" lands here)
# Bars 18-19 sustain                                (dashboard)
# Bars 20-21 outro       final hit, chords ring out (logo)

# Per-bar energy (0-based bar index -> multiplier). A flat arrangement reads as
# boring no matter how good the sounds are, so the level genuinely moves:
# a present intro, a light first section, a build, tension before the drop,
# then the drop as the loudest point in the track.
ENERGY = {
    0: 0.45, 1: 0.52,                       # intro: chords + riser only
    2: 0.62, 3: 0.66, 4: 0.70,              # beat enters, still light
    5: 0.78, 6: 0.84,                       # hats + bass join
    7: 0.92, 8: 0.94, 9: 0.96, 10: 0.98,    # full groove
    11: 1.00, 12: 1.02, 13: 1.04,           # lift
    14: 1.00, 15: 0.86,                     # build, then thin out for tension
    16: 1.15,                               # THE DROP - loudest bar
    17: 1.08, 18: 1.06,                     # sustain
    19: 1.02, 20: 0.72,                     # outro, ringing out
}

def build():
    for bar in range(BARS):
        bar_beat = bar * BEATS_PER_BAR
        root_semi, tones = chord_at_bar(bar)
        e = ENERGY.get(bar, 1.0)

        drums_on = 2 <= bar <= 20
        hats_on = 5 <= bar <= 20
        bass_on = 5 <= bar <= 20
        full = 7 <= bar <= 20
        # Classic build: pull the kick out for the second half of the bar before
        # the drop. The absence is what makes bar 17 hit.
        kick_gap = (bar == 15)

        # --- kick: four on the floor once the beat enters
        if drums_on:
            for b in range(BEATS_PER_BAR):
                if kick_gap and b >= 2:
                    continue          # tension: no kick under the riser's peak
                add(left, right, at(bar_beat + b), kick((1.0 if full else 0.85) * e))

        # --- clap on 2 and 4, spread slightly across the stereo field
        if drums_on:
            for b in (1, 3):
                c = clap((0.55 if full else 0.42) * e)
                add(left, right, at(bar_beat + b),
                    [s * 0.92 for s in c], [s * 1.0 for s in c])

        # --- hats: 8ths, with 16th rolls in the two bars before the drop
        if hats_on:
            step = 0.5
            b = 0.0
            while b < BEATS_PER_BAR:
                accent = (0.26 if abs(b - round(b)) < 1e-6 else 0.17) * e
                add(left, right, at(bar_beat + b), hat(accent))
                b += step
            if bar in (15, 16):
                b = 0.0
                while b < BEATS_PER_BAR:
                    add(left, right, at(bar_beat + b), hat(0.13 * e, dur=0.03))
                    b += 0.25

        # --- bass: root on the downbeat plus an off-beat push
        if bass_on:
            f = note(root_semi - 24)        # two octaves down
            add(left, right, at(bar_beat), bass(f, SEC_PER_BEAT * 1.6, 0.55 * e))
            add(left, right, at(bar_beat + 2), bass(f, SEC_PER_BEAT * 0.9, 0.42 * e))
            add(left, right, at(bar_beat + 3.5), bass(note(root_semi - 12),
                                                      SEC_PER_BEAT * 0.5, 0.30 * e))

        # --- plucky chords: arpeggiated 8ths, brighter once the track opens up
        # Bars 1-2 carry the intro alone, so they are NOT scaled down by the
        # energy curve — a near-silent opening loses the viewer immediately.
        arp_gain = 0.78 if bar < 2 else (0.34 if full else 0.29) * e
        pattern = [0, 1, 2, 1, 0, 2, 1, 2]
        for k, idx in enumerate(pattern):
            beat_pos = k * 0.5
            semi = tones[idx % len(tones)]
            f = note(semi)
            # slight stereo width by detuning the two sides a hair
            l = pluck(f, 0.55, arp_gain, detune=0.999)
            r = pluck(f, 0.55, arp_gain, detune=1.001)
            add(left, right, at(bar_beat + beat_pos), l, r)

        # --- pad-ish sustained chord on the downbeat, low in the mix
        if bar >= 2:
            for semi in tones:
                add(left, right, at(bar_beat),
                    pluck(note(semi - 12), SEC_PER_BAR * 0.95, 0.09 * e))

        # --- crashes on structural downbeats
        if bar in (2, 7, 11, 16, 19):
            add(left, right, at(bar_beat), crash(0.30 * (1.5 if bar == 16 else 1.0)))

    # --- intro pad so bars 1-2 are audible rather than near-silence
    for bar in (0, 1):
        root_semi, tones = chord_at_bar(bar)
        for semi in tones:
            add(left, right, at(bar * BEATS_PER_BAR),
                pluck(note(semi - 12), SEC_PER_BAR * 1.4, 0.40))
            add(left, right, at(bar * BEATS_PER_BAR),
                pluck(note(semi), SEC_PER_BAR * 1.1, 0.22))

    # --- riser across bars 15-16, peaking exactly on the bar-17 downbeat
    riser_start = at(14 * BEATS_PER_BAR)
    riser_len = SEC_PER_BAR * 2.0
    add(left, right, riser_start, riser(riser_len, 0.34))

    # --- final accent on the logo (bar 20 downbeat)
    add(left, right, at(19 * BEATS_PER_BAR), crash(0.40))

# ---------------------------------------------------------------- master

def master():
    """Soft-clip limiter + short fade in/out so nothing clips or pops."""
    peak = max(max(abs(s) for s in left), max(abs(s) for s in right), 1e-9)
    # aim for a healthy level before soft clipping
    gain = 0.72 / peak if peak > 0.72 else 1.0

    fade_in = int(SR * 0.02)
    fade_out = int(SR * 1.2)

    frames = bytearray()
    for i in range(N):
        l = left[i] * gain
        r = right[i] * gain
        # soft clip (tanh-ish) keeps transients musical instead of crunchy
        l = math.tanh(l * 1.25)
        r = math.tanh(r * 1.25)
        if i < fade_in:
            f = i / fade_in
            l *= f
            r *= f
        if i > N - fade_out:
            f = (N - i) / fade_out
            l *= f
            r *= f
        frames += struct.pack('<hh',
                              int(max(-32767, min(32767, l * 32767))),
                              int(max(-32767, min(32767, r * 32767))))
    return bytes(frames)

def main():
    out = Path(__file__).parent / 'out'
    out.mkdir(exist_ok=True)
    target = out / 'DR-PHONE-soundtrack.wav'

    print(f'Composing {DURATION:.3f}s at {BPM:.0f} BPM ({BARS} bars, {N} samples)...')
    build()
    data = master()

    with wave.open(str(target), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)

    print(f'Wrote {target} ({len(data) / 1048576:.1f} MB)')

if __name__ == '__main__':
    main()
