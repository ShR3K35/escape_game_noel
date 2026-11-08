---
name: cartes-mission
description: Génère un PDF A4 imprimable de cartes « Mission secrète » (format carte à jouer 63 × 88 mm, dos et face reliés par le bord long avec 1 mm d'espace, à plier) à partir d'une liste de missions et de leur difficulté (facile 1 pt, moyen 2 pts, difficile 3 pts). À utiliser quand l'utilisateur veut créer, imprimer ou mettre à jour des cartes de mission / missions secrètes / missions personnelles des joueurs.
---

# Cartes « Mission secrète »

Le script `generer.py` (dans ce dossier) produit un PDF A4 :

- chaque mission = une paire **dos | 1 mm | face**, chaque face mesurant exactement **63 × 88 mm** (carte à jouer) ;
- **3 paires par page**, autant de pages que nécessaire ; traits de coupe aux coins, repères de pliage en pointillés ;
- dos identique pour toutes les cartes ; la face porte le badge de difficulté, l'étiquette de points et le texte.

| Niveau | Badge | Points |
|---|---|---|
| `facile` (ou `1`) | ★ Facile, vert | 1 pt |
| `moyen` (ou `2`) | ★★ Moyen, ocre | 2 pts |
| `difficile` (ou `3`) | ★★★ Difficile, bordeaux | 3 pts |

Les accents et la casse des niveaux sont ignorés.

## Étapes

1. **Récupérer la liste** de missions de l'utilisateur (texte + niveau). Si un niveau manque, le demander ; ne pas
   l'inventer. Garder le texte des missions **mot pour mot** (seules les fautes évidentes peuvent être signalées).
2. **Écrire la liste** dans un fichier YAML de travail (par défaut `assets/missions.yaml`, ignoré par git), au format
   de `missions.exemple.yaml` :

   ```yaml
   missions:
     - niveau: facile
       texte: "Fais dire à ta cible « Ça dépend »."
   ```

   Formats aussi acceptés : `.json` (même structure) ou `.txt` avec une mission par ligne `niveau : texte`
   (`#` = commentaire). Pour 1 à 3 missions, on peut passer `--mission "facile: texte"` (répétable) sans fichier.
3. **Générer** depuis la racine du dépôt :

   ```bash
   uv run --with reportlab --with pillow --with pyyaml python .claude/skills/cartes-mission/generer.py \
     assets/missions.yaml -o assets/cartes-mission.pdf
   ```

   Code de sortie : `0` OK, `1` PDF écrit mais un texte déborde (numéros de cartes affichés : proposer un texte plus
   court à l'utilisateur et régénérer), `2` erreur de saisie (niveau inconnu, liste vide…).
4. **Vérifier** visuellement : rendre la ou les pages en PNG et les regarder.

   ```bash
   uv run --with pymupdf python -c "import pymupdf; d=pymupdf.open('assets/cartes-mission.pdf'); [p.get_pixmap(dpi=90).save(f'<scratchpad>/carte-p{i+1}.png') for i,p in enumerate(d)]"
   ```

5. **Livrer** le PDF (chemin absolu, et `SendUserFile` si disponible) en rappelant : imprimer à **100 %** (taille
   réelle), découper chaque paire d'un seul tenant, plier sur les pointillés, coller.

Le texte s'adapte automatiquement (14 pt max, 8 pt min, centré, espaces insécables avant `?!:;`, autour des
guillemets et après « à » / possessifs). Au-delà d'environ 25 mots, le texte risque de déborder.

## Ressources (`ressources/`)

- `dos.jpg`, `face-fond.jpg` : dos et fond de face (image 2:3, recadrée et ajustée en 63:88 par le script) ;
- `badge-{facile,moyen,difficile}.png`, `points-{1,2,3}.png` : badges et étiquettes, PNG transparents ;
- `polices/` : Merriweather Bold / ExtraBold (OFL, sous-ensemble latin) ;
- `design-reference.jpg` : maquette d'origine ; `visuels-jobs.json` : prompts ayant produit les visuels.

Tous les visuels ont été générés avec le skill `gpt-image`. Pour en changer l'apparence (autre style, nouveau
niveau…), utiliser **uniquement** le skill `gpt-image` en respectant le `CLAUDE.md` du projet (bridge lancé avec
`--cwd /home/alex/escape_noel/assets`, jamais `--overwrite`) :

```bash
# le bridge n'accepte que des fichiers dans assets/ : y copier le manifeste et la référence
cp .claude/skills/cartes-mission/ressources/{visuels-jobs.json,design-reference.jpg} assets/
# (éditer assets/visuels-jobs.json pour ne garder que les jobs voulus)
node ~/.claude/skills/gpt-image/scripts/gpt_image.mjs batch --cwd /home/alex/escape_noel/assets \
  --manifest visuels-jobs.json --concurrency 3
```

Les images arrivent dans `assets/cartes-mission/`. Ensuite, vérifier les images et les copier dans
`ressources/` sous le même nom (JPEG qualité 90 pour le dos/fond ; PNG transparent rogné à sa zone visible, ~700 px
max, pour les badges et étiquettes). Un nouveau niveau s'ajoute dans `LEVELS` (et `ALIASES`) de `generer.py`.
