#!/usr/bin/env python3
"""Медиа эпизода 4 «Лоцман».

Создаёт в world/media/ep4/:
  otliv.wav       — «Отлив»: шум залива, в спектрограмме которого (2–8 кГц) написано слово ВЕРА.
                    Пост блога «Записки лоцмана» от 30.08.2026 (архивная копия в «Веб-Памяти»).
  priboy.wav      — «Прибой»: просто шум, без скрытого сообщения (честная ловушка, снимок 2025 г.).
  sonya-desk.jpg  — исходник кадра «весь вечер дома за чертежами»: стол в бюро, лист эллинга
                    (заказчик ООО «Альбатрос Марин»), настольные часы «СБ 12.09 · 16:40», дневной свет.
  protokol-4.jpg  — скан протокола №4 заседания правления БФ «Маяк» от 18.12.2025 с подписями:
                    у Лебедева — та же «К.Л.» с волной, что на карточке владельца яхты (эп.2).

Запуск из корня репозитория:  python3 tools/assets/ep4_media.py
Проверка спектрограммы:       python3 tools/assets/ep4_media.py --check <out.png>
Нужны только Pillow и numpy. Всё вымышлено.
"""
import math
import os
import random
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "world", "media", "ep4")
FONTS = "/usr/share/fonts/truetype"
SR = 22050


def font(name, size):
    for path in (
        os.path.join(FONTS, "liberation", name),
        os.path.join(FONTS, "dejavu", name),
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ---------------------------------------------------------------- звук

def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def surf(n, rng, level=0.22):
    """Шум залива: низкочастотный «прибой» с медленными накатами (основная энергия < 1,5 кГц)."""
    white = rng.normal(0, 1, n)
    spec = np.fft.rfft(white)
    f = np.fft.rfftfreq(n, 1 / SR)
    shape = 1 / (1 + (f / 350) ** 2)          # мягкий низкочастотный спад
    shape[f < 40] = 0
    low = np.fft.irfft(spec * shape, n)
    low /= np.max(np.abs(low)) + 1e-9
    t = np.arange(n) / SR
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 2.7 + 0.6) ** 2
    hiss = rng.normal(0, 1, n) * 0.012          # еле слышное шипение по всему спектру
    return level * low * swell + hiss


def word_mask(text, rows):
    """Битовая маска слова: строки — частоты (сверху высокие), столбцы — время."""
    f = font("DejaVuSans-Bold.ttf", 120)
    box = f.getbbox(text)
    w, h = box[2] - box[0] + 40, box[3] - box[1] + 30
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((20 - box[0], 15 - box[1]), text, font=f, fill=255)
    cols = int(w * rows / h)
    im = im.resize((cols, rows), Image.LANCZOS)
    return np.asarray(im, dtype=float) / 255.0


def otliv(path):
    rng = np.random.default_rng(830)
    dur = 6.0
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = surf(n, rng)

    rows = 64
    fmin, fmax = 2200.0, 7800.0
    mask = word_mask("ВЕРА", rows)                 # rows × cols
    cols = mask.shape[1]
    start, end = 0.8, 5.4                          # слово звучит с 0,8 по 5,4 с
    # Положение каждого отсчёта внутри маски (по времени) и плавная огибающая.
    pos = (t - start) / (end - start) * cols
    idx = np.clip(pos, 0, cols - 1)
    i0 = np.floor(idx).astype(int)
    i1 = np.minimum(i0 + 1, cols - 1)
    frac = idx - i0
    inside = (pos >= 0) & (pos <= cols)
    freqs = np.linspace(fmax, fmin, rows)          # строка 0 — верх буквы — высокая частота
    tone = np.zeros(n)
    for r in range(rows):
        m = mask[r]
        if m.max() < 0.05:
            continue
        env = (m[i0] * (1 - frac) + m[i1] * frac) * inside
        tone += env * np.sin(2 * np.pi * freqs[r] * t + rng.uniform(0, 2 * np.pi))
    tone /= np.max(np.abs(tone)) + 1e-9
    fade = np.minimum(1, np.minimum(t, dur - t) / 0.3)
    x = (x + 0.30 * tone) * fade
    x /= np.max(np.abs(x)) / 0.9
    write_wav(path, x)


def priboy(path):
    rng = np.random.default_rng(2025)
    dur = 4.0
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = surf(n, rng, 0.3) * np.minimum(1, np.minimum(t, dur - t) / 0.4)
    x /= np.max(np.abs(x)) / 0.85
    write_wav(path, x)


def spectrogram_png(wav_path, png_path):
    """Самопроверка: рисует спектрограмму (линейная шкала 0–11 кГц), как онлайн-спектрографы."""
    with wave.open(wav_path) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
    nfft, hop = 1024, 256
    win = np.hanning(nfft)
    frames = [np.abs(np.fft.rfft(x[i:i + nfft] * win)) for i in range(0, len(x) - nfft, hop)]
    s = 20 * np.log10(np.array(frames).T + 1e-6)
    s = np.clip((s - (s.max() - 70)) / 70, 0, 1)[::-1]
    im = Image.fromarray((s * 255).astype("uint8")).resize((900, 512))
    d = ImageDraw.Draw(im)
    for khz in (2, 4, 6, 8, 10):
        y = 512 - int(512 * khz * 1000 / (sr / 2))
        d.line((0, y, 12, y), fill=255)
        d.text((14, y - 6), f"{khz} kHz", fill=255)
    im.save(png_path)


# ---------------------------------------------------------------- кадр со стола

def sonya_desk(path):
    W = H = 1200
    rng = np.random.default_rng(912)
    yy, xx = np.mgrid[0:H, 0:W]
    # стол: светлое дерево с волокнами
    grain = np.sin(xx / 7.0 + 3 * np.sin(yy / 90.0)) * 6 + rng.normal(0, 4, (H, W))
    base = np.stack([186 + grain, 150 + grain * 0.8, 112 + grain * 0.6], axis=-1)
    # дневной свет из окна слева сверху
    light = np.exp(-(((xx - 80) / 700.0) ** 2 + ((yy - 60) / 600.0) ** 2))
    base = base * (0.78 + 0.38 * light[..., None])
    im = Image.fromarray(np.clip(base, 0, 255).astype("uint8")).convert("RGBA")

    # лист-чертёж (синька) на отдельном слое, потом повернём
    sw, sh = 860, 640
    sheet = Image.new("RGBA", (sw, sh), (29, 53, 87, 255))
    sd = ImageDraw.Draw(sheet)
    grid = (69, 123, 157, 255)
    for gx in range(0, sw, 40):
        sd.line((gx, 0, gx, sh), fill=grid, width=1)
    for gy in range(0, sh, 40):
        sd.line((0, gy, sw, gy), fill=grid, width=1)
    sd.rectangle((14, 14, sw - 14, sh - 14), outline=(230, 240, 250, 255), width=3)
    white = (236, 244, 252, 255)
    # фасад эллинга: двускатная крыша, ворота, вода
    sd.line((90, 420, 520, 420), fill=white, width=3)
    sd.line((110, 420, 110, 250), fill=white, width=3)
    sd.line((500, 420, 500, 250), fill=white, width=3)
    sd.line((90, 260, 305, 120), fill=white, width=3)
    sd.line((305, 120, 520, 260), fill=white, width=3)
    sd.rectangle((200, 280, 410, 420), outline=white, width=3)
    for k in range(6):
        sd.line((200, 300 + k * 20, 410, 300 + k * 20), fill=(200, 220, 240, 255), width=1)
    for k in range(4):
        y = 440 + k * 16
        pts = [(80 + i * 10, y + 4 * math.sin(i / 2.0 + k)) for i in range(46)]
        sd.line(pts, fill=(170, 200, 230, 255), width=2)
    sd.line((110, 470, 500, 470), fill=white, width=1)
    sd.text((305, 478), "14 600", font=font("DejaVuSans.ttf", 18), fill=white, anchor="ma")
    sd.text((40, 40), "ФАСАД 1–5  М 1:100", font=font("DejaVuSans-Bold.ttf", 22), fill=white)
    # штамп (основная надпись) в правом нижнем углу
    bx, by = 500, 420
    sd.rectangle((bx, by, sw - 24, sh - 24), outline=white, width=2)
    rows = [
        ("Объект", "Эллинг, Лисий Нос"),
        ("Заказчик", "ООО «Альбатрос Марин»"),
        ("ГАП", "Лебедев К.А."),
        ("Дата", "12.09.26"),
        ("Лист", "3 из 7"),
    ]
    f_small = font("DejaVuSans.ttf", 15)
    f_val = font("DejaVuSans-Bold.ttf", 15)
    y = by + 10
    for k, v in rows:
        sd.text((bx + 10, y), k, font=f_small, fill=(200, 220, 240, 255))
        sd.text((bx + 96, y), v, font=f_val, fill=white)
        y += 34
        sd.line((bx, y - 8, sw - 24, y - 8), fill=(150, 180, 210, 255), width=1)
    sd.line((bx + 88, by, bx + 88, sh - 24), fill=(150, 180, 210, 255), width=1)
    sheet = sheet.rotate(-4, resample=Image.BICUBIC, expand=True)
    shadow = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    shadow.paste((40, 25, 10, 110), (0, 0), sheet.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    im.alpha_composite(shadow, (110, 300))
    im.alpha_composite(sheet, (90, 280))

    d = ImageDraw.Draw(im)
    # прозрачный угольник поверх листа (как 📐)
    tri = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(tri)
    td.polygon([(640, 360), (640, 700), (900, 700)], fill=(255, 225, 120, 70), outline=(240, 200, 90, 200))
    td.polygon([(680, 470), (680, 660), (800, 660)], fill=(0, 0, 0, 0), outline=(240, 200, 90, 160))
    im.alpha_composite(tri)

    # кружка кофе
    d.ellipse((990, 990, 1170, 1170), fill=(245, 245, 240), outline=(200, 200, 195), width=4)
    d.ellipse((1013, 1013, 1147, 1147), fill=(92, 58, 34))
    d.ellipse((1058, 1048, 1098, 1073), fill=(150, 110, 75))
    # карандаш
    d.line((120, 1080, 520, 1010), fill=(232, 170, 40), width=16)
    d.polygon([(520, 1002), (520, 1018), (556, 1004)], fill=(225, 200, 160))

    # настольные часы справа сверху: «СБ 12.09» и «16:40»
    cx, cy = 880, 90
    d.rounded_rectangle((cx, cy, cx + 260, cy + 150), radius=16, fill=(28, 28, 30), outline=(80, 80, 84), width=4)
    d.rounded_rectangle((cx + 16, cy + 16, cx + 244, cy + 134), radius=8, fill=(10, 14, 12))
    led = (120, 255, 150)
    d.text((cx + 130, cy + 40), "СБ 12.09", font=font("DejaVuSansMono-Bold.ttf", 24), fill=(90, 200, 120), anchor="mm")
    d.text((cx + 130, cy + 92), "16:40", font=font("DejaVuSansMono-Bold.ttf", 58), fill=led, anchor="mm")

    # полоса солнца из окна (дневной свет) — косой светлый блик
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.polygon([(0, 0), (380, 0), (900, 1200), (520, 1200)], fill=(255, 246, 214, 46))
    gd.polygon([(430, 0), (520, 0), (1040, 1200), (950, 1200)], fill=(255, 246, 214, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    im.alpha_composite(glow)

    out = im.convert("RGB")
    arr = np.asarray(out).astype(float)
    r = np.sqrt(((xx - W / 2) / (W / 1.3)) ** 2 + ((yy - H / 2) / (H / 1.3)) ** 2)
    arr *= (1 - 0.35 * np.clip(r, 0, 1) ** 2)[..., None]
    arr += rng.normal(0, 2.5, arr.shape)
    Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).save(path, quality=88)


# ---------------------------------------------------------------- протокол правления

def sig_kl_wave(rnd):
    """Подпись К.Л. с волной — тот же почерк, что на карточке владельца «Альбатроса» (эп.2)."""
    sig = Image.new("RGBA", (420, 180), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sig)
    sd.text((20, 20), "К.Л.", font=font("LiberationSerif-Italic.ttf", 112), fill=(24, 46, 120, 235))
    pts = []
    for i in range(60):
        t = i / 59
        pts.append((150 + 250 * t, 150 - 26 * math.sin(t * math.pi * 1.4) + rnd.uniform(-1.5, 1.5)))
    sd.line(pts, fill=(24, 46, 120, 220), width=4, joint="curve")
    return sig.rotate(6, resample=Image.BICUBIC, expand=True).filter(ImageFilter.GaussianBlur(0.7))


def sig_kl_straight():
    """Подпись Лаптевой: тоже «К.Л.», но прямые печатные буквы и две ровные черты."""
    sig = Image.new("RGBA", (420, 180), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sig)
    col = (20, 20, 30, 230)
    sd.text((40, 30), "К.Л.", font=font("DejaVuSans-Bold.ttf", 84), fill=col)
    sd.line((30, 140, 330, 140), fill=col, width=3)
    sd.line((60, 152, 300, 152), fill=col, width=3)
    return sig.rotate(-2, resample=Image.BICUBIC, expand=True).filter(ImageFilter.GaussianBlur(0.6))


def sig_word(text, size, col, angle, loop=False):
    sig = Image.new("RGBA", (460, 180), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sig)
    sd.text((20, 30), text, font=font("LiberationSerif-Italic.ttf", size), fill=col)
    if loop:
        sd.arc((240, 70, 400, 150), 200, 520, fill=col, width=3)
    else:
        sd.line((20, 140, 380, 128), fill=col, width=3)
    return sig.rotate(angle, resample=Image.BICUBIC, expand=True).filter(ImageFilter.GaussianBlur(0.6))


def protokol(path):
    w, h = 1000, 1480
    rnd = random.Random(26)
    base = np.ones((h, w, 3)) * np.array([241, 238, 228])
    base += np.random.default_rng(1218).normal(0, 5, (h, w, 1))
    im = Image.fromarray(np.clip(base, 0, 255).astype("uint8")).convert("RGBA")
    d = ImageDraw.Draw(im)
    ink = (30, 30, 40)
    grey = (80, 80, 90)
    sb = font("LiberationSerif-Bold.ttf", 30)
    sr = font("LiberationSerif-Regular.ttf", 23)
    ss = font("LiberationSerif-Regular.ttf", 20)

    d.text((w // 2, 80), "БЛАГОТВОРИТЕЛЬНЫЙ ФОНД «МАЯК»", font=sb, fill=ink, anchor="mm")
    d.text((w // 2, 125), "ПРОТОКОЛ № 4", font=sb, fill=ink, anchor="mm")
    d.text((w // 2, 162), "заседания правления · г. Санкт-Петербург · 18 декабря 2025 г.", font=ss, fill=grey, anchor="mm")
    d.line((80, 190, w - 80, 190), fill=ink, width=2)

    lines = [
        "Присутствовали: члены правления Лузин К.Р. (председатель),",
        "Лебедев К.А., Лаптева К.В.; финансовый директор Сомова В.Н. (секретарь).",
        "",
        "1. Одобрить архитектурный проект нового корпуса фонда",
        "   (автор проекта — член правления Лебедев К.А.).",
        "2. Утвердить предварительную смету строительства корпуса.",
        "3. Выдать члену правления Лебедеву К.А. корпоративную",
        "   банковскую карту фонда для расходов по строительству.",
        "4. Поручить финансовому директору Сомовой В.Н. подготовить",
        "   договоры с консультантами на 2026 год.",
        "",
        "Решения приняты единогласно.",
    ]
    y = 220
    for ln in lines:
        d.text((90, y), ln, font=sr, fill=ink)
        y += 36

    y += 30
    d.text((90, y), "Подписи:", font=font("LiberationSerif-Bold.ttf", 26), fill=ink)
    y += 40
    people = [
        ("Председатель правления", "Лузин К.Р.", sig_word("Лузин", 74, (40, 40, 60, 230), 3, loop=True)),
        ("Член правления", "Лаптева К.В.", sig_kl_straight()),
        ("Член правления", "Лебедев К.А.", sig_kl_wave(rnd)),
        ("Секретарь", "Сомова В.Н.", sig_word("ВСомова", 66, (120, 20, 30, 220), -3)),
    ]
    row_h = 175
    for role, name, sig in people:
        d.text((90, y + 20), role, font=ss, fill=grey)
        d.text((90, y + 52), name, font=font("LiberationSerif-Bold.ttf", 26), fill=ink)
        d.line((420, y + 120, w - 90, y + 120), fill=(120, 120, 130), width=1)
        s = sig.copy()
        s.thumbnail((380, 170))
        im.alpha_composite(s, (470, y - 20))
        y += row_h

    d.text((w - 90, h - 50), "стр. 1 из 1", font=font("LiberationMono-Regular.ttf", 20), fill=grey, anchor="rm")
    out = im.convert("RGB").rotate(0.6, resample=Image.BICUBIC, fillcolor=(40, 40, 44))
    out.save(path, quality=88)


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--check":
        spectrogram_png(os.path.join(OUT, "otliv.wav"), sys.argv[2])
        return
    os.makedirs(OUT, exist_ok=True)
    otliv(os.path.join(OUT, "otliv.wav"))
    priboy(os.path.join(OUT, "priboy.wav"))
    sonya_desk(os.path.join(OUT, "sonya-desk.jpg"))
    protokol(os.path.join(OUT, "protokol-4.jpg"))
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == "__main__":
    main()
