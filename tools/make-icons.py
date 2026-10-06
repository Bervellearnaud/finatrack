#!/usr/bin/env python3
# ==========================================================================
# FinaTrack CI — tools/make-icons.py
#
# Génère les icônes de l'application mobile (PWA + écran d'accueil iOS/Android)
# avec la BIBLIOTHÈQUE STANDARD uniquement (zlib + struct + math) : aucune
# dépendance à installer, sortie reproductible.
#
# Usage :
#     python3 tools/make-icons.py
#
# Fichiers produits dans assets/icons/ :
#     icon-32.png             favicon
#     icon-180.png            apple-touch-icon (iOS)
#     icon-192.png            Android / manifest
#     icon-512.png            Android / manifest (splash)
#     icon-512-maskable.png   Android adaptatif (plein cadre, safe zone 80 %)
#
# Identité : carré arrondi vert profond dégradé, motif géométrique discret
# (clin d'œil aux textiles africains), lettre F dorée, sobre et lisible
# jusqu'à 32 px.
# ==========================================================================

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "icons"

# --- Palette (identique aux variables CSS) --------------------------------
GREEN_DARK = (0x12, 0x3C, 0x32)
GREEN_LIGHT = (0x1E, 0x5A, 0x4A)
GREEN_DEEP = (0x0D, 0x2E, 0x26)
GOLD = (0xE7, 0xB8, 0x4B)
OCHRE = (0xD9, 0x8B, 0x39)
EARTH = (0xA9, 0x4A, 0x32)


# --------------------------------------------------------------------------
# Écriture PNG (RGBA 8 bits, sans perte)
# --------------------------------------------------------------------------
def write_png(path, pixels, width, height):
    """pixels : bytearray RGBA de longueur width*height*4."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)                      # filtre 0 (None) par ligne
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        payload = tag + data
        return (struct.pack(">I", len(data)) + payload +
                struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def blend(base, top, alpha):
    """Mélange deux couleurs RGBA (alpha de `top` multiplié par alpha)."""
    a = top[3] * alpha
    if a <= 0:
        return base
    out_a = a + base[3] * (1 - a)
    if out_a <= 0:
        return (0, 0, 0, 0.0)
    rgb = tuple(
        (top[i] * a + base[i] * base[3] * (1 - a)) / out_a for i in range(3)
    )
    return (rgb[0], rgb[1], rgb[2], out_a)


def rounded_rect_alpha(x, y, w, h, radius):
    """Couverture [0..1] d'un pixel dans un carré arrondi (bords anti-aliasés
    par la couverture des sous-échantillons)."""
    cx = min(max(x, radius), w - radius)
    cy = min(max(y, radius), h - radius)
    if radius <= 0:
        return 1.0 if (0 <= x < w and 0 <= y < h) else 0.0
    d = math.hypot(x - cx, y - cy)
    if d <= radius - 0.5:
        return 1.0
    if d >= radius + 0.5:
        return 0.0
    return radius + 0.5 - d


def in_letter_f(nx, ny):
    """Lettre F géométrique, coordonnées normalisées (0..1) dans sa boîte."""
    stem = nx <= 0.27 and ny <= 1.0
    top_bar = ny <= 0.23 and nx <= 1.0
    mid_bar = 0.42 <= ny <= 0.63 and nx <= 0.74
    return stem or top_bar or mid_bar


def in_kente(nx, ny):
    """Bandes diagonales discrètes (motif textile) en bas à droite."""
    band = (nx + ny) % 0.24
    return band < 0.035 and nx > 0.42 and ny > 0.42


def render(size, maskable=False, supersample=3):
    """Rend une icône en RGBA avec sur-échantillonnage (anti-aliasing)."""
    # Zone utile : une icône « maskable » doit remplir tout le carré et
    # garder son contenu dans les 80 % centraux (safe zone Android).
    pad = 0.0 if maskable else 0.0
    corner_radius = 0.0 if maskable else size * 0.225
    letter_scale = 0.44 if not maskable else 0.40
    letter_h = size * letter_scale
    letter_w = letter_h * 0.78
    letter_x0 = (size - letter_w) / 2
    letter_y0 = (size - letter_h) / 2 + size * 0.01

    pixels = bytearray(size * size * 4)
    step = 1.0 / supersample
    samples = supersample * supersample

    for py in range(size):
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(supersample):
                for sx in range(supersample):
                    x = px + (sx + 0.5) * step
                    y = py + (sy + 0.5) * step

                    # 1) Fond : carré arrondi + dégradé vertical
                    cov = rounded_rect_alpha(x, y, size, size, corner_radius)
                    if cov <= 0:
                        continue
                    t = y / size
                    base = (
                        GREEN_LIGHT[0] + (GREEN_DEEP[0] - GREEN_LIGHT[0]) * t,
                        GREEN_LIGHT[1] + (GREEN_DEEP[1] - GREEN_LIGHT[1]) * t,
                        GREEN_LIGHT[2] + (GREEN_DEEP[2] - GREEN_LIGHT[2]) * t,
                        cov,
                    )

                    nx = (x - pad) / size
                    ny = (y - pad) / size

                    # 2) Motif géométrique discret
                    if in_kente(nx, ny):
                        base = blend(base, (GOLD[0], GOLD[1], GOLD[2], 0.10), cov)

                    # 3) Halo doré en haut à droite
                    halo = max(0.0, 1.0 - math.hypot(nx - 0.82, ny - 0.16) / 0.55)
                    if halo > 0:
                        base = blend(base, (OCHRE[0], OCHRE[1], OCHRE[2], 0.16 * halo), cov)

                    # 4) Lettre F
                    if (letter_x0 <= x <= letter_x0 + letter_w and
                            letter_y0 <= y <= letter_y0 + letter_h):
                        lnx = (x - letter_x0) / letter_w
                        lny = (y - letter_y0) / letter_h
                        if in_letter_f(lnx, lny):
                            base = blend(base, (GOLD[0], GOLD[1], GOLD[2], 1.0), cov)

                    acc[0] += base[0] * base[3]
                    acc[1] += base[1] * base[3]
                    acc[2] += base[2] * base[3]
                    acc[3] += base[3]

            if acc[3] <= 0:
                continue
            r = acc[0] / acc[3]
            g = acc[1] / acc[3]
            b = acc[2] / acc[3]
            a = acc[3] / samples
            i = (py * size + px) * 4
            pixels[i] = int(round(min(255, max(0, r))))
            pixels[i + 1] = int(round(min(255, max(0, g))))
            pixels[i + 2] = int(round(min(255, max(0, b))))
            pixels[i + 3] = int(round(min(255, max(0, a * 255))))

    # Reflet discret en bas : rappelle l'arrondi et la palette terre
    for y in range(int(size * 0.86), int(size * 0.97)):
        for x in range(size):
            i = (y * size + x) * 4
            if pixels[i + 3] == 0:
                continue
            for c, value in enumerate(EARTH):
                pixels[i + c] = int(pixels[i + c] * 0.88 + value * 0.12)

    return pixels


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    jobs = [
        ("icon-32.png", 32, False, 3),
        ("icon-180.png", 180, False, 3),
        ("icon-192.png", 192, False, 3),
        ("icon-512.png", 512, False, 2),
        ("icon-512-maskable.png", 512, True, 2),
    ]

    for name, size, maskable, ss in jobs:
        pixels = render(size, maskable=maskable, supersample=ss)
        path = OUT_DIR / name
        write_png(path, pixels, size, size)
        print("  ✓ %-26s %4d×%-4d  %5.1f Ko" % (name, size, size, path.stat().st_size / 1024))

    # Vérification : signature PNG + dimensions lues dans l'en-tête IHDR
    for name, size, _m, _s in jobs:
        data = (OUT_DIR / name).read_bytes()
        assert data[:8] == b"\x89PNG\r\n\x1a\n", name + " : signature PNG invalide"
        w, h = struct.unpack(">II", data[16:24])
        assert (w, h) == (size, size), name + " : dimensions inattendues"
    print("\n%d icônes générées dans %s" % (len(jobs), OUT_DIR.relative_to(ROOT)))


if __name__ == "__main__":
    main()
