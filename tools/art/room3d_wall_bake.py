"""벽에 거는 물건을 벽 기울기에 맞춰 미리 그려 둔다 (앱에서 skew 변환을 쓰지 않도록).

좌표는 3D 방 그림(2048×2048) 기준. 결과: assets/room3d/wall_<id>.webp + 배치 상자·액자 사진 칸을 JSON으로 출력.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]  # 저장소 맨 위
A = (ROOT / 'assets').as_posix() + '/'
OUT = A + 'room3d/'
PREVIEW = '--preview' in sys.argv

# 벽 가운데 높이에서 잰 기울기 (dy/dx). 왼쪽 벽은 오른쪽으로 갈수록 올라가고(-), 오른쪽 벽은 내려간다(+).
SLOPE = {'left': -0.355, 'right': 0.43}
COMPRESS = 0.9   # 비스듬히 보이는 벽이라 가로를 조금 줄인다
MARGIN = 28      # 그림자 여백

FLAT_RATIO = {
    'window-day': 0.842, 'window-sunset': 0.988, 'window-night': 0.854,
    'deco-crew': 1.636, 'deco-poster': 0.768, 'deco-garland': 2.783, 'light-string': 2.498,
}

# 아이템별 배치: 정면 기준 너비 D(2048 좌표)와 가운데 위치
ITEMS = {
    'window-day': dict(wall='left', cx=560, cy=690, D=400),
    'window-sunset': dict(wall='left', cx=560, cy=690, D=420),
    'window-night': dict(wall='left', cx=560, cy=690, D=400),
    'deco-crew': dict(wall='right', cx=1340, cy=700, D=460),
    'deco-poster': dict(wall='right', cx=1330, cy=690, D=300),
    'deco-garland': dict(wall='right', cx=1340, cy=640, D=560),
    'light-string-left': dict(wall='left', cx=520, cy=515, D=900, src='light-string'),
    'light-string-right': dict(wall='right', cx=1530, cy=550, D=900, src='light-string'),
}
CREW_SLOTS_X = [0.148, 0.404, 0.66]
CREW_SLOT = dict(w=0.186, y=0.313, h=0.412)


def bake(key, it):
    src = it.get('src', key)
    t = SLOPE[it['wall']]
    flat = Image.open(A + f'room/{src}.webp').convert('RGBA')
    D = it['D']
    W = round(D * COMPRESS)
    H = round(D / FLAT_RATIO[src])
    im = flat.resize((W, H), Image.LANCZOS)
    ext = round(abs(t) * W)
    f = -ext if t < 0 else 0
    sk = im.transform((W, H + ext), Image.AFFINE, (1, 0, 0, -t, 1, f), Image.BICUBIC)
    # 벽에 드리우는 부드러운 그림자 (빛은 왼쪽 위에서)
    a = np.asarray(sk)[..., 3]
    canvas = Image.new('RGBA', (sk.width + 2 * MARGIN, sk.height + 2 * MARGIN), (0, 0, 0, 0))
    sh = Image.new('L', canvas.size, 0)
    sh.paste(Image.fromarray(a), (MARGIN + 7, MARGIN + 10))
    sh = sh.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.26))
    shadow = Image.new('RGBA', canvas.size, (60, 40, 25, 0))
    shadow.putalpha(sh)
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(sk, (MARGIN, MARGIN))
    # 위치: 기울어진 그림의 가운데를 (cx, cy)에
    bx = it['cx'] - canvas.width / 2
    by = it['cy'] - canvas.height / 2
    canvas.save(OUT + f'wall_{key}.webp', 'WEBP', quality=88, method=6)
    out = {'x': round(bx), 'y': round(by), 'w': canvas.width, 'h': canvas.height}
    if key == 'deco-crew':
        slots = []
        ext0 = ext if t < 0 else 0
        for fx in CREW_SLOTS_X:
            x0 = fx * W
            x1 = (fx + CREW_SLOT['w']) * W
            y0 = CREW_SLOT['y'] * H
            y1 = (CREW_SLOT['y'] + CREW_SLOT['h']) * H
            # 앱(SVG): <Image x y w h transform="matrix(1 t 0 1 0 0)"> 로 그리면 칸 모양과 같아진다
            X = round(out['x'] + MARGIN + x0, 1)
            Y = round(out['y'] + MARGIN + y0 + ext0 - t * (out['x'] + MARGIN), 1)
            slots.append({'x': X, 'y': Y, 'w': round(x1 - x0, 1), 'h': round(y1 - y0, 1)})
        out['slots'] = slots
        out['slope'] = t
    return canvas, out


result = {}
for k, it in ITEMS.items():
    _, box = bake(k, it)
    result[k] = box
print(json.dumps(result))
json.dump(result, open('wall_boxes.json', 'w'), indent=1)
