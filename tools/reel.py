"""Gera o Reels da Heavon (1080x1920, MP4) com narração, legenda sincronizada e trilha.

Uso: HF_HUB_DISABLE_XET=1 python3 tools/reel.py posts/AAAA-MM-DD/reel/reel.json
Antes (uma vez por máquina): bash tools/setup_reel.sh

reel.json:
{
  "voice": "heavon",           # "heavon" = voz clonada do usuário (padrão desde 16/11); ou Kokoro: pm_alex, pm_santa, pf_dora
  (cada cena pode ter "voz_pron": texto só para a pronúncia, ex. "chat gê pê tê"; a legenda usa a fala reconhecida)
  "speed": 1.12,               # velocidade da fala (1.0 = normal)
  "music": 676,                # id da faixa em tools/audio/faixas.txt (padrão: escolhe pelo "mood")
  "mood": "tensao",            # tensao | grave | energia (usado se "music" não for dado)
  "scenes": [
    {"type":"hook","kicker":"Opinião impopular","title":"Texto com **destaque**","voz":"texto falado"},
    {"type":"point","n":"01","title":"...","voz":"..."},
    {"type":"versus","title":"...","left":"Antes","leftBody":"...","right":"Depois","rightBody":"...","voz":"..."},
    {"type":"noticia","source":"G1","date":"14/11","headline":"Manchete da notícia (até ~16 palavras)","voz":"..."},
    {"type":"dado","value":"66%","label":"do tráfego dos grandes e-commerces","source":"E-Commerce Brasil","voz":"..."},
    {"type":"lista","title":"...","items":["item 1","item 2","item 3"],"voz":"..."},
    {"type":"cta","title":"...","actions":["Comente","Salve","Siga"],"voz":"..."}
  ]
}
Toda cena aceita "broll": <id de vídeo da Mixkit> (vídeo de banco gratuito, licença comercial) usado de fundo,
e "source": texto de fonte exibido no rodapé da cena (ex.: "Fonte: G1, 14/11/2026").
A duração de cada cena vem da fala (sem acelerar o áudio). Gera reel.mp4 e cover.jpg na mesma pasta.
"""
import json, os, re, subprocess, sys, random
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
VOZ = os.path.join(HERE, "voz")
AUD = os.path.join(HERE, "audio")
SR = 48000


def run(*a, **k):
    return subprocess.run(a, check=True, capture_output=True, **k)


def to_sr(x, sr):  # reamostra para 48 kHz via ffmpeg
    p = run("ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
            "-f", "f32le", "-ar", str(SR), "-ac", "1", "-", input=x.astype(np.float32).tobytes())
    return np.frombuffer(p.stdout, np.float32).copy()


def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    a, b = max(0, idx[0] - int(0.02 * SR)), min(len(x), idx[-1] + int(0.06 * SR))
    return x[a:b]


def tracks():
    out = []
    for line in open(os.path.join(AUD, "faixas.txt"), encoding="utf-8"):
        if line.strip() and not line.startswith("#"):
            i, nome, clima = line.strip().split("|")
            out.append((int(i), nome, clima))
    return out


def music_segment(path, total):
    """lê a faixa e começa num trecho já com energia (pula introduções calmas)"""
    p = run("ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-")
    m = np.frombuffer(p.stdout, np.float32).copy()
    sec = SR // 2
    rms = np.array([np.sqrt(np.mean(m[i:i + sec] ** 2)) for i in range(0, len(m) - sec, sec)])
    target = np.percentile(rms, 75) * 0.8
    start = 0
    for k in range(len(rms) - 4):
        if rms[k:k + 4].min() >= target:
            start = k * sec
            break
    seg = m[start:start + int(total * SR)]
    if len(seg) < int(total * SR):
        seg = np.pad(seg, (0, int(total * SR) - len(seg)))
    n = len(seg)
    t = np.arange(n) / SR
    seg = seg * np.minimum(1, t / 0.25) * np.minimum(1, (total - t) / 1.2)
    return seg


def cut_times(scenes):
    """instantes de corte de imagem dentro das cenas (mesma regra usada no fundo)"""
    out = []
    for s in scenes:
        dur = s["end"] - s["start"]
        n = max(1, round(dur / 1.9))
        out += [round(s["start"] + j * dur / n, 3) for j in range(1, n)]
    return out


def broll_file(bid):
    """baixa (uma vez) o vídeo de banco da Mixkit; os arquivos não são versionados"""
    os.makedirs(os.path.join(AUD, "..", "broll"), exist_ok=True)
    f = os.path.join(HERE, "broll", f"mixkit-{bid}.mp4")
    if not os.path.exists(f):
        for q in ("1080", "720"):
            r = subprocess.run(["curl", "-sSfL", "-o", f, f"https://assets.mixkit.co/videos/{bid}/{bid}-{q}.mp4"])
            if r.returncode == 0:
                break
        else:
            raise RuntimeError(f"vídeo de banco {bid} indisponível")
    return f


def main(cfg_path):
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    d = os.path.dirname(cfg_path)
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(VOZ, "kokoro-v1.0.onnx"), os.path.join(VOZ, "voices-v1.0.bin"))
    voice, speed = cfg.get("voice", "heavon"), cfg.get("speed", 1.12)

    # 1) narração por cena; a cena dura o tempo da fala + respiro
    clips = []
    if voice == "heavon":  # voz clonada do usuário (autorizada), gerada no ambiente da clonagem
        ref = os.path.join(VOZ, "heavon_ref.wav")
        if not os.path.exists(ref):
            raise RuntimeError("referência da voz Heavon ausente (tools/voz/heavon_ref.wav)")
        import hashlib, shutil
        cache = os.path.join(VOZ, "cache")
        os.makedirs(cache, exist_ok=True)
        texts = [s.get("voz_pron", s["voz"]) for s in cfg["scenes"]]
        key = lambda t_: os.path.join(cache, hashlib.sha1(("heavon|" + t_).encode()).hexdigest() + ".wav")
        todo = [t_ for t_ in dict.fromkeys(texts) if not os.path.exists(key(t_))]
        if todo:  # só gera na voz clonada o que ainda não foi gerado antes
            tmpd = os.path.join(d, "_clone")
            tj = os.path.join(d, "_textos.json")
            json.dump(todo, open(tj, "w", encoding="utf-8"), ensure_ascii=False)
            run("/home/user/venv-voz/bin/python", os.path.join(HERE, "voz_clone.py"), tj, ref, tmpd,
                env=dict(os.environ, HF_HUB_DISABLE_XET="1"))
            for i, t_ in enumerate(todo):
                shutil.move(os.path.join(tmpd, f"{i}.wav"), key(t_))
            shutil.rmtree(tmpd); os.remove(tj)
        for t_ in texts:
            a, sr = sf.read(key(t_), dtype="float32")
            clips.append((a, sr))
    else:
        for s in cfg["scenes"]:
            a, sr = k.create(s.get("voz_pron", s["voz"]), voice=voice, speed=speed, lang="pt-br")
            clips.append((np.asarray(a), sr))
    narr, scenes, t = [], [], 0.25
    for i, s in enumerate(cfg["scenes"]):
        a, sr = clips[i]
        a = trim(to_sr(a, sr))
        gap = 1.4 if s.get("kind") == "end" else (0.9 if s.get("type", s.get("kind")) in ("cta", "cliff") else 0.28)
        dur = len(a) / SR + gap
        if i == 0:
            dur += 0.25
        scenes.append(dict(s, start=round(t - (0.25 if i == 0 else 0), 3), voice_at=t, end=round(t + len(a) / SR + gap, 3)))
        narr.append((t, a))
        t += len(a) / SR + gap
    total = round(t, 3)
    scenes[0]["start"] = 0.0
    voice_track = np.zeros(int(total * SR) + SR)
    for at, a in narr:
        s0 = int(at * SR)
        voice_track[s0:s0 + len(a)] += a
    voice_track = voice_track[: int(total * SR)]

    # 2) tempo de cada palavra (para a legenda) com reconhecimento de fala
    from faster_whisper import WhisperModel
    wm = WhisperModel("small", device="cpu", compute_type="int8", download_root=os.path.join(VOZ, "whisper"))
    a16 = run("ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
              "-f", "f32le", "-ar", "16000", "-ac", "1", "-", input=voice_track.astype(np.float32).tobytes()).stdout
    segs, _ = wm.transcribe(np.frombuffer(a16, np.float32), language="pt", word_timestamps=True,
                            initial_prompt=" ".join(s["voz"] for s in cfg["scenes"]))
    words = [dict(w=w.word.strip(), start=round(w.start, 3), end=round(w.end, 3)) for sg in segs for w in sg.words if w.word.strip()]

    # 3) voz tratada (limpa, presente, volume de streaming)
    vt = os.path.join(d, "_voz.wav")
    sf.write(vt, voice_track, SR)
    vp = os.path.join(d, "_vozp.wav")
    run("ffmpeg", "-y", "-loglevel", "error", "-i", vt, "-af",
        "highpass=f=80,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1:g=2.5,"
        "acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120:makeup=2", "-ar", str(SR), vp)

    # 4) trilha (Mixkit) + whoosh nas trocas de cena
    tr = tracks()
    mid = cfg.get("music")
    if not mid:
        opts = [t_ for t_ in tr if t_[2] == cfg.get("mood", "tensao")] or tr
        mid = random.Random(cfg_path).choice(opts)[0]
    mpath = os.path.join(AUD, f"mixkit-{mid}.mp3")
    mus = music_segment(mpath, total)
    sfx_path = os.path.join(AUD, "sfx-1492.mp3")
    if os.path.exists(sfx_path):
        sx = np.frombuffer(run("ffmpeg", "-loglevel", "error", "-i", sfx_path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-").stdout, np.float32)
        sx = sx / (np.abs(sx).max() + 1e-9) * 0.35
        for s in scenes[1:]:
            at = int(max(0, s["start"] - 0.25) * SR)
            mus[at:at + len(sx)] += sx[: max(0, len(mus) - at)]
    sfx2 = os.path.join(AUD, "sfx-1490.mp3")
    if os.path.exists(sfx2):  # swish leve em cada corte de imagem dentro da cena
        sw = np.frombuffer(run("ffmpeg", "-loglevel", "error", "-i", sfx2, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-").stdout, np.float32)
        sw = sw[: int(0.6 * SR)] / (np.abs(sw).max() + 1e-9) * 0.12
        for c in cut_times(scenes):
            at = int(max(0, c - 0.15) * SR)
            mus[at:at + len(sw)] += sw[: max(0, len(mus) - at)]
    mp = os.path.join(d, "_mus.wav")
    sf.write(mp, mus, SR)

    # 5) mixagem: música abaixa quando a voz entra; volume final -14 LUFS (padrão de redes sociais)
    mix = os.path.join(d, "_mix.wav")
    run("ffmpeg", "-y", "-loglevel", "error", "-i", vp, "-i", mp, "-filter_complex",
        "[1:a]volume=0.55[m];[0:a]asplit[v1][v2];[m][v1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md];"
        "[md][v2]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[o]",
        "-map", "[o]", "-ar", str(SR), mix)

    story = cfg.get("style") == "story"
    frames_dir = os.path.join(d, "_frames"); lst = bg = None; parts = []; cuts = []
    if not story:
        # 6) fundo com imagens reais (vídeos de banco da Mixkit), tratados com a cor da marca
        os.makedirs(frames_dir, exist_ok=True)
        # cortes frequentes: o fundo troca de imagem a cada ~1,5-2,2 s dentro da cena
        pool = [x for x in cfg.get("broll_pool", [])]
        rng = random.Random(cfg_path)
        parts, cuts, k_ = [], [], 0
        for i, s in enumerate(scenes):
            dur = s["end"] - s["start"]
            ids = s.get("broll") or []
            ids = ids if isinstance(ids, list) else [ids]
            ids = ids + [p_ for p_ in pool if p_ not in ids]
            n = max(1, round(dur / 1.9))
            seg = dur / n
            for j in range(n):
                part = os.path.join(d, f"_bg{k_}.mp4"); k_ += 1
                st = s["start"] + j * seg
                if j > 0:
                    cuts.append(round(st, 3))
                if ids:
                    bid = ids[j % len(ids)]
                    src = broll_file(bid)
                    clen = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src).stdout or 5)
                    off = rng.uniform(0.3, max(0.3, clen - seg - 0.3))
                    run("ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "-1", "-ss", f"{off:.2f}", "-i", src, "-t", f"{seg:.3f}",
                        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,"
                        "eq=saturation=0.7:brightness=-0.04:contrast=1.05,colorbalance=rs=0.08:bs=-0.06",
                        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", part)
                else:
                    run("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=0x050505:s=1080x1920:r=30:d={seg:.3f}",
                        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", part)
                parts.append(part)
        lst = os.path.join(d, "_bg.txt")
        open(lst, "w").write("".join(f"file '{os.path.abspath(p_)}'\n" for p_ in parts))
        bg = os.path.join(d, "_bg.mp4")
        run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", bg)
        run("ffmpeg", "-y", "-loglevel", "error", "-i", bg, "-vf", "fps=30", "-q:v", "3", os.path.join(frames_dir, "%05d.jpg"))

    # 7) vídeo
    tl = os.path.join(d, "_timeline.json")
    json.dump(dict(total=total, scenes=scenes, words=words, cuts=cuts, frames=os.path.abspath(frames_dir)), open(tl, "w", encoding="utf-8"), ensure_ascii=False)
    out = run("node", os.path.join(HERE, "story_render.js" if story else "reel_render.js"), tl, mix, os.path.join(d, "reel.mp4"), os.path.join(d, "cover.jpg"))
    print(out.stdout.decode().strip(), f"| voz {voice} x{speed} | trilha {mid} | {len(words)} palavras na legenda")
    import shutil
    for f in (vt, vp, mp, mix, tl, lst, bg, *parts):
        if f and os.path.exists(f):
            os.remove(f)
    shutil.rmtree(frames_dir, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1])
