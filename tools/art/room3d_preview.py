"""앱 RoomView와 같은 방식으로 방을 합성해 보는 미리보기."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]  # 저장소 맨 위
A = (ROOT / 'assets').as_posix() + '/'
WB = json.load(open('wall_boxes.json'))
FLOOR_BOX = dict(x=12, y=933, w=2024, h=1035)
FURN = {
    'left-bed': dict(ratio=1.1915, bx=540, by=1560, w=820),
    'left-sofa': dict(ratio=1.2933, bx=560, by=1440, w=700),
    'left-tent': dict(ratio=0.9429, bx=540, by=1460, w=600),
    'right-plant': dict(ratio=0.8625, bx=1730, by=1330, w=330),
    'right-beanbag': dict(ratio=1.1499, bx=1650, by=1560, w=470),
    'light-stand': dict(ratio=0.3339, bx=1010, by=1010, w=170),
}
RUG_AT = dict(cx=1010, cy=1480, w=860)
SHELF = dict(ratio=1.3759, cx=1760, cy=580, w=420)
AVATAR = dict(bx=1010, by=1560, size=430)


def paste_box(bg, src, box):
    im = Image.open(src).convert('RGBA').resize((box['w'], box['h']), Image.LANCZOS)
    bg.alpha_composite(im, (box['x'], box['y']))


def photo_skewed(bg, photo, slot, t):
    w, h = round(slot['w']), round(slot['h'])
    p = Image.open(photo).convert('RGBA')
    # cover crop
    r = max(w / p.width, h / p.height)
    p = p.resize((round(p.width * r), round(p.height * r)))
    p = p.crop(((p.width - w) // 2, (p.height - h) // 2, (p.width - w) // 2 + w, (p.height - h) // 2 + h))
    ext = round(abs(t) * w)
    sk = p.transform((w, h + ext), Image.AFFINE, (1, 0, 0, -t, 1, -ext if t < 0 else 0), Image.BICUBIC)
    X = slot['x']
    Y = slot['y'] + t * slot['x']
    bg.alpha_composite(sk, (round(X), round(Y - (ext if t < 0 else 0))))


def compose(wall, floor, window, deco, left, right, rug, light, out, photos):
    bg = Image.open(A + f'room3d/{wall}.webp').convert('RGBA').resize((2048, 2048))
    if floor != 'floor-wood':
        ov = Image.open(A + f'room3d/{floor}.webp').convert('RGBA').resize((FLOOR_BOX['w'], FLOOR_BOX['h']))
        bg.alpha_composite(ov, (FLOOR_BOX['x'], FLOOR_BOX['y']))
    if light == 'light-string':
        for k in ['light-string-left', 'light-string-right']:
            paste_box(bg, A + f'room3d/wall_{k}.webp', WB[k])
    paste_box(bg, A + f'room3d/wall_{window}.webp', WB[window])
    paste_box(bg, A + f'room3d/wall_{deco}.webp', WB[deco])
    if deco == 'deco-crew':
        for i, sl in enumerate(WB['deco-crew']['slots']):
            photo_skewed(bg, photos[i % len(photos)], sl, WB['deco-crew']['slope'])
    if right == 'right-shelf':
        im = Image.open(A + 'room3d/right-shelf.webp').convert('RGBA')
        w = SHELF['w']; h = round(w / SHELF['ratio']); im = im.resize((w, h))
        bg.alpha_composite(im, (SHELF['cx'] - w // 2, SHELF['cy'] - h // 2))
    if light == 'light-stand':
        f = FURN['light-stand']; im = Image.open(A + 'room3d/light-stand.webp').convert('RGBA')
        h = round(f['w'] / f['ratio']); im = im.resize((f['w'], h)); bg.alpha_composite(im, (f['bx'] - f['w'] // 2, f['by'] - h))
    im = Image.open(A + f'room3d/{rug}.webp').convert('RGBA'); w = RUG_AT['w']; h = round(w / (im.width / im.height)); im = im.resize((w, h))
    bg.alpha_composite(im, (RUG_AT['cx'] - w // 2, RUG_AT['cy'] - h // 2))
    for it in [left] + ([right] if right != 'right-shelf' else []):
        f = FURN[it]; im = Image.open(A + f'room3d/{it}.webp').convert('RGBA')
        h = round(f['w'] / f['ratio']); im = im.resize((f['w'], h)); bg.alpha_composite(im, (f['bx'] - f['w'] // 2, f['by'] - h))
    a = AVATAR; ch = Image.open('../out/bear_mallang_happy.webp').convert('RGBA').resize((a['size'], a['size']))
    bg.alpha_composite(ch, (a['bx'] - a['size'] // 2, a['by'] - round(a['size'] * 0.93)))
    bg.convert('RGB').save(out.replace('.jpg','_full.jpg'), quality=88); bg.convert('RGB').resize((640, 640)).save(out, quality=88)


photos = [A + 'dest/sky.webp', A + 'dest/cup.webp', A + 'dest/green.webp']
compose('wall-pink', 'floor-wood', 'window-day', 'deco-poster', 'left-bed', 'right-plant', 'rug-cloud', 'light-stand', 'q1.jpg', photos)
compose('wall-cream', 'floor-check', 'window-sunset', 'deco-crew', 'left-sofa', 'right-shelf', 'rug-heart', 'light-string', 'q2.jpg', photos)
compose('wall-night', 'floor-dark', 'window-night', 'deco-garland', 'left-tent', 'right-beanbag', 'rug-film', 'light-stand', 'q3.jpg', photos)
ims = [Image.open(f) for f in ['q1.jpg', 'q2.jpg', 'q3.jpg']]
sh = Image.new('RGB', (1940, 640), 'white')
for i, im in enumerate(ims):
    sh.paste(im, (i * 650, 0))
sh.save('room_preview2.jpg', quality=86)
print('ok')
