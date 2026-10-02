"""Lift the engraved artwork out of the minion STL tokens as exact vector outlines.

    python tools/minion_art.py            (needs: pip install numpy pillow)

Reads   references/GOA2-Plain-Minion-*.stl (the user's models; not committed — 35 MB)
Writes  src/lib/board/minionArt.ts          the six emblems as svg path data
        src/lib/images/minions/*.png        the flat spawn-tile sprites (classic board, editor, wave icon)

Each model is a flat hex tile with the artwork cut into its top face as grooves. The top face's
triangles share every edge with another top triangle EXCEPT along the hex rim and along the lips
of the grooves — so the edges used by exactly one top triangle are the outlines. Chained into
closed loops and filled with the even-odd rule (the hex rim left out) they are the grooves.
Sampling the height map instead (the first attempt) gave speckled, soft line art.
"""
import math, os, re
from collections import defaultdict
import numpy as np
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'references', 'GOA2-Plain-Minion-%s.stl')
# the models' own names: Orange Heavy / Melee / Ranged, Blue Large / Medium / Small
FILES = {('orange', 'melee'): 'Orange-M', ('orange', 'ranged'): 'Orange-R', ('orange', 'heavy'): 'Orange-H',
         ('blue', 'melee'): 'Blue-M', ('blue', 'ranged'): 'Blue-S', ('blue', 'heavy'): 'Blue-L'}
UNIT = 100.0  # the hex's centre → corner distance in the output
TOL = 0.035   # mm: outline simplification (the hex is ~39 mm across)


def load(path):
    data = open(path, 'rb').read()
    v = np.array(re.findall(rb'vertex\s+(\S+)\s+(\S+)\s+(\S+)', data), dtype=np.float64)
    return v.reshape(-1, 3, 3)


def top_loops(tris):
    zmax = tris[..., 2].max()
    top = tris[(np.abs(tris[..., 2] - zmax) < 1e-4).all(axis=1)][..., :2]
    key = lambda p: (round(float(p[0]), 4), round(float(p[1]), 4))
    count, directed = defaultdict(int), {}
    for t in top:
        ks = [key(t[0]), key(t[1]), key(t[2])]
        for i in range(3):
            a, b = ks[i], ks[(i + 1) % 3]
            if a == b:
                continue
            count[(a, b) if a < b else (b, a)] += 1
            directed[(a, b)] = True
    nxt = defaultdict(list)
    for (a, b) in directed:
        if count[(a, b) if a < b else (b, a)] == 1:
            nxt[a].append(b)
    loops = []
    while nxt:
        start = next(iter(nxt))
        loop, cur = [start], start
        while True:
            outs = nxt.get(cur)
            if not outs:
                break
            b = outs.pop()
            if not outs:
                del nxt[cur]
            if b == start:
                break
            loop.append(b)
            cur = b
        if len(loop) >= 3:
            loops.append(np.array(loop))
    return loops


def area(l):
    x, y = l[:, 0], l[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def simplify(l, tol):
    """Douglas–Peucker on a closed loop (split at the two points farthest apart)."""
    def dp(pts):
        if len(pts) < 3:
            return pts
        a, b = pts[0], pts[-1]
        ab = b - a
        L = math.hypot(*ab)
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L if L > 1e-12 else np.hypot(*(pts - a).T)
        i = int(np.argmax(d))
        if d[i] <= tol:
            return np.array([a, b])
        return np.vstack([dp(pts[:i + 1])[:-1], dp(pts[i:])])
    i1 = int(np.argmax(((l - l[0]) ** 2).sum(1)))
    a, b = dp(l[:i1 + 1]), dp(np.vstack([l[i1:], l[:1]]))
    return np.vstack([a[:-1], b[:-1]])


def extract(team, role):
    """→ loops (arrays of points; hex centre at 0,0, corner distance UNIT, y down, model 'up' = −y)."""
    loops = sorted(top_loops(load(SRC % FILES[(team, role)])), key=lambda l: -abs(area(l)))
    rim, grooves = loops[0], loops[1:]
    c = (rim.min(0) + rim.max(0)) / 2
    R = (rim[:, 0].max() - rim[:, 0].min()) / 2  # the model's hex is flat-topped: corner to corner along x
    out = []
    for l in grooves:
        if abs(area(l)) < 0.01:
            continue  # specks
        s = simplify(l, TOL)
        if len(s) >= 3:
            p = (s - c) / R * UNIT
            p[:, 1] *= -1
            out.append(p)
    return out


def path(loops):
    return ''.join('M' + 'L'.join(f'{round(float(x), 1):g} {round(float(y), 1):g}' for x, y in p) + 'Z' for p in loops)


# ── the flat sprites for the classic board: a pointy-top team hex with the emblem engraved ──────────
PAL = {'orange': {'lit': (247, 168, 92), 'mid': (222, 126, 50), 'low': (176, 88, 28), 'rim': (74, 36, 10), 'ink': (64, 28, 6), 'halo': (255, 220, 170)},
       'blue': {'lit': (214, 240, 255), 'mid': (140, 204, 244), 'low': (78, 150, 214), 'rim': (14, 42, 78), 'ink': (16, 48, 92), 'halo': (240, 250, 255)}}


def sprite(team, loops, n=384, ss=4):
    N = n * ss
    pal = PAL[team]
    rot = math.radians(-30)  # flat-top model → the board's pointy-top hexes (the same turn the old sprites had)
    cr, sr = math.cos(rot), math.sin(rot)
    S = N * 0.455 / UNIT
    to = lambda p: [(N / 2 + (x * cr - y * sr) * S, N / 2 + (x * sr + y * cr) * S) for x, y in p]
    hexpts = lambda r: to([(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in range(0, 360, 60)])
    # the tile: lit in the middle, darker towards the rim
    yy, xx = np.mgrid[0:N, 0:N]
    d = np.clip(np.hypot(xx - N / 2, yy - N * 0.47) / (N * 0.47), 0, 1)[..., None]
    lit, mid, low = (np.array(pal[k], dtype=np.float64) for k in ('lit', 'mid', 'low'))
    grad = np.where(d < 0.6, lit + (mid - lit) * (d / 0.6), mid + (low - mid) * ((d - 0.6) / 0.4))
    tile = Image.fromarray(grad.astype(np.uint8), 'RGB')
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    m_outer = Image.new('L', (N, N), 0); ImageDraw.Draw(m_outer).polygon(hexpts(UNIT), fill=255)
    m_inner = Image.new('L', (N, N), 0); ImageDraw.Draw(m_inner).polygon(hexpts(UNIT * 0.93), fill=255)
    img.paste(pal['rim'] + (255,), mask=m_outer)
    img.paste(tile, mask=m_inner)
    groove = Image.new('1', (N, N), 0)
    for p in loops:
        layer = Image.new('1', (N, N), 0)
        ImageDraw.Draw(layer).polygon(to(p), fill=1)
        groove = ImageChops.logical_xor(groove, layer)
    g = groove.convert('L')
    from PIL import ImageFilter
    halo = g.filter(ImageFilter.MaxFilter(2 * ss * 2 + 1)).point(lambda v: int(v * 0.55))  # a pale lip round every groove
    halo = ImageChops.multiply(halo, m_inner)
    img.paste(pal['halo'] + (255,), mask=halo)
    img.paste(pal['ink'] + (255,), mask=g)
    # 384 px and a 160-colour palette keep each sprite near 30 KB (it is only ever drawn hex-sized)
    return img.resize((n, n), Image.LANCZOS).quantize(colors=160, method=Image.Quantize.FASTOCTREE)


if __name__ == '__main__':
    art = {}
    for (team, role) in FILES:
        loops = extract(team, role)
        pts = np.vstack(loops)
        lo, hi = pts.min(0), pts.max(0)
        c = (lo + hi) / 2
        art.setdefault(team, {})[role] = {'d': path(loops), 'cx': round(float(c[0]), 1), 'cy': round(float(c[1]), 1),
                                          'r': round(float(np.hypot(*(pts - c).T).max()), 1)}
        sprite(team, loops).save(os.path.join(ROOT, 'src', 'lib', 'images', 'minions', f'{team}_{role}.png'), optimize=True)
        print(team, role, 'loops', len(loops), 'points', len(pts), 'path chars', len(art[team][role]['d']))
    with open(os.path.join(ROOT, 'src', 'lib', 'board', 'minionArt.ts'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// GENERATED by tools/minion_art.py from the minion STL models — do not edit by hand.\n')
        f.write('// Each emblem is the engraving on one model, as svg path data to fill with the EVEN-ODD rule.\n')
        f.write('// Units: the model\'s hex has its centre at 0,0 and its corners 100 away; the model\'s "up" is −y.\n')
        f.write('// `cx`,`cy`,`r`: the centre of the emblem\'s bounding box and the radius of the circle round it.\n')
        f.write("export type MinionTeam = 'orange' | 'blue'\nexport type MinionRole = 'melee' | 'ranged' | 'heavy'\n")
        f.write('export const MINION_ART: Record<MinionTeam, Record<MinionRole, { d: string; cx: number; cy: number; r: number }>> = {\n')
        for team in ('orange', 'blue'):
            f.write(f'\t{team}: {{\n')
            for role in ('melee', 'ranged', 'heavy'):
                a = art[team][role]
                f.write(f"\t\t{role}: {{ cx: {a['cx']:g}, cy: {a['cy']:g}, r: {a['r']:g}, d: '{a['d']}' }},\n")
            f.write('\t},\n')
        f.write('}\n')
