#!/usr/bin/env bash
# Baixa as faixas da Mixkit listadas em faixas.txt (não versionadas).
set -e
cd "$(dirname "$0")"
grep -v '^#' faixas.txt | while IFS='|' read -r id nome clima; do
  [ -z "$id" ] && continue
  [ -s "mixkit-$id.mp3" ] || curl -sSfL -o "mixkit-$id.mp3" "https://assets.mixkit.co/music/$id/$id.mp3"
done
for s in $(cat sfx.txt 2>/dev/null | grep -v '^#' | cut -d'|' -f1); do
  [ -s "sfx-$s.mp3" ] || curl -sSfL -o "sfx-$s.mp3" "https://assets.mixkit.co/active_storage/sfx/$s/$s-preview.mp3"
done
echo "trilhas prontas"
