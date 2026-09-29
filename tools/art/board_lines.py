"""정거장 전광판에 얹을 기분 노선 이름 (2단계).

station_bake.py의 전광판 글씨와 같은 글꼴 · 색 · 기울기(t=0.25)로 굽는다.
python tools/art/board_lines.py → assets/station/board_line_*.webp + src/lib/line-art.ts
(하늘행 · 그림자행은 기존 board_sky · board_shadow를 그대로 쓴다)
"""
import json
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
A = os.path.join(ROOT, 'assets', 'station')
FONT = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'jua', '400Regular', 'Jua_400Regular.ttf')
SC = 0.8
BOARD = dict(cx=1127, cy=950, t=0.25, size=74)

LINES = {
    'field': '들판행',
    'rain': '빗소리행',
    'thunder': '천둥행',
    'blanket': '이불행',
    'drift': '떠돌이행',
    'pick': '기분을 골라요',
}


def skew_img(im, t):
    """세로선은 그대로, 가로선만 기울기 t(dy/dx)로"""
    W, H = im.size
    ext = round(abs(t) * W)
    return im.transform((W, H + ext), Image.AFFINE, (1, 0, 0, -t, 1, -ext if t < 0 else 0), Image.BICUBIC)


def text_img(text, size, fill, glow=None):
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = font.getbbox(text)
    pad = size // 3
    im = Image.new('RGBA', (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    if glow:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).text((pad - l, pad - t), text, font=font, fill=glow)
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(size / 8)))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill)
    return im


boxes = {}
for k, name in LINES.items():
    # 긴 글씨(기분을 골라요)는 전광판 안에 들어가게 조금 작게
    size = BOARD['size'] if len(name) <= 4 else 58
    ti = text_img(name, size, (255, 246, 224, 255), glow=(255, 214, 120, 150))
    sk = skew_img(ti, BOARD['t'])
    x = round(BOARD['cx'] - sk.width / 2)
    y = round(BOARD['cy'] - sk.height / 2)
    sk.resize((round(sk.width * SC), round(sk.height * SC)), Image.LANCZOS).save(os.path.join(A, f'board_line_{k}.webp'), 'WEBP', quality=90, method=6)
    boxes[k] = {'x': x, 'y': y, 'w': sk.width, 'h': sk.height}

lines = [
    '// 자동 생성 (tools/art/board_lines.py). 정거장 전광판의 기분 노선 이름.',
    "import type { Box } from './station-art';",
    '',
    'export const LINE_BOARD: Record<string, { src: number; box: Box }> = {',
]
for k, b in boxes.items():
    lines.append(f"  {k}: {{ src: require('@/assets/station/board_line_{k}.webp'), box: {{ x: {b['x']}, y: {b['y']}, w: {b['w']}, h: {b['h']} }} }},")
lines.append('};')
open(os.path.join(ROOT, 'src', 'lib', 'line-art.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print(json.dumps(boxes, ensure_ascii=False))
