"""Gera trilhas próprias (sem direitos de terceiros) para os Reels.

Uso: python3 trilha.py <saida.wav> <duracao_s> <estilo> [inicios_das_cenas_separados_por_virgula]
Estilos:
  drive  - eletrônico 126 BPM: bumbo reto, palmas, chimbal, baixo pulsante com "pump", arpejo. Ousado e para frente.
  phonk  - 130 BPM meio-tempo: 808 pesado com glide, caixa seca, chimbal com rolls e melodia de cowbell. Agressivo.
  suave  - batida leve 112 BPM com acordes (estilo antigo).
Nas trocas de cena entra um "whoosh" + impacto grave, que marca o corte.
"""
import sys
import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def t_(n):
    return np.arange(n) / SR


def lp(x, cut):  # passa-baixa de 1 polo
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def hp(x, cut):
    return x - lp(x, cut)


def add(buf, sig, at):
    s = int(at * SR)
    if s >= len(buf) or s + len(sig) <= 0:
        return
    if s < 0:
        sig, s = sig[-s:], 0
    e = min(len(buf), s + len(sig))
    buf[s:e] += sig[: e - s]


def kick(dur=0.45, f0=150, f1=45, k=30, click=0.3):
    t = t_(int(dur * SR))
    f = f1 + (f0 - f1) * np.exp(-t * k)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) + click * rng.standard_normal(len(t)) * np.exp(-t * 400)


def clap(dur=0.25):
    n = int(dur * SR)
    t = t_(n)
    env = np.zeros(n)
    for d in (0, 0.011, 0.022):
        env += np.where(t >= d, np.exp(-(t - d) * 60), 0)
    env += 0.6 * np.exp(-t * 18)
    return hp(lp(rng.standard_normal(n), 3500), 900) * env


def snare(dur=0.22):
    t = t_(int(dur * SR))
    return 0.6 * hp(rng.standard_normal(len(t)), 1500) * np.exp(-t * 22) + 0.5 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30)


_HAT = hp(rng.standard_normal(int(0.4 * SR)), 7000)


def hat(open_=False):
    n = int((0.25 if open_ else 0.05) * SR)
    return _HAT[:n] * np.exp(-t_(n) * (14 if open_ else 90))


def saw(f, n):
    ph = np.cumsum(np.broadcast_to(f, (n,)) if np.ndim(f) else np.full(n, f)) / SR
    return 2 * (ph % 1) - 1


def cowbell(f, dur=0.28):
    t = t_(int(dur * SR))
    sq = lambda fr: np.sign(np.sin(2 * np.pi * fr * t))
    return lp(sq(f) + 0.8 * sq(f * 1.48), 2500) * np.exp(-t * 11)


def whoosh(dur=0.45):
    n = int(dur * SR)
    t = t_(n)
    noise = rng.standard_normal(n)
    # varredura: passa-baixa abrindo ao longo do tempo (aprox. por mistura de filtros)
    sweep = (t / dur)
    return (lp(noise, 600) * (1 - sweep) + hp(noise, 2000) * sweep) * (sweep ** 2) * 0.5


def boom():
    return kick(0.9, 90, 32, 6, 0.0) * 0.9


def note(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def drive(T, starts):
    bpm = 126
    b = 60 / bpm
    n = int(T * SR)
    drums, bass, synth = np.zeros(n), np.zeros(n), np.zeros(n)
    beats = int(T / b) + 1
    K = kick()
    for k in range(beats):
        at = k * b
        add(drums, K * 0.95, at)
        if k % 2 == 1:
            add(drums, clap() * 0.55, at)
        add(drums, hat(True) * 0.22, at + b / 2)
        for s in (0.25, 0.75):
            add(drums, hat() * 0.12, at + b * s)
    prog = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]  # Am F C G
    bar = 4 * b
    for i in range(int(T / bar) + 1):
        root, chord = prog[i % 4]
        for e in range(8):  # baixo em colcheias
            at = i * bar + e * b / 2
            m = int(0.22 * SR)
            tt = t_(m)
            f = note(root + (12 if e % 2 else 0))
            add(bass, lp(saw(f, m) + 0.5 * saw(f * 1.006, m), 900) * np.exp(-tt * 6) * 0.5, at)
        for s in range(16):  # arpejo em semicolcheias
            at = i * bar + s * b / 4
            m = int(0.12 * SR)
            tt = t_(m)
            f = note(chord[s % 3] + 12 * (s // 8))
            add(synth, lp(np.sign(np.sin(2 * np.pi * f * tt)), 3000) * np.exp(-tt * 25) * 0.10, at)
    # "pump" do bumbo (sidechain) no baixo e no synth
    tt = (np.arange(n) / SR) % b
    pump = 0.25 + 0.75 * np.minimum(1, tt / (b * 0.45))
    mix = drums + (bass + synth) * pump
    return mix, b


def phonk(T, starts):
    bpm = 130
    b = 60 / bpm
    n = int(T * SR)
    mix = np.zeros(n)
    bar = 4 * b
    K = kick(0.35, 170, 55, 40, 0.4)
    roots = [33, 33, 36, 31]  # A0 A0 C1 G0 (808)
    bell = [69, 72, 69, 76, 74, 72, 69, 67]
    for i in range(int(T / bar) + 1):
        base = i * bar
        for pos in (0, 1.5, 2.5):
            add(mix, K * 0.8, base + pos * b)
        add(mix, snare() * 0.7, base + 2 * b)  # caixa no meio-tempo
        for s in range(16):
            add(mix, hat() * (0.14 if s % 2 == 0 else 0.08), base + s * b / 4)
        if i % 2 == 1:  # roll de chimbal no fim da frase
            for r in range(6):
                add(mix, hat() * 0.1, base + 3.5 * b + r * b / 12)
        # 808 com glide
        m = int(bar * 0.95 * SR)
        tt = t_(m)
        f0, f1 = note(roots[i % 4] + 12), note(roots[(i + 1) % 4] + 12)
        f = np.where(tt < bar * 0.8, f0, f0 + (f1 - f0) * np.minimum(1, (tt - bar * 0.8) / 0.12))
        s808 = np.tanh(2.5 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-tt * 1.2)
        add(mix, s808 * 0.42, base)
        for k, mnote in enumerate(bell):  # melodia de cowbell em colcheias
            add(mix, cowbell(note(mnote)) * 0.16, base + k * b / 2)
    return mix, b


def suave(T, starts):
    bpm = 112
    b = 60 / bpm
    n = int(T * SR)
    y = np.zeros(n)
    K = kick(0.35, 145, 55, 28, 0.2)
    for k in range(int(T / b) + 1):
        add(y, K * 0.9, k * b)
        add(y, hat() * 0.12, (k + 0.5) * b)
    chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 207.65, 246.94]]
    bar = 4 * b
    for i in range(int(T / bar) + 1):
        m = int(bar * SR)
        tt = t_(m)
        env = np.minimum(1, tt / 0.4) * np.minimum(1, (bar - tt) / 0.4)
        add(y, sum(0.06 * np.sin(2 * np.pi * f * tt) for f in chords[i % 4]) * env, i * bar)
    return y, b


def main():
    out, T, style = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    starts = [float(x) for x in sys.argv[4].split(",")] if len(sys.argv) > 4 and sys.argv[4] else []
    mix, b = {"drive": drive, "phonk": phonk, "suave": suave}[style](T, starts)
    n = len(mix)
    if style != "suave":
        for s in starts[1:]:  # transições de cena
            add(mix, whoosh() * 0.6, s - 0.45)
            add(mix, boom() * 0.55, s)
    t = np.arange(n) / SR
    fade = np.minimum(1, np.minimum(t / 0.05, (T - t) / 0.8))
    mix = np.tanh(mix * 1.1) * fade
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.89
    import wave
    w = wave.open(out, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
    w.close()


if __name__ == "__main__":
    main()
