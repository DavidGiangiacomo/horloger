# L’horloger

Un jeu de construction horlogère : on pose des pignons sur une platine, ils tournent.
Ce dépôt contient le **MVP falsifiable** décrit au §14 du [design doc](docs/design-doc.md) :

- une platine, un ressort (barillet à 1 tour/s, 1,00 N·m), des pignons de 8 à 60 dents, une aiguille ;
- pas de boîtier, pas d’échappement, pas de commande, pas de progression ;
- **on pose des pignons et on les voit tourner**, avec la période en unités humaines et le couple visible.

Le test à faire passer : un joueur laissé seul cinq minutes cherche-t-il spontanément la période la plus longue ?

## Lancer

Aucune dépendance. Les modules ES exigent un serveur HTTP, pas `file://`.

```sh
npm start          # http://localhost:8080/
npm test           # géométrie, solveur, formats (node --test)
```

Node 20 ou plus récent. Desktop, souris obligatoire (le tactile n’est pas une cible).

## Jouer

- Glissez une pièce de l’inventaire sur la platine. Elle **s’accroche d’elle-même** à la distance d’engrènement d’un voisin, à l’intersection de deux voisins (roue partagée), ou sur un axe existant pour s’y superposer à l’étage au-dessus (pignon coaxial : c’est ainsi qu’on démultiplie).
- L’aiguille se pose sur n’importe quel axe ; la fiche affiche la durée d’un tour : `11,25 s`, `20 min 30 s`, `8 jours 3 h`, `un an`, `un siècle`…
- Le couple s’affiche sur chaque axe en épaisseur de trait, et en N·m dans l’infobulle.
- Deux dentures qui se chevauchent grippent tout ; deux chemins qui imposent des vitesses différentes à la même roue bloquent tout. Ce sont de vraies situations de jeu.
- Molette : zoom · fond glissé : déplacer · clic droit ou Suppr : retirer · Échap : annuler · bouton « Son » : un battement par dent sur les étages lents.
- Le mécanisme est sauvegardé localement et **tourne pendant l’absence** : l’angle de chaque roue est recalculé depuis l’horloge système au retour. Rien ne tourne en arrière-plan.

## Règles implémentées

| Règle | Où |
|---|---|
| Rayon primitif `r = m·z/2`, module 2 mm | `src/geometry.js` |
| Engrènement si `|d(A,B) − (r_A + r_B)| < ε`, même étage | `src/geometry.js` |
| Collision si les cercles de tête se chevauchent sans engrener | `src/geometry.js` |
| Denture en développante générée par `z`, mise en cache | `src/geometry.js` |
| Graphe résolu depuis la source : `ω × z_e/z_s`, couple `× z_s/z_e × η`, `η = 0,97` | `src/mechanism.js` |
| Cycles : deux chemins vers la même roue doivent donner la même vitesse | `src/mechanism.js` |
| Phase d’engrènement : une dent de A tombe dans un creux de B, sans saut au recalcul | `src/mechanism.js` |
| Résolution événementielle (à chaque pose), angles lus depuis l’horloge | `src/mechanism.js`, `src/render.js` |
| Période en unités humaines, couple en unités physiques | `src/format.js` |
| Accrochage automatique, étage choisi par le solveur | `src/editor.js` |

## Structure

```
index.html, styles.css   page unique : fiche en haut, platine, inventaire
src/geometry.js          rayons, engrènement, collisions, profils de denture
src/mechanism.js         solveur du graphe, phases, application au modèle
src/format.js            période, couple, vitesse, surface — en français
src/render.js            rendu SVG, zoom, fantôme de pose
src/editor.js            glisser-déposer, accrochage, retrait, aiguille
src/audio.js             battements par étage, grippage
src/store.js             sauvegarde locale
scripts/serve.js         serveur statique sans dépendance
test/                    tests unitaires (node --test)
docs/design-doc.md       le design doc
```

## Ce que le MVP laisse volontairement de côté

Boîtiers, commandes, échappements (couple minimal), réserve de marche, différentiels, étagère des mécanismes en service, argent et coût des pièces. Voir « À trancher ensuite » dans le design doc.
