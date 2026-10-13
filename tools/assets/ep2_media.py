#!/usr/bin/env python3
"""Медиа эпизода 2 «Партнёры».

Создаёт в world/media/ep2/:
  yacht.jpg        — «фото» яхты на закате (сайт брокера, пост в «Ленте»)
  owner-card.jpg   — скан «Карточки владельца судна» из закрытого раздела сайта
                     брокера: владелец ООО «Альбатрос Марин», подпись доверенного лица «К.Л.»

Запуск из корня репозитория:  python3 tools/assets/ep2_media.py
Нужны только Pillow и numpy. Всё вымышлено.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "world", "media", "ep2")
FONTS = "/usr/share/fonts/truetype"


def font(name, size):
    for path in (
        os.path.join(FONTS, "liberation", name),
        os.path.join(FONTS, "dejavu", name),
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def yacht(path):
    w, h = 1200, 800
    rnd = np.random.default_rng(7)
    y = np.linspace(0, 1, h)[:, None]
    horizon = 0.58
    sky_top = np.array([22, 28, 58])
    sky_mid = np.array([196, 98, 70])
    sky_low = np.array([250, 196, 120])
    img = np.zeros((h, w, 3))
    t = np.clip(y / horizon, 0, 1)
    sky = np.where(t < 0.6, sky_top + (sky_mid - sky_top) * (t / 0.6), sky_mid + (sky_low - sky_mid) * ((t - 0.6) / 0.4))
    ts = np.clip((y - horizon) / (1 - horizon), 0, 1)
    sea = np.array([60, 52, 70]) + (np.array([14, 18, 34]) - np.array([60, 52, 70])) * ts
    rows = np.where(y > horizon, sea, sky)
    img[:] = rows[:, None, :]
    # солнечная дорожка
    xs = np.arange(w)[None, :]
    path_w = 40 + 260 * ts
    glow = np.exp(-((xs - 760) ** 2) / (2 * path_w ** 2)) * (rnd.random((h, w)) > 0.55) * (y > horizon)
    img += glow[:, :, None] * np.array([120, 80, 30])
    img += rnd.normal(0, 3, img.shape)
    im = Image.fromarray(np.clip(img, 0, 255).astype("uint8"))
    d = ImageDraw.Draw(im)
    # солнце
    d.ellipse((720, 400, 800, 480), fill=(255, 214, 150))
    hy = int(horizon * h)
    im.paste(Image.fromarray(np.clip(img, 0, 255).astype("uint8")).crop((0, hy, w, h)), (0, hy))
    # дальний берег с фортом
    d.polygon([(0, hy), (0, hy - 14), (140, hy - 18), (230, hy - 10), (330, hy - 6), (330, hy)], fill=(34, 30, 46))
    # корпус яхты
    hull = [(330, 560), (860, 560), (820, 600), (380, 604)]
    d.polygon(hull, fill=(18, 18, 26))
    d.polygon([(470, 560), (520, 532), (700, 532), (740, 560)], fill=(24, 24, 34))
    # мачта и паруса
    d.line((600, 532, 600, 190), fill=(20, 20, 28), width=6)
    d.polygon([(606, 200), (606, 526), (790, 526)], fill=(236, 214, 190))
    d.polygon([(594, 220), (594, 526), (420, 526)], fill=(214, 186, 160))
    d.line((600, 190, 860, 560), fill=(30, 30, 40), width=2)
    d.line((600, 190, 340, 560), fill=(30, 30, 40), width=2)
    # отражение
    refl = im.crop((330, 190, 860, 604)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(3))
    refl = Image.blend(im.crop((330, 604, 860, 604 + refl.height)), refl, 0.25)
    im.paste(refl, (330, 604))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(path, "JPEG", quality=86, optimize=True, progressive=True)


def owner_card(path):
    w, h = 1000, 1300
    rnd = random.Random(26)
    base = np.full((h, w, 3), (238, 233, 220), dtype=float)
    base += np.random.default_rng(3).normal(0, 6, (h, w, 1))
    yy = np.linspace(0, 1, h)[:, None, None]
    base -= 18 * (yy ** 2)
    im = Image.fromarray(np.clip(base, 0, 255).astype("uint8"))
    d = ImageDraw.Draw(im)
    ink = (34, 34, 48)
    serif_b = font("LiberationSerif-Bold.ttf", 34)
    serif = font("LiberationSerif-Regular.ttf", 26)
    small = font("LiberationSerif-Regular.ttf", 21)
    mono = font("LiberationMono-Regular.ttf", 22)

    d.text((w // 2, 90), "КАРТОЧКА ВЛАДЕЛЬЦА СУДНА", font=serif_b, fill=ink, anchor="mm")
    d.text((w // 2, 135), "форма брокера ООО «Ортов Яхтс» · для внутреннего пользования", font=small, fill=(80, 80, 90), anchor="mm")
    d.line((80, 170, w - 80, 170), fill=ink, width=2)

    rows = [
        ("Судно", "парусная яхта «АЛЬБАТРОС», 14,6 м"),
        ("Порт приписки", "Кронштадт"),
        ("Владелец", "ООО «Альбатрос Марин»"),
        ("ИНН владельца", "0078415507 (условный)"),
        ("Руководитель", "Ортов Г. А."),
        ("Фрахт", "сделка 26-118, код ШТИЛЬ"),
        ("В управлении с", "16.08.2026"),
    ]
    y = 220
    for k, v in rows:
        d.text((90, y), k + ":", font=serif, fill=(70, 70, 80))
        d.text((380, y), v, font=serif, fill=ink)
        d.line((380, y + 34, w - 90, y + 34), fill=(150, 150, 160), width=1)
        y += 70

    y += 20
    d.text((90, y), "Доверенное лицо владельца", font=serif_b, fill=ink)
    y += 50
    d.text((90, y), "(действует по доверенности № 7 от 12.06.2026;", font=small, fill=(70, 70, 80))
    d.text((90, y + 30), " ФИО — в приложении 2, в электронном виде не хранится)", font=small, fill=(70, 70, 80))
    y += 100
    d.text((90, y), "Подпись доверенного лица:", font=serif, fill=(70, 70, 80))
    d.line((440, y + 90, w - 120, y + 90), fill=(120, 120, 130), width=1)

    # «рукописная» подпись К.Л.
    sig = Image.new("RGBA", (420, 180), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sig)
    hand = font("LiberationSerif-Italic.ttf", 112)
    sd.text((20, 20), "К.Л.", font=hand, fill=(24, 46, 120, 235))
    pts = []
    for i in range(60):
        t = i / 59
        pts.append((150 + 250 * t, 150 - 26 * math.sin(t * math.pi * 1.4) + rnd.uniform(-1.5, 1.5)))
    sd.line(pts, fill=(24, 46, 120, 220), width=4, joint="curve")
    sig = sig.rotate(6, resample=Image.BICUBIC, expand=True).filter(ImageFilter.GaussianBlur(0.7))
    im.paste(sig, (470, y - 40), sig)

    # печать
    y2 = y + 170
    stamp = Image.new("RGBA", (260, 260), (0, 0, 0, 0))
    st = ImageDraw.Draw(stamp)
    col = (120, 40, 140, 150)
    st.ellipse((10, 10, 250, 250), outline=col, width=6)
    st.ellipse((40, 40, 220, 220), outline=col, width=3)
    st.text((130, 115), "АЛЬБАТРОС", font=font("LiberationSans-Bold.ttf", 28), fill=col, anchor="mm")
    st.text((130, 150), "МАРИН", font=font("LiberationSans-Bold.ttf", 28), fill=col, anchor="mm")
    st.text((130, 60), "ООО", font=font("LiberationSans-Regular.ttf", 22), fill=col, anchor="mm")
    st.text((130, 200), "КРОНШТАДТ", font=font("LiberationSans-Regular.ttf", 18), fill=col, anchor="mm")
    stamp = stamp.rotate(-14, resample=Image.BICUBIC)
    im.paste(stamp, (140, y2 - 40), stamp)

    d.text((w - 90, h - 90), "стр. 1 из 2", font=mono, fill=(110, 110, 120), anchor="rm")
    im = im.rotate(-0.8, resample=Image.BICUBIC, fillcolor=(40, 40, 44))
    im.convert("RGB").save(path, "JPEG", quality=84, optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    yacht(os.path.join(OUT, "yacht.jpg"))
    owner_card(os.path.join(OUT, "owner-card.jpg"))
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == "__main__":
    main()
