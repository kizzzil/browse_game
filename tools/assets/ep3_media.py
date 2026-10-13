#!/usr/bin/env python3
"""Медиа эпизода 3 «Альбатрос».

Создаёт в world/media/ep3/:
  seskar-original.jpg — «оригинал» последнего фото Ортова: настоящий JPEG с EXIF.
                        GPS (IFD 0x8825): 60°01'42" N, 28°22'40" E — остров Сескар
                        (реальный остров в Финском заливе), DateTimeOriginal 2026:11:01 07:46:12,
                        OffsetTimeOriginal +03:00, GPS-время 04:46:12 UTC.
  seskar-dawn.jpg     — та же картинка, уменьшенная и БЕЗ метаданных (так «Лента» показывает фото в посте).
  efir-0358.wav       — перехват телеграфа (азбука Морзе), 16-bit PCM mono 8 кГц, тон 700 Гц, 16 WPM.
                        Текст (дважды): «LOTSMAN DE ALBATROS ZHDU 0800 U SEVERNOGO MYSA».

Запуск из корня репозитория:  python3 tools/assets/ep3_media.py
Нужны только Pillow и numpy. Всё вымышлено, кроме географии острова.
"""
import math
import os
import wave
from fractions import Fraction

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from PIL.TiffImagePlugin import IFDRational

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "world", "media", "ep3")

# --- точка съёмки: остров Сескар (центральная часть острова) ---
LAT = (60, 1, 42.0)   # 60.02833 N
LON = (28, 22, 40.0)  # 28.37778 E
TAKEN_LOCAL = "2026:11:01 07:46:12"
TAKEN_UTC_TIME = (4, 46, 12)
TAKEN_UTC_DATE = "2026:11:01"

MORSE_TEXT = "LOTSMAN DE ALBATROS ZHDU 0800 U SEVERNOGO MYSA"


# ---------------------------------------------------------------- фото
def dawn_photo():
    """Предрассветный залив с берега острова: маяк на мысу, на рейде — белый парусник."""
    w, h = 1600, 1067
    rng = np.random.default_rng(1101)
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    horizon = 0.60
    img = np.zeros((h, w, 3))

    # небо: от глубокого синего к оранжевой полосе зари у горизонта (восток справа)
    t = np.clip(y / horizon, 0, 1)
    top = np.array([18, 26, 52])
    mid = np.array([70, 78, 118])
    low = np.array([226, 140, 96])
    t1 = np.clip((t - 0.7) / 0.3, 0, 1)
    sky = np.where(t < 0.7, top + (mid - top) * (t / 0.7), mid + (low - mid) * t1 ** 1.4)  # (h, 3)
    sky = np.broadcast_to(sky[:, None, :], (h, w, 3)).copy()
    glow = np.exp(-((x - 0.78) ** 2) / 0.05 - ((y - horizon) ** 2) / 0.01)
    sky = sky + glow[..., None] * np.array([40, 22, 6])
    # море
    ts = np.clip((y - horizon) / (1 - horizon), 0, 1)
    sea = np.array([86, 80, 104]) + (np.array([16, 22, 38]) - np.array([86, 80, 104])) * ts ** 0.7
    ripples = (np.sin(y * 900 + np.sin(x * 40) * 3) * 0.5 + 0.5) * (y > horizon) * (1 - ts) * 10
    sea = np.broadcast_to(sea[:, None, :], (h, w, 3))
    img[:] = np.where((y > horizon)[..., None], sea, sky)
    img += ripples[..., None]
    # отблеск зари на воде
    refl = np.exp(-((x - 0.78) ** 2) / (0.002 + 0.03 * ts)) * (y > horizon) * (rng.random((h, w)) > 0.5)
    img += refl[..., None] * np.array([90, 50, 20]) * (1 - ts[..., None] * 0.6)
    img += rng.normal(0, 3.2, img.shape)
    im = Image.fromarray(np.clip(img, 0, 255).astype("uint8"))
    d = ImageDraw.Draw(im)
    hy = int(horizon * h)

    # редкие облака
    for cx, cy, rx, ry in ((300, 210, 260, 22), (620, 160, 200, 16), (1150, 260, 300, 20), (1350, 120, 160, 12)):
        cloud = Image.new("L", (w, h), 0)
        ImageDraw.Draw(cloud).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=70)
        cloud = cloud.filter(ImageFilter.GaussianBlur(14))
        im.paste((150, 120, 140), (0, 0), cloud)

    # дальний берег (горизонт)
    d.polygon([(980, hy), (1040, hy - 6), (1180, hy - 9), (1320, hy - 5), (1400, hy)], fill=(58, 52, 74))

    # белый парусник на якоре, без огней
    bx, by = 1120, hy + 46
    d.polygon([(bx - 48, by), (bx + 52, by), (bx + 40, by + 10), (bx - 38, by + 11)], fill=(214, 210, 214))
    d.line((bx, by, bx, by - 112), fill=(200, 196, 204), width=3)
    d.line((bx, by - 112, bx + 50, by), fill=(150, 146, 160), width=1)
    d.line((bx, by - 112, bx - 46, by), fill=(150, 146, 160), width=1)
    d.line((bx - 40, by + 12, bx + 40, by + 12), fill=(120, 110, 130), width=1)

    # мыс с маяком (слева), камни берега на переднем плане
    land = [(0, hy - 10), (90, hy - 30), (240, hy - 44), (380, hy - 36), (520, hy - 12), (600, hy + 4), (0, hy + 6)]
    d.polygon(land, fill=(24, 26, 34))
    for i in range(26):  # сосны на мысу
        px = 30 + i * 18 + int(rng.integers(-6, 6))
        ph = int(rng.integers(26, 64))
        base = hy - 30 - (12 if 120 < px < 400 else 0)
        d.polygon([(px - 9, base), (px, base - ph), (px + 9, base)], fill=(16, 20, 26))
    # башня маяка
    tx, tbase, ttop = 300, hy - 40, hy - 330
    d.polygon([(tx - 26, tbase), (tx - 15, ttop), (tx + 15, ttop), (tx + 26, tbase)], fill=(40, 40, 50))
    for k in range(5):
        yy = ttop + 30 + k * 56
        d.line((tx - 18 - k * 2, yy, tx + 18 + k * 2, yy), fill=(58, 56, 68), width=2)
    d.rectangle((tx - 22, ttop - 8, tx + 22, ttop), fill=(32, 32, 40))
    d.rectangle((tx - 13, ttop - 40, tx + 13, ttop - 8), fill=(60, 58, 64))
    d.polygon([(tx - 17, ttop - 40), (tx, ttop - 62), (tx + 17, ttop - 40)], fill=(30, 30, 38))
    # огонь маяка ещё горит
    lamp = Image.new("L", (w, h), 0)
    ImageDraw.Draw(lamp).ellipse((tx - 60, ttop - 84, tx + 60, ttop + 36), fill=200)
    lamp = lamp.filter(ImageFilter.GaussianBlur(26))
    im.paste((255, 236, 190), (0, 0), lamp)
    d.ellipse((tx - 8, ttop - 32, tx + 8, ttop - 16), fill=(255, 250, 230))

    # передний план — валуны и тёмная кромка берега
    fg = Image.new("L", (w, h), 0)
    fd = ImageDraw.Draw(fg)
    fd.polygon([(0, h), (0, h - 170), (260, h - 120), (520, h - 70), (900, h - 46), (1300, h - 60), (1600, h - 110), (1600, h)], fill=255)
    for cx, cy, r in ((180, h - 150, 70), (460, h - 90, 46), (980, h - 60, 54), (1420, h - 120, 80)):
        fd.ellipse((cx - r * 1.4, cy - r, cx + r * 1.4, cy + r), fill=255)
    fg = fg.filter(ImageFilter.GaussianBlur(2))
    im.paste((14, 15, 20), (0, 0), fg)

    im = im.filter(ImageFilter.GaussianBlur(0.7))
    # лёгкая виньетка
    arr = np.asarray(im).astype(float)
    vy, vx = np.mgrid[0:h, 0:w]
    vig = 1 - 0.35 * (((vx - w / 2) / (w / 2)) ** 2 + ((vy - h / 2) / (h / 2)) ** 2) / 2
    arr *= vig[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))


def rat(v):
    f = Fraction(v).limit_denominator(10000)
    return IFDRational(f.numerator, f.denominator)


def build_exif():
    exif = Image.Exif()
    exif[0x010F] = "Meridian"            # Make (вымышленный)
    exif[0x0110] = "Meridian M12 Pro"    # Model
    exif[0x0131] = "Meridian Camera 4.2"  # Software
    exif[0x0132] = TAKEN_LOCAL           # DateTime
    exif[0x0112] = 1                     # Orientation
    sub = exif.get_ifd(0x8769)           # Exif IFD
    sub[0x9003] = TAKEN_LOCAL            # DateTimeOriginal
    sub[0x9004] = TAKEN_LOCAL            # DateTimeDigitized
    sub[0x9011] = "+03:00"               # OffsetTimeOriginal
    sub[0x9010] = "+03:00"               # OffsetTime
    sub[0x829A] = rat(Fraction(1, 30))   # ExposureTime
    sub[0x829D] = rat(1.8)               # FNumber
    sub[0x8827] = 800                    # ISO
    sub[0x920A] = rat(5.6)               # FocalLength
    gps = exif.get_ifd(0x8825)           # GPSInfo IFD
    gps[0x0000] = b"\x02\x03\x00\x00"    # GPSVersionID 2.3.0.0
    gps[0x0001] = "N"
    gps[0x0002] = tuple(rat(v) for v in LAT)
    gps[0x0003] = "E"
    gps[0x0004] = tuple(rat(v) for v in LON)
    gps[0x0005] = 0                      # над уровнем моря
    gps[0x0006] = rat(6)
    gps[0x0007] = tuple(rat(v) for v in TAKEN_UTC_TIME)
    gps[0x001D] = TAKEN_UTC_DATE
    return exif


# ---------------------------------------------------------------- Морзе
MORSE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.", "H": "....",
    "I": "..", "J": ".---", "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---", "P": ".--.",
    "Q": "--.-", "R": ".-.", "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
    "Y": "-.--", "Z": "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
}


def morse_wav(path, text=MORSE_TEXT, wpm=16, freq=700, sr=8000, repeats=2):
    unit = 1.2 / wpm  # PARIS: точка = 1 ед., тире = 3, пауза в знаке = 1, между буквами = 3, между словами = 7
    on_off = []  # (is_tone, units)
    for rep in range(repeats):
        words = text.split()
        for wi, word in enumerate(words):
            for ci, ch in enumerate(word):
                code = MORSE[ch]
                for ei, el in enumerate(code):
                    on_off.append((True, 1 if el == "." else 3))
                    if ei < len(code) - 1:
                        on_off.append((False, 1))
                if ci < len(word) - 1:
                    on_off.append((False, 3))
            if wi < len(words) - 1:
                on_off.append((False, 7))
        if rep < repeats - 1:
            on_off.append((False, 40))  # длинная пауза между повторами (~3 с)
    lead = int(sr * 1.2)
    n = lead * 2 + sum(int(round(u * unit * sr)) for _, u in on_off)
    sig = np.zeros(n)
    pos = lead
    ramp = int(sr * 0.005)
    env_ramp = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, ramp))
    for tone, u in on_off:
        k = int(round(u * unit * sr))
        if tone:
            tt = np.arange(k) / sr
            s = np.sin(2 * math.pi * freq * (tt + pos / sr))
            env = np.ones(k)
            env[:ramp] = env_ramp
            env[-ramp:] = env_ramp[::-1]
            sig[pos:pos + k] = s * env * 0.55
        pos += k
    rng = np.random.default_rng(358)
    noise = rng.normal(0, 0.025, n)
    # медленное «дыхание» эфира
    fade = 1 + 0.08 * np.sin(np.arange(n) / sr * 2 * math.pi * 0.17)
    out = np.clip(sig * fade + noise, -1, 1)
    pcm = (out * 32767).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    return n / sr


def main():
    os.makedirs(OUT, exist_ok=True)
    photo = dawn_photo()
    photo.save(os.path.join(OUT, "seskar-original.jpg"), "JPEG", quality=90, exif=build_exif().tobytes())
    small = photo.resize((1080, int(1080 * photo.height / photo.width)), Image.LANCZOS)
    small.save(os.path.join(OUT, "seskar-dawn.jpg"), "JPEG", quality=82, optimize=True, progressive=True)
    dur = morse_wav(os.path.join(OUT, "efir-0358.wav"))
    print("wav seconds: %.1f" % dur)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == "__main__":
    main()
