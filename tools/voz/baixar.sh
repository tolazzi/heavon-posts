#!/usr/bin/env bash
# Instala o Piper e baixa as vozes pt_BR (os modelos têm ~60 MB cada e não ficam no Git).
set -e
cd "$(dirname "$0")"
python3 -c "import piper" 2>/dev/null || pip install -q piper-tts
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR
for v in ${@:-faber cadu jeff}; do
  for e in onnx onnx.json; do
    [ -s "pt_BR-$v-medium.$e" ] || curl -sSfL -o "pt_BR-$v-medium.$e" "$B/$v/medium/pt_BR-$v-medium.$e"
  done
done
echo "vozes prontas"
