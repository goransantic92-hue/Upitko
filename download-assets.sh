#!/usr/bin/env bash
set -e
BASE="https://api.getlayers.ai/storage/v1/object/public/public/assets/ascend-d9857ad1f2"
mkdir -p assets
echo "Preuzimanje originalnih 3D GLB i PNG asseta u ./assets ..."
curl -L "$BASE/planet.glb" -o assets/planet.glb
curl -L "$BASE/planet-lights.glb" -o assets/planet-lights.glb
curl -L "$BASE/planet-clouds.png" -o assets/planet-clouds.png
echo "Gotovo! Svi asseti su sačuvani u ./assets/"
