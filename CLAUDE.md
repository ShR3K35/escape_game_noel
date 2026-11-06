# Escape de Noël — instructions Claude Code

## Génération d'images (skill `gpt-image`)

- Générer et modifier les images uniquement via le skill `gpt-image` (Codex CLI connecté à ChatGPT Plus, outil `$imagegen` intégré).
- Ne jamais utiliser `OPENAI_API_KEY`, `codex login --with-api-key` ni l'API Images payante. Si la connexion Codex n'est pas « Logged in using ChatGPT », s'arrêter.
- Toujours lancer le bridge avec `--cwd /home/alex/escape_noel/assets` : les images sont enregistrées directement dans `assets/` et le sandbox Codex ne peut écrire que dans ce dossier.
- Passer `--out "<nom-descriptif>.png"` (chemin relatif à `assets/`). Ne jamais utiliser `--overwrite` : le script crée `-v2`, `-v3`… si le fichier existe.
- Pour un PNG transparent, utiliser `--background transparent` (le script rejette un PNG sans couche alpha).
- Pour modifier une image : `--mode edit --edit-target "<image>.png"` ; pour une retouche suivante, prendre la dernière image produite comme nouvel `--edit-target`.
- Les références (ex. `lutin_face.png`) se passent avec `--reference "<chemin>"`.
