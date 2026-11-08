#!/usr/bin/env python3
"""
FinaTrack CI — tools/make-mockups.py

Habille les captures réelles (mockups/bruts/) en visuels de présentation :
  · cadre téléphone (mobile)
  · fenêtre de navigateur (web / PC)
  · compositions duo, planches

Sortie : mockups/*.png

Dépendance : Pillow
"""
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "mockups" / "bruts"
OUT = ROOT / "mockups"

BG = (245, 239, 227)         # --background #F5EFE3
INK = (23, 32, 29)           # --text
MUTED = (94, 103, 97)        # --text-soft
DEEP = (18, 60, 50)          # --primary #123C32
GOLD = (231, 184, 75)        # --accent
OCHRE = (217, 139, 57)       # --secondary
EARTH = (169, 74, 50)        # --earth

FONT_DIR = pathlib.Path("/usr/share/fonts/truetype/dejavu")


def font(size, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(str(FONT_DIR / name), size)
    except Exception:
        return ImageFont.load_default()


def fit_text(draw, text, max_w, size, bold=True, floor=20):
    """Réduit la taille de police jusqu'à tenir dans max_w."""
    while size > floor:
        f = font(size, bold)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(floor, bold)


# ---------------------------------------------------------------- ombres
def shadow(canvas, box, radius, blur=26, opacity=70, offset=(0, 14)):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    d.rounded_rectangle((x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]),
                        radius=radius, fill=(17, 32, 27, opacity))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


# ---------------------------------------------------------------- cadres
def phone(screen_path, target_w=330, bezel=13, radius=52, pad=56):
    screen = Image.open(screen_path).convert("RGB")
    inner_w = target_w - bezel * 2
    screen = screen.resize((inner_w, int(screen.height * inner_w / screen.width)), Image.LANCZOS)

    h = screen.height + bezel * 2
    canvas = Image.new("RGBA", (target_w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    body = (pad, pad, pad + target_w, pad + h)
    shadow(canvas, body, radius, blur=24, opacity=84, offset=(0, 14))

    chassis = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    dc = ImageDraw.Draw(chassis)
    dc.rounded_rectangle(body, radius=radius, fill=(11, 17, 15, 255))
    dc.rounded_rectangle((body[0] + 2, body[1] + 2, body[2] - 2, body[3] - 2),
                         radius=radius - 2, outline=(62, 76, 70, 255), width=2)
    canvas.alpha_composite(chassis)

    mask = Image.new("L", screen.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, screen.width - 1, screen.height - 1),
                                           radius=radius - bezel, fill=255)
    canvas.paste(screen, (pad + bezel, pad + bezel), mask)

    dn = ImageDraw.Draw(canvas)
    nw, nh = int(inner_w * 0.30), 14
    nx = pad + bezel + (inner_w - nw) // 2
    dn.rounded_rectangle((nx, pad + bezel + 4, nx + nw, pad + bezel + 4 + nh),
                         radius=nh // 2, fill=(11, 17, 15, 255))
    return canvas


def browser(screen_path, target_w=1000, chrome_h=44, radius=14, pad=56):
    screen = Image.open(screen_path).convert("RGB")
    screen = screen.resize((target_w, int(screen.height * target_w / screen.width)), Image.LANCZOS)

    h = screen.height + chrome_h
    canvas = Image.new("RGBA", (target_w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    body = (pad, pad, pad + target_w, pad + h)
    shadow(canvas, body, radius, blur=28, opacity=76, offset=(0, 16))

    frame = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    df = ImageDraw.Draw(frame)
    df.rounded_rectangle(body, radius=radius, fill=(255, 255, 255, 255))
    df.rounded_rectangle((body[0], body[1], body[2], body[1] + chrome_h),
                         radius=radius, fill=(237, 232, 222, 255))
    df.rectangle((body[0], body[1] + chrome_h - radius, body[2], body[1] + chrome_h),
                 fill=(237, 232, 222, 255))
    canvas.alpha_composite(frame)

    d = ImageDraw.Draw(canvas)
    cy = pad + chrome_h // 2
    for i, col in enumerate([(226, 108, 92), GOLD, (110, 176, 132)]):
        cx = pad + 22 + i * 20
        d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=col)

    ax0, ax1 = pad + 94, pad + target_w - 22
    d.rounded_rectangle((ax0, cy - 12, ax1, cy + 12), radius=12, fill=(250, 247, 240))
    d.ellipse((ax0 + 12, cy - 5, ax0 + 22, cy + 5), outline=(150, 158, 152), width=2)
    d.text((ax0 + 32, cy - 8), "finnatrack.netlify.app", font=font(15, False), fill=MUTED)

    mask = Image.new("L", screen.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, screen.width - 1, screen.height - 1),
                                           radius=radius - 2, fill=255)
    canvas.paste(screen, (pad, pad + chrome_h), mask)
    return canvas


# ---------------------------------------------------------------- décor discret
def backdrop(w, h):
    """Fond crème avec un très léger halo ; frise géométrique uniquement en haut."""
    canvas = Image.new("RGBA", (w, h), BG + (255,))

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((int(w * 0.30), -int(h * 0.55), int(w * 1.05), int(h * 0.45)),
                                 fill=(30, 90, 74, 20))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))

    # frise bogolan très discrète, en haut à droite
    band = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    db = ImageDraw.Draw(band)
    step = 34
    for x in range(w - 26 * step, w, step):
        db.line((x, 34, x + step / 2, 12, x + step, 34), fill=DEEP + (26,), width=3)
        db.line((x, 52, x + step / 2, 30, x + step, 52), fill=EARTH + (20,), width=2)
    canvas.alpha_composite(band)
    return canvas


def paste(canvas, img, cx, cy):
    x, y = int(cx - img.width / 2), int(cy - img.height / 2)
    canvas.alpha_composite(img, (x, y))
    return (x, y, x + img.width, y + img.height)


def pill(d, x, y, text, color, size=17, fg=(255, 255, 255)):
    f = font(size)
    w = d.textlength(text, font=f) + 34
    d.rounded_rectangle((x, y, x + w, y + 34), radius=17, fill=color + (255,))
    d.text((x + 17, y + 8), text, font=f, fill=fg)
    return w


# ---------------------------------------------------------------- compositions
def duo(screen, title, subtitle, out, w=1920, h=1180, mobile_w=336, desktop_w=1016):
    canvas = backdrop(w, h)
    d = ImageDraw.Draw(canvas)

    pill(d, 80, 66, "FINATRACK CI", DEEP, size=16)
    f = fit_text(d, title, w - 160, 46, floor=30)
    d.text((80, 118), title, font=f, fill=DEEP)
    d.text((82, 118 + f.size + 16), subtitle, font=font(21, False), fill=MUTED)

    bw = pill(d, 80, 118 + f.size + 62, "Mobile", OCHRE, size=16)
    pill(d, 80 + bw + 10, 118 + f.size + 62, "Web / PC", DEEP, size=16)

    desk = browser(RAW / (screen + "-desktop.png"), target_w=desktop_w)
    ph = phone(RAW / (screen + "-mobile.png"), target_w=mobile_w)

    paste(canvas, desk, w * 0.60, h * 0.615)
    paste(canvas, ph, w * 0.205, h * 0.655)

    canvas.convert("RGB").save(out, optimize=True)
    print("  ✓", out.name)


def planche_mobile(items, out, cols=3, w=1820, phone_w=298):
    ph_h = None
    tmp = phone(RAW / (items[0][0] + "-mobile.png"), target_w=phone_w)
    ph_h = tmp.height
    cell_w = w // cols
    cell_h = ph_h + 74
    rows = (len(items) + cols - 1) // cols
    h = 190 + rows * cell_h + 40

    canvas = backdrop(w, h)
    d = ImageDraw.Draw(canvas)
    d.text((80, 70), "FinaTrack CI — Mobile", font=font(40), fill=DEEP)
    d.text((82, 132), "Application installable : barre de navigation basse, zones sûres respectées (390 × 844).",
           font=font(20, False), fill=MUTED)

    for i, (name, title) in enumerate(items):
        r, c = divmod(i, cols)
        cx = cell_w * c + cell_w // 2
        cy = 190 + r * cell_h + ph_h // 2
        paste(canvas, phone(RAW / (name + "-mobile.png"), target_w=phone_w), cx, cy)
        tw = d.textlength(title, font=font(21))
        d.text((cx - tw / 2, cy + ph_h // 2 + 12), title, font=font(21), fill=INK)

    canvas.convert("RGB").save(out, optimize=True)
    print("  ✓", out.name)


def planche_web(items, out, w=1860, browser_w=800):
    tmp = browser(RAW / (items[0][0] + "-desktop.png"), target_w=browser_w)
    bw_h = tmp.height
    cell_h = bw_h + 76
    rows = (len(items) + 1) // 2
    h = 190 + rows * cell_h + 40

    canvas = backdrop(w, h)
    d = ImageDraw.Draw(canvas)
    d.text((80, 70), "FinaTrack CI — Web / PC", font=font(40), fill=DEEP)
    d.text((82, 132), "Même application en mise en page large : barre latérale, cartes KPI, graphiques (1440 × 900).",
           font=font(20, False), fill=MUTED)

    for i, (name, title) in enumerate(items):
        r, c = divmod(i, 2)
        cx = (w // 2) * c + (w // 2) // 2
        cy = 190 + r * cell_h + bw_h // 2
        paste(canvas, browser(RAW / (name + "-desktop.png"), target_w=browser_w), cx, cy)
        tw = d.textlength(title, font=font(21))
        d.text((cx - tw / 2, cy + bw_h // 2 + 12), title, font=font(21), fill=INK)

    canvas.convert("RGB").save(out, optimize=True)
    print("  ✓", out.name)


def hero(screen, title, subtitle, out, w=1920, h=1080):
    """Bannière large 16:9 — réseaux sociaux, en-tête de page."""
    canvas = backdrop(w, h)
    d = ImageDraw.Draw(canvas)

    pill(d, 96, 96, "FINATRACK CI", DEEP, size=17, )
    longest = max(title.split("\n"), key=len)
    f = fit_text(d, longest, w * 0.335, 52, floor=32)
    d.multiline_text((96, 158), title, font=f, fill=DEEP, spacing=12)
    dy = 158 + f.size * title.count("\n") + f.size + 26
    d.multiline_text((98, dy), subtitle, font=font(22, False), fill=MUTED, spacing=10)

    py = dy + 22 * subtitle.count("\n") + 130
    pill(d, 96, py, "Installable", OCHRE, size=16)
    pill(d, 96 + 150, py, "Hors ligne", EARTH, size=16)
    pill(d, 96 + 288, py, "FCFA", DEEP, size=16)

    desk = browser(RAW / (screen + "-desktop.png"), target_w=930)
    ph = phone(RAW / (screen + "-mobile.png"), target_w=268)
    paste(canvas, desk, w * 0.685, h * 0.50)
    paste(canvas, ph, w * 0.795, h * 0.655)

    canvas.convert("RGB").save(out, optimize=True)
    print("  ✓", out.name)


def trio_mobile(items, out, w=1700, phone_w=380):
    tmp = phone(RAW / (items[0][0] + "-mobile.png"), target_w=phone_w)
    ph_h = tmp.height
    h = ph_h + 150
    canvas = backdrop(w, h)
    d = ImageDraw.Draw(canvas)

    for i, (name, title) in enumerate(items):
        cx = (w // 3) * i + (w // 3) // 2
        cy = 70 + ph_h // 2
        paste(canvas, phone(RAW / (name + "-mobile.png"), target_w=phone_w), cx, cy)
        tw = d.textlength(title, font=font(20))
        d.text((cx - tw / 2, cy + ph_h // 2 + 8), title, font=font(20), fill=INK)

    canvas.convert("RGB").save(out, optimize=True)
    print("  ✓", out.name)


def main():
    duo("dashboard", "Votre argent, clair comme de l'eau",
        "Un tableau de bord pensé pour Abidjan : solde réel, budget du mois, dépenses par catégorie.",
        OUT / "01-accueil-mobile-et-web.png")

    duo("transactions", "Toutes vos transactions",
        "Wave, Orange Money, MTN, espèces, banque : chaque mouvement classé et retrouvable.",
        OUT / "02-transactions-mobile-et-web.png")

    duo("budget", "Un budget qui tient le mois",
        "Définissez un plafond, suivez la consommation et le reste-à-vivre par jour.",
        OUT / "03-budget-mobile-et-web.png")

    duo("analyse", "Comprendre où va l'argent",
        "Répartition, tendance et comparaison entre moyens de paiement, mois par mois.",
        OUT / "04-analyses-mobile-et-web.png")

    duo("epargne", "Épargner, objectif par objectif",
        "Des paliers concrets : tontine, projets, imprévus, avec progression visible.",
        OUT / "05-epargne-mobile-et-web.png")

    duo("portefeuilles", "Tous vos portefeuilles au même endroit",
        "Espèces, mobile money, banque : le total réel, sans double comptage.",
        OUT / "06-portefeuilles-mobile-et-web.png")

    planche_mobile([
        ("dashboard", "Tableau de bord"),
        ("transactions", "Transactions"),
        ("budget", "Budget"),
        ("analyse", "Analyses"),
        ("epargne", "Épargne"),
        ("parametres", "Paramètres"),
    ], OUT / "07-planche-mobile.png")

    planche_web([
        ("dashboard", "Tableau de bord"),
        ("transactions", "Transactions"),
        ("budget", "Budget"),
        ("analyse", "Analyses"),
    ], OUT / "08-planche-web.png")

    hero("dashboard", "Votre argent,\nclair comme de l'eau",
         "Solde réel, budget du mois et dépenses classées —\npensé pour le quotidien à Abidjan.",
         OUT / "09-banniere.png")

    duo("connexion", "Se connecter en deux gestes",
        "Compte sécurisé par Supabase : e-mail ou lien magique, aucune donnée stockée en local.",
        OUT / "11-connexion-mobile-et-web.png")

    trio_mobile([
        ("dashboard", "Accueil"),
        ("budget", "Budget"),
        ("epargne", "Épargne"),
    ], OUT / "10-mobile-trio.png")


if __name__ == "__main__":
    main()
