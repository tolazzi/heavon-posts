"""Gera a narração na voz clonada da Heavon (voz do usuário, autorizada — ver tools/voz/CONSENTIMENTO.md).

Roda no ambiente virtual da clonagem (/home/user/venv-voz), chamado pelo tools/reel.py:
  /home/user/venv-voz/bin/python tools/voz_clone.py <textos.json> <referencia.wav> <pasta_saida>
textos.json: lista de frases; gera <pasta_saida>/0.wav, 1.wav, ...
Modelo: Chatterbox Multilingual (Resemble AI, licença MIT). O áudio sai com marca d'água inaudível de IA (Perth).
"""
import json, os, sys
import soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

textos, ref, out = json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
m = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
for i, t in enumerate(textos):
    wav = m.generate(t, language_id="pt", audio_prompt_path=ref, exaggeration=0.5, cfg_weight=0.5)
    sf.write(os.path.join(out, f"{i}.wav"), wav.squeeze().numpy(), m.sr)
print("ok", len(textos))
