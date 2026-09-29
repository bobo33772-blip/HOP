"""
롤롤 효과음 · 배경음을 코드로 합성한다 (녹음·외부 음원 없음 → 저작권 걱정 없음).
python tools/sound/make_sounds.py  →  assets/sounds/*.wav

효과음: 44.1kHz 16bit mono / 배경음: 22.05kHz 16bit mono, 끊김 없이 이어지는 루프.
나중에 직접 녹음한 소리로 바꿀 때도 같은 파일 이름으로 덮어쓰면 된다.
"""
import math
import os
import wave

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'sounds')
rng = np.random.default_rng(11)


# ─────────────────────────── 기본 도구
def axis(sec, sr=SR):
    return np.arange(int(sr * sec)) / sr


def env(t, attack, decay):
    """빠른 어택 + 지수 감쇠"""
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def phase(f, sr=SR):
    return 2 * np.pi * np.cumsum(f) / sr


def noise(n):
    return rng.standard_normal(n)


def bp(x, lo, hi, order=2, sr=SR):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=sr, output='sos'), x)


def lp(x, fc, order=2, sr=SR):
    return sosfilt(butter(order, fc, btype='low', fs=sr, output='sos'), x)


def hp(x, fc, order=2, sr=SR):
    return sosfilt(butter(order, fc, btype='high', fs=sr, output='sos'), x)


def reson(x, f, q, sr=SR):
    """좁은 공명 (나무·플라스틱이 울리는 소리)"""
    w0 = 2 * math.pi * f / sr
    alpha = math.sin(w0) / (2 * q)
    b = [alpha, 0, -alpha]
    a = [1 + alpha, -2 * math.cos(w0), 1 - alpha]
    return lfilter(b, a, x)


def sweep_bp(x, centers, q, sr=SR, block=256):
    """시간에 따라 중심 주파수가 움직이는 밴드패스 (블록마다 계수 갱신)"""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.clip(centers[min(i, len(centers) - 1)], 40, sr * 0.45))
        w0 = 2 * math.pi * f / sr
        alpha = math.sin(w0) / (2 * q)
        b = np.array([alpha, 0, -alpha]) / (1 + alpha)
        a = np.array([1, -2 * math.cos(w0) / (1 + alpha), (1 - alpha) / (1 + alpha)])
        y[i:i + block], zi = lfilter(b, a, x[i:i + block], zi=zi)
    return y


def place(dst, src, at):
    i = int(at)
    if i >= len(dst):
        return
    n = min(len(src), len(dst) - i)
    dst[i:i + n] += src[:n]


def finish(x, peak=0.8, fade_in=0.002, fade_out=0.015, sr=SR):
    x = np.asarray(x, float)
    x = x - np.mean(x)
    n_in, n_out = int(sr * fade_in), int(sr * fade_out)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out)
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def save(name, x, peak=0.8, sr=SR, fade_out=0.015, fade_in=0.002):
    x = finish(x, peak, fade_in=fade_in, fade_out=fade_out, sr=sr)
    path = os.path.join(OUT, f'{name}.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    print(f'{name:9s} {len(x) / sr:5.2f}s  {os.path.getsize(path) // 1024:5d}KB')


def bubble(f0, dur=0.03, rise=0.6, sr=SR):
    """작은 물방울이 터지는 뽁 (주파수가 살짝 올라간다)"""
    t = axis(dur, sr)
    f = f0 * (1 + rise * (1 - np.exp(-t / 0.008)))
    return np.sin(phase(f, sr)) * env(t, 0.0008, dur / 3.5)


# ─────────────────────────── 말랑볼 조물조물
def squish():
    """꾹: 촉촉하고 쫀득한 슬라임 소리 (낮은 뭉개짐 + 잔 물방울)"""
    t = axis(0.26)
    body = bp(noise(len(t)), 160, 650) * env(t, 0.006, 0.07) * 1.3
    x = body.copy()
    for _ in range(11):
        at = rng.uniform(0.0, 0.14) * SR
        place(x, bubble(rng.uniform(650, 1700), rng.uniform(0.018, 0.04)) * rng.uniform(0.25, 0.9), at)
    thud = np.sin(phase(115 - 45 * (1 - np.exp(-t / 0.03)))) * env(t, 0.002, 0.05)
    return lp(x * 0.9 + thud * 0.7, 5000)


def pop():
    """손을 떼면: 말랑하게 튕겨 돌아오는 뽀용"""
    t = axis(0.38)
    f = (165 + 270 * np.exp(-t / 0.05)) * (1 + 0.09 * np.sin(2 * np.pi * 13 * t) * np.exp(-t / 0.14))
    tone = (np.sin(phase(f)) + 0.32 * np.sin(2 * phase(f))) * env(t, 0.002, 0.11)
    x = tone.copy()
    place(x, bubble(1150, 0.035, 0.4) * 0.45, 0)
    return lp(x, 3200)


def stretch():
    """쭈우욱: 고무가 늘어나며 끼익 (마찰 알갱이가 공명판을 울린다)"""
    dur = 0.62
    t = axis(dur)
    pulses = np.zeros(len(t))
    pos = 0.0
    while pos < dur - 0.02:
        prog = pos / dur
        pulses[int(pos * SR)] = rng.uniform(0.6, 1.0) * math.sin(math.pi * min(1, prog * 1.3)) ** 0.6
        pos += 1 / (24 + 30 * prog) * rng.uniform(0.8, 1.2)
    x = reson(pulses, 980, 14) * 1.0 + reson(pulses, 1960, 11) * 0.45 + reson(pulses, 430, 6) * 0.6
    squeal = np.sin(phase(760 + 240 * t / dur + 18 * np.sin(2 * np.pi * 7 * t))) * 0.05 * np.sin(np.pi * t / dur) ** 2
    return lp(x + squeal, 4500)


def key(plate_hz, body_lo, body_hi, bottom_ms):
    """기계식 키캡: 딸깍(판 공명) + 도각(몸통) + 바닥 닿는 소리"""
    t = axis(0.13)
    imp = np.zeros(len(t))
    imp[0] = 1.0
    click = hp(noise(len(t)), 2500) * env(t, 0.0002, 0.0016)
    plate = reson(imp, plate_hz, 16) * 60 * env(t, 0.0001, 0.011)
    thock = bp(noise(len(t)), body_lo, body_hi) * env(t, 0.0008, 0.026) * 2.2
    x = click * 0.8 + plate * 0.5 + thock
    b = int(SR * bottom_ms / 1000)
    tb = t[: len(t) - b]
    x[b:] += (hp(noise(len(tb)), 1800) * env(tb, 0.0002, 0.0012) * 0.35 + bp(noise(len(tb)), body_lo * 1.4, body_hi * 1.4) * env(tb, 0.0006, 0.014) * 0.9)
    return lp(x, 9000)


# ─────────────────────────── 면치기 숨쉬기
def inhale():
    """들숨 안내: 누르고 있는 동안 부드럽게 차오르는 바람 (4초)"""
    t = axis(4.4)
    n = noise(len(t))
    x = sweep_bp(n, 450 + 900 * (t / 4.4) ** 1.2, 1.4)
    shimmer = bp(n, 3500, 6500) * 0.06
    swell = np.clip(t / 3.6, 0, 1) ** 1.6 * np.clip((4.4 - t) / 0.4, 0, 1)
    return (x + shimmer) * swell


def slurp():
    """후루룩: 면이 빨려 들어가는 소리 (뽀글거리는 공기 + 국물 꿀렁)"""
    dur = 0.95
    t = axis(dur)
    n = noise(len(t))
    center = 1100 + 1300 * (t / dur) + 350 * np.sin(2 * np.pi * 5.5 * t)
    air = sweep_bp(n, center, 2.0)
    bursts = np.zeros(len(t))
    pos = 0.0
    while pos < dur - 0.05:
        place(bursts, env(axis(0.06), 0.004, 0.022) * rng.uniform(0.5, 1.0), pos * SR)
        pos += rng.uniform(0.035, 0.075)
    gurgle = bp(n, 220, 620) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) * 0.5
    shape = np.clip(t / 0.05, 0, 1) * np.clip((dur - t) / 0.18, 0, 1)
    return (air * (0.35 + bursts) + gurgle) * shape


def blow():
    """날숨: 생일 초를 끄듯 후~ 길게 (6초)"""
    t = axis(6.2)
    n = noise(len(t))
    x = lp(n, 850) * 1.5 + bp(n, 190, 460) * 0.9
    shape = np.clip(t / 0.25, 0, 1) * np.exp(-t / 3.8) * np.clip((6.2 - t) / 0.8, 0, 1) * (1 + 0.12 * np.sin(2 * np.pi * 5 * t))
    return x * shape


def puff():
    """촛불이 꺼지는 퓨슉"""
    t = axis(0.3)
    x = sweep_bp(noise(len(t)), 2600 - 1900 * (t / 0.3), 2.2) * env(t, 0.004, 0.06)
    thump = np.sin(phase(np.full(len(t), 140.0))) * env(t, 0.002, 0.03) * 0.3
    return x + thump


# ─────────────────────────── 창밖 색 채우기 · 공통
def fill():
    """색이 번지는 뽀롱 (물방울처럼 올라가는 음)"""
    t = axis(0.32)
    f = 500 + 540 * (1 - np.exp(-t / 0.018))
    tone = (np.sin(phase(f)) + 0.12 * np.sin(phase(f * 2.7))) * env(t, 0.002, 0.075)
    x = tone.copy()
    place(x, bubble(1300, 0.03) * 0.3, 0.004 * SR)
    return x


def stamp():
    """개찰 스탬프 쾅 + 종이 탁"""
    t = axis(0.4)
    thump = np.sin(phase(95 - 38 * (1 - np.exp(-t / 0.05)))) * env(t, 0.001, 0.09)
    slap = bp(noise(len(t)), 300, 2600) * env(t, 0.0006, 0.028) * 1.4
    imp = np.zeros(len(t))
    imp[0] = 1
    knock = reson(imp, 480, 9) * 30 * env(t, 0.0003, 0.05)
    return thump + slap + knock * 0.4


def paper():
    """승차권이 스르륵 나오는 소리"""
    t = axis(0.42)
    x = bp(noise(len(t)), 1500, 6000) * np.clip(t / 0.25, 0, 1) * np.clip((0.42 - t) / 0.12, 0, 1)
    return x * (0.7 + 0.3 * np.sin(2 * np.pi * 23 * t))


def chime():
    """게이지가 찼을 때: 도 · 미 · 솔 · 도 글로켄슈필"""
    t = axis(1.6)
    x = np.zeros(len(t))
    for k, hz in enumerate([1046.5, 1318.5, 1568.0, 2093.0]):
        off = int(SR * 0.11 * k)
        tt = t[: len(t) - off]
        bell = sum(a * np.sin(2 * np.pi * hz * r * tt) * np.exp(-tt / d) for r, a, d in [(1, 1, 0.55), (2.76, 0.35, 0.18), (5.4, 0.15, 0.08), (8.93, 0.06, 0.05)])
        x[off:] += bell * np.clip(tt / 0.002, 0, 1)
    return x


def step():
    """정거장을 걷는 말랑볼 발소리: 뽁"""
    t = axis(0.14)
    x = bubble(520, 0.06, 0.5) * 0.8
    x = np.pad(x, (0, len(t) - len(x)))
    thud = np.sin(phase(np.full(len(t), 150.0))) * env(t, 0.002, 0.025) * 0.6
    return lp(x + thud + bp(noise(len(t)), 200, 900) * env(t, 0.002, 0.02) * 0.4, 3500)


# ─────────────────────────── 배경음: 정거장의 밤 (72BPM, 16마디 루프)
BSR = 22050


def note_hz(name):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[name[0]] + (1 if '#' in name else 0)
    octave = int(name[-1])
    return 440.0 * 2 ** ((n + 12 * (octave + 1) - 69) / 12)


def ep(freq, dur, vel=1.0):
    """전자 피아노(FM): 치는 순간 반짝, 서서히 둥글게"""
    t = axis(dur + 1.2, BSR)
    idx = 1.6 * np.exp(-t / 0.3) + 0.25
    mod = np.sin(2 * np.pi * freq * t) * idx
    car = np.sin(2 * np.pi * freq * t + mod)
    amp = env(t, 0.004, 0.9) * 0.55 + env(t, 0.004, 3.5) * 0.45
    amp *= np.clip((dur + 1.2 - t) / 0.4, 0, 1)
    return car * amp * (1 + 0.08 * np.sin(2 * np.pi * 4.2 * t)) * vel


def musicbox(freq, vel=1.0):
    t = axis(1.6, BSR)
    x = np.sin(2 * np.pi * freq * t) + 0.28 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.3) + 0.1 * np.sin(2 * np.pi * freq * 4.1 * t) * np.exp(-t / 0.12)
    return x * env(t, 0.002, 0.7) * vel


def bass(freq, dur, vel=1.0):
    t = axis(dur + 0.2, BSR)
    x = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t)
    return x * np.clip(t / 0.012, 0, 1) * np.exp(-t / 1.2) * np.clip((dur + 0.2 - t) / 0.15, 0, 1) * vel


def reverb(x, wet=0.22):
    """작은 방 울림 (슈뢰더: 콤 4개 + 올패스 2개)"""
    y = np.zeros_like(x)
    for d, g in [(1116, 0.78), (1188, 0.76), (1277, 0.74), (1356, 0.72)]:
        d = int(d * BSR / 44100)
        b = np.zeros(d + 1)
        b[0] = 1
        a = np.zeros(d + 1)
        a[0] = 1
        a[d] = -g
        y += lfilter(b, a, x)
    for d, g in [(556, 0.5), (441, 0.5)]:
        d = int(d * BSR / 44100)
        b = np.zeros(d + 1)
        b[0] = -g
        b[d] = 1
        a = np.zeros(d + 1)
        a[0] = 1
        a[d] = -g
        y = lfilter(b, a, y)
    return x * (1 - wet) + lp(y, 4000, sr=BSR) * wet * 0.35


def bgm():
    beat = 60 / 72
    bar = beat * 4
    bars = 16
    total = bar * bars
    tail = 3.0
    n = int((total + tail) * BSR)
    pad = np.zeros(n)
    low = np.zeros(n)
    mel = np.zeros(n)
    perc = np.zeros(n)
    chords = [
        ('F2', ['A3', 'C4', 'E4']),
        ('E2', ['G3', 'B3', 'D4']),
        ('D2', ['F3', 'A3', 'C4']),
        ('C2', ['E3', 'G3', 'B3', 'D4']),
    ]
    for b in range(bars):
        root, tones = chords[b % 4]
        t0 = b * bar
        for k, nm in enumerate(tones):
            place(pad, ep(note_hz(nm), beat * 2.5, 0.55), (t0 + k * 0.012) * BSR)
            place(pad, ep(note_hz(nm), beat * 1.2, 0.3), (t0 + beat * 2.5 + k * 0.01) * BSR)
        place(low, bass(note_hz(root), beat * 2, 0.9), t0 * BSR)
        fifth = note_hz(root) * 1.5
        place(low, bass(fifth, beat * 1.5, 0.6), (t0 + beat * 2) * BSR)

    # 오르골 선율 (5마디부터). 8분음표 칸 8개, '.'는 쉼
    melody = {
        4: ['A5', '.', '.', 'G5', '.', 'E5', '.', '.'],
        5: ['G5', '.', '.', 'E5', '.', 'D5', '.', '.'],
        6: ['C6', '.', '.', 'A5', '.', 'F5', '.', '.'],
        7: ['E5', '.', '.', '.', 'D5', '.', 'C5', '.'],
        8: ['C5', '.', 'E5', '.', 'A5', '.', 'G5', '.'],
        9: ['E5', '.', 'G5', '.', 'B5', '.', 'G5', '.'],
        10: ['F5', '.', 'A5', '.', 'C6', '.', 'A5', '.'],
        11: ['G5', '.', '.', 'E5', '.', '.', 'D5', '.'],
        12: ['A5', '.', '.', 'G5', '.', 'E5', '.', '.'],
        13: ['G5', '.', '.', 'E5', '.', 'D5', '.', '.'],
        14: ['C6', '.', '.', 'A5', '.', 'F5', '.', 'D5'],
        15: ['E5', '.', '.', '.', '.', '.', '.', '.'],
    }
    for b, slots in melody.items():
        for k, nm in enumerate(slots):
            if nm != '.':
                swing = 0.03 if k % 2 else 0
                place(mel, musicbox(note_hz(nm), 0.5 + 0.1 * (k == 0)), (b * bar + k * beat / 2 + swing) * BSR)

    # 살살 흔드는 셰이커 + 멀리서 들리는 기차 칙칙 (5마디부터)
    tt = axis(0.08, BSR)
    shake = bp(noise(len(tt)), 3500, 8000, sr=BSR) * env(tt, 0.004, 0.02)
    chug = lp(noise(int(0.16 * BSR)), 500, sr=BSR) * env(axis(0.16, BSR), 0.01, 0.05)
    for b in range(4, bars):
        for k in range(8):
            place(perc, shake * (0.35 if k % 2 else 0.2), (b * bar + k * beat / 2 + (0.03 if k % 2 else 0)) * BSR)
        for k in (1, 3):
            place(perc, chug * 0.5, (b * bar + k * beat) * BSR)

    mix = pad * 0.5 + low * 0.55 + mel * 0.42 + perc * 0.5
    mix = reverb(mix)
    # 루프: 꼬리를 앞머리에 겹쳐 이음매가 들리지 않게
    loop = mix[: int(total * BSR)].copy()
    t_len = len(mix) - len(loop)
    loop[:t_len] += mix[len(loop):]
    # 로파이: 고음을 살짝 깎고, 아주 작은 판 튀는 소리
    loop = lp(loop, 6500, sr=BSR)
    crackle = np.zeros(len(loop))
    for _ in range(int(total * 3)):
        crackle[rng.integers(0, len(loop))] = rng.uniform(-1, 1)
    loop += lp(crackle, 3000, sr=BSR) * 0.25 + lp(noise(len(loop)), 2500, sr=BSR) * 0.004
    return np.tanh(loop * 1.2)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save('squish', squish())
    save('pop', pop())
    save('stretch', stretch(), peak=0.6)
    save('key1', key(3300, 170, 480, 7))
    save('key2', key(2900, 150, 420, 8))
    save('key3', key(3700, 190, 540, 6))
    save('inhale', inhale(), peak=0.45, fade_out=0.3)
    save('slurp', slurp(), peak=0.7)
    save('blow', blow(), peak=0.5, fade_out=0.5)
    save('puff', puff(), peak=0.55)
    save('fill', fill(), peak=0.65)
    save('stamp', stamp(), peak=0.85)
    save('paper', paper(), peak=0.4)
    save('chime', chime(), peak=0.6)
    save('step', step(), peak=0.5)
    save('bgm_station', bgm(), peak=0.7, sr=BSR, fade_out=0.0, fade_in=0.0)
