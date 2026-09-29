"""정거장 오버레이를 변환 없이 쓰도록 미리 그린다.

1) 객차: 색 있는 칸은 창 안쪽을 투명하게 뚫는다(승객은 차 뒤에 그려 창으로 보이게).
   빈 칸은 창 안에 점선 테두리 + 칸 번호를 창 기울기대로 그려 넣는다.
2) 배경 4종에 간판 글씨(롤롤 정거장·롤롤 사진관·오늘의 행선지)를 굽는다.
3) 전광판 행선지 이름 7종을 투명 그림으로 만든다.
"""
import json
import math
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]  # 저장소 맨 위
A = (ROOT / 'assets/station').as_posix() + '/'
FONT = (ROOT / 'node_modules/@expo-google-fonts/jua/400Regular/Jua_400Regular.ttf').as_posix()
SC = 0.8
meta = json.load(open('sprites/meta.json'))
COLORS = ['sky', 'pink', 'butter', 'lilac', 'peach', 'mint', 'cream', 'gray', 'empty']


def skew_img(im, t):
    """세로선은 그대로, 가로선만 기울기 t(dy/dx)로"""
    W, H = im.size
    ext = round(abs(t) * W)
    return im.transform((W, H + ext), Image.AFFINE, (1, 0, 0, -t, 1, -ext if t < 0 else 0), Image.BICUBIC), (ext if t < 0 else 0)


def text_img(text, size, fill, glow=None, stroke=None):
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = font.getbbox(text)
    pad = size // 3
    im = Image.new('RGBA', (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if glow:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).text((pad - l, pad - t), text, font=font, fill=glow)
        g = g.filter(ImageFilter.GaussianBlur(size / 8))
        im.alpha_composite(g)
    d.text((pad - l, pad - t), text, font=font, fill=fill, stroke_width=stroke[0] if stroke else 0, stroke_fill=stroke[1] if stroke else None)
    return im


# ---------- 1) 객차 ----------
windows_out = []
for i, car in enumerate(meta['cars']):
    bx, by, bw, bh = car['box']
    W = car['window']
    base = np.asarray(Image.open(f'sprites/car{i}_sky.png').convert('RGBA')).copy()
    hsv = cv2.cvtColor(np.ascontiguousarray(base[..., :3]), cv2.COLOR_RGB2HSV)
    # 창 상자(차 기준 좌표) 안의 크림색 가장 큰 덩어리 = 창 안쪽
    wx, wy = W['x'] - bx, W['y'] - by
    cream = ((hsv[..., 2] > 195) & (hsv[..., 1] < 70)).astype(np.uint8)
    roi = np.zeros_like(cream)
    roi[max(0, wy - 4):wy + W['h'] + 4, max(0, wx - 4):wx + W['w'] + 4] = 1
    cream &= roi
    n, lab, st, _ = cv2.connectedComponentsWithStats(cream)
    big = int(np.argmax(st[1:, cv2.CC_STAT_AREA])) + 1
    hole = (lab == big).astype(np.uint8) * 255
    ff = hole.copy()
    h, w = hole.shape
    mk = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mk, (0, 0), 255)
    hole = hole | cv2.bitwise_not(ff)
    hole = cv2.erode(hole, np.ones((3, 3), np.uint8))
    soft = cv2.GaussianBlur(hole, (0, 0), 0.8).astype(np.float32) / 255
    ys, xs = np.where(hole > 0)
    windows_out.append({'x': int(xs.min() + bx), 'y': int(ys.min() + by), 'w': int(xs.max() - xs.min() + 1), 'h': int(ys.max() - ys.min() + 1), 'slope': W['slope']})
    for c in COLORS:
        im = np.asarray(Image.open(f'sprites/car{i}_{c}.png').convert('RGBA')).copy()
        if c == 'empty':
            out = Image.fromarray(im)
            # 창 안: 점선 테두리 + 번호 (창 기울기대로)
            x0, y0 = xs.min(), ys.min()
            ww, hh = xs.max() - x0 + 1, ys.max() - y0 + 1
            t = W['slope']
            h0 = hh - abs(t) * ww
            layer = Image.new('RGBA', (int(ww), int(h0)), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            m = int(min(ww, h0) * 0.14)
            dash, gap = 9, 7
            col = (160, 172, 190, 255)
            rect = [m, m, ww - m - 1, h0 - m - 1]
            # 점선 사각형
            for x in range(rect[0], int(rect[2]), dash + gap):
                d.line([(x, rect[1]), (min(x + dash, rect[2]), rect[1])], fill=col, width=4)
                d.line([(x, rect[3]), (min(x + dash, rect[2]), rect[3])], fill=col, width=4)
            for y in range(rect[1], int(rect[3]), dash + gap):
                d.line([(rect[0], y), (rect[0], min(y + dash, rect[3]))], fill=col, width=4)
                d.line([(rect[2], y), (rect[2], min(y + dash, rect[3]))], fill=col, width=4)
            num = text_img(str(i + 1), int(h0 * 0.42), (150, 162, 180, 255))
            layer.alpha_composite(num, ((layer.width - num.width) // 2, (layer.height - num.height) // 2))
            sk, off = skew_img(layer, t)
            out.alpha_composite(sk, (int(x0), int(y0 + (hh - h0 - abs(t) * ww) / 2)))
        else:
            im[..., 3] = (im[..., 3] * (1 - soft)).astype(np.uint8)
            out = Image.fromarray(im)
        out = out.resize((max(1, round(out.width * SC)), max(1, round(out.height * SC))), Image.LANCZOS)
        out.save(A + f'car{i}_{c}.webp', 'WEBP', quality=88, method=6)

# ---------- 2) 간판 글씨를 배경에 굽기 ----------
SIGNS = [
    # (글자, 가운데 x, y, 크기, 기울기, 색)
    ('롤롤 정거장', 417, 808, 64, -0.24, (138, 90, 58, 255)),
    ('롤롤 사진관', 342, 1553, 60, -0.13, (138, 90, 58, 255)),
    ('오늘의 행선지', 1127, 885, 30, 0.25, (175, 195, 224, 255)),
]
for p in ['day', 'morning', 'sunset', 'night']:
    src = {'day': 'st0_a.png', 'morning': 'st_morning.png', 'sunset': 'st_sunset.png', 'night': 'st_night.png'}[p]
    bg = Image.open(src).convert('RGBA')
    for text, cx, cy, size, t, col in SIGNS:
        ti = text_img(text, size, col)
        sk, _ = skew_img(ti, t)
        bg.alpha_composite(sk, (round(cx - sk.width / 2), round(cy - sk.height / 2)))
    bg = bg.convert('RGB').resize((round(bg.width * SC), round(bg.height * SC)), Image.LANCZOS)
    bg.save(A + f'bg_{p}.webp', 'WEBP', quality=82, method=6)

# ---------- 3) 전광판 행선지 이름 ----------
DESTS = {'sky': '하늘행', 'cup': '한 잔행', 'feet': '발끝행', 'window': '창밖행', 'lunch': '점심행', 'shadow': '그림자행', 'green': '초록행'}
BOARD = dict(cx=1127, cy=950, t=0.25, size=74)
board_boxes = {}
for k, name in DESTS.items():
    ti = text_img(name, BOARD['size'], (255, 246, 224, 255), glow=(255, 214, 120, 150))
    sk, _ = skew_img(ti, BOARD['t'])
    x = round(BOARD['cx'] - sk.width / 2)
    y = round(BOARD['cy'] - sk.height / 2)
    sk.resize((round(sk.width * SC), round(sk.height * SC)), Image.LANCZOS).save(A + f'board_{k}.webp', 'WEBP', quality=90, method=6)
    board_boxes[k] = {'x': x, 'y': y, 'w': sk.width, 'h': sk.height}

json.dump({'windows': windows_out, 'board': board_boxes}, open('station_bake.json', 'w'), indent=1)
print(json.dumps({'windows': windows_out, 'board': board_boxes}))
