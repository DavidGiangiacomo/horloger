# L’horloger

Un jeu de construction horlogère : on pose des pignons sur une platine, ils tournent.
Le [design doc](docs/design-doc.md) décrit douze boîtiers ; ce dépôt contient les **trois premiers**
(la phase « Apprentissage ») et l’**établi libre** du MVP (§14).

| # | Commande | Période | Contrainte | Nouveauté |
|---|---|---|---|---|
| 1 | Minuterie de cuisson | 20 min ± 2 % | aucune | trains simples, pignons coaxiaux |
| 2 | Compteur d’eau | 1 h ± 1 % | platine en L, arbre de sortie imposé | arbres de renvoi sous la platine |
| 3 | Réveil d’atelier | 12 h ± 0,5 % | couple minimal à l’ancre, réserve de 12 h | ressort libre, échappement |

Le boîtier 3 enseigne la conservation du couple par l’échec : un barillet trop lent tient la nuit
mais n’a plus assez de couple à l’ancre ; trop rapide, l’ancre bat mais le ressort ne tient pas la nuit.

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
- **Arbre de renvoi** : posez un bout, cliquez pour poser l’autre. Il passe sous la platine (et doit y rester), ses deux bouts sont des axes qui tournent ensemble, au prix de 10 % de perte.
- **Ressort libre et ancre** (boîtier 3) : sans ancre, le ressort s’emballe et se détend en quelques secondes. L’ancre se pose contre une roue du train et lui impose une dent par battement ; elle ne bat que si cette roue reçoit le couple minimal. Cliquez sur le barillet pour le remonter.
- La commande est honorée quand toutes les exigences de la fiche sont cochées ; les scores (pièces, place, écart) sont affichés, jamais imposés.
- Le mécanisme est sauvegardé localement, boîtier par boîtier, et **tourne pendant l’absence** : l’angle de chaque roue est recalculé depuis l’horloge système au retour, et le ressort s’est déroulé d’autant. Rien ne tourne en arrière-plan.

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
| Arbre de renvoi : deux axes liés, `η = 0,9` | `src/mechanism.js` |
| Ressort libre : vitesse fixée par l’ancre (`ω_roue = battements / z`), couple minimal, emballement, réserve en tours | `src/mechanism.js` |
| Platine en L : un disque doit tenir dans l’union des rectangles | `src/geometry.js` |
| Boîtiers, fiches, exigences, scores | `src/boitiers.js` |

## Structure

```
index.html, styles.css   page unique : fiche en haut, platine, inventaire
src/boitiers.js          les commandes : platines, fiches, exigences, scores
src/geometry.js          rayons, engrènement, collisions, forme de platine, profils de denture
src/mechanism.js         solveur du graphe, arbres, échappement, réserve, phases
src/format.js            période, couple, vitesse, surface — en français
src/render.js            rendu SVG, zoom, fantôme de pose
src/editor.js            glisser-déposer, accrochage, retrait, aiguille
src/audio.js             battements par étage, grippage
src/store.js             sauvegarde locale
scripts/serve.js         serveur statique sans dépendance
test/                    tests unitaires (node --test)
docs/design-doc.md       le design doc
```

## Ce qui reste à faire

Boîtiers 4 à 12 (réserve de marche de 8 jours, second train, périodes non rondes, compensation, différentiels…), l’étagère des mécanismes en service, l’argent et le coût des pièces. Voir « À trancher ensuite » dans le design doc.
