#!/usr/bin/env bash
# Prepara a máquina para gerar os Reels (rode uma vez por máquina; é idempotente).
# Voz: Kokoro (Apache-2.0). Legenda: faster-whisper. Trilhas/efeitos: Mixkit (licença gratuita).
set -e
cd "$(dirname "$0")"
command -v espeak-ng >/dev/null || (apt-get update -qq && apt-get install -y -qq espeak-ng >/dev/null)
python3 -c "import kokoro_onnx, faster_whisper, soundfile" 2>/dev/null || pip install -q kokoro-onnx faster-whisper soundfile
mkdir -p voz
B=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[ -s voz/kokoro-v1.0.onnx ] || curl -sSfL -o voz/kokoro-v1.0.onnx "$B/kokoro-v1.0.onnx"
[ -s voz/voices-v1.0.bin ] || curl -sSfL -o voz/voices-v1.0.bin "$B/voices-v1.0.bin"
HF_HUB_DISABLE_XET=1 python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8', download_root='voz/whisper')" 2>/dev/null
bash audio/baixar.sh >/dev/null
echo "setup do Reels pronto"
