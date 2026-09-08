# L'horloger — design doc

*Concept n°8 du document « Douze concepts de jeux incrémentaux ».*
*Format visé : **jeu à objectifs, 8 à 12 h**, multi-sessions, pas de prestige, hors-ligne oui (le mécanisme tourne). Références de cadrage : Opus Magnum et Zachtronics en général (le plaisir du mécanisme visible), Universal Paperclips (l'échelle finale), l'horlogerie réelle et l'horloge du Long Now (l'objectif de fin).*

---

## 0. Format et contraintes — pourquoi elles diffèrent

| Paramètre | Choix | Raison |
|---|---|---|
| Durée | **8–12 h**, par sessions libres | Ce n'est pas un jeu à arc narratif de trois heures : c'est un jeu de construction. Sa durée est celle des puzzles qu'il contient, et un joueur peut s'arrêter proprement après chaque boîtier. |
| Structure | **12 boîtiers** (niveaux), progression par objectifs | Le seul des douze qui n'est pas une trajectoire unique. Chaque boîtier est un problème d'espace et de couple, avec une solution à trouver. |
| Prestige | Aucun | Sans objet. Le rejouable ici est l'optimisation d'un boîtier déjà résolu, pas la répétition de la partie. |
| Hors ligne | **Oui, à 100 % et sans plafond** | C'est le seul concept où cela va de soi : un mécanisme d'horlogerie tourne quand personne ne regarde. Le refuser serait un contresens. |
| Plateforme | **Desktop, souris obligatoire** | Le jeu est spatial : glisser, poser, aligner. Le tactile est possible mais dégrade tout ; à traiter comme un portage, pas comme une cible. |
| Sauvegarde | Multiple, avec versions par boîtier | Convention de jeu de construction : on veut pouvoir revenir à une solution antérieure. |

**Contrainte fondatrice** : il n'y a **aucun nombre abstrait** dans ce jeu. Pas de « ×2,4 », pas de « +15 % ». Toute multiplication est un train d'engrenages visible, tout stockage est un ressort tendu, toute perte est un frottement. Si une grandeur ne peut pas être dessinée, elle n'existe pas.

---

## 1. Thèse

Un incrémental classique demande : *combien de multiplicateurs peux-tu empiler ?*
Celui-ci demande : *où vas-tu les mettre ?*

Trois inversions, toutes mécaniques :

- **Le multiplicateur est un objet.** Un rapport 3:1 est un pignon de 10 dents entraînant un pignon de 30. Il occupe de la place, il pèse, il frotte, il doit être relié.
- **Le couple se conserve.** C'est la vraie règle du jeu, et elle est physiquement exacte : un train d'engrenages qui multiplie la vitesse **divise le couple d'autant**. Empiler des multiplicateurs ne donne pas de la puissance, ça la répartit autrement. Il n'existe aucune ressource qui monte en flèche.
- **L'espace est fini.** Chaque boîtier a des dimensions, et la contrainte dominante n'est jamais le coût mais l'encombrement.

Ce qui monte, et c'est la seule chose : **la Période** — la durée d'un tour de l'aiguille de sortie. Elle part d'une seconde et finit à un siècle. Sur douze boîtiers, elle traverse neuf ordres de grandeur. **C'est l'exponentielle du genre, entièrement rendue en objets.**

---

## 2. Fiction

Un atelier, une fenêtre, un établi. Personne d'autre. Le joueur reçoit des commandes, écrites à la main, une par boîtier : une minuterie de cuisson, un compteur d'eau, un mouvement de clocher, un calendrier perpétuel, une horloge de marées, puis des choses de plus en plus longues.

Ce que la partie finit par établir : chaque commande demande une durée plus grande qu'une vie humaine antérieure, et les dernières demandent une durée plus grande qu'une civilisation. On ne dit jamais qui commande. Les fiches restent factuelles : dimensions, tolérance, période attendue.

Note de ton : atelier, pas laboratoire. Précis, chaleureux, professionnel. Le texte est très court — ~900 mots, essentiellement des fiches de commande.

---

## 3. Boucle de jeu

**Boucle courte (30 s – 3 min)** — Poser, engrener, essayer.

```
Prendre un pignon → le poser sur la platine
      ↓
Il engrène s'il est à la bonne distance (contrainte géométrique réelle)
      ↓
Le train tourne à l'écran, immédiatement, en temps réel
      ↓
Lire la période obtenue, le couple restant, la place restante
```

**Boucle moyenne (10–40 min)** — Résoudre un boîtier : atteindre la période demandée, avec le couple minimal disponible, dans l'espace donné, sous la tolérance exigée.

**Boucle longue (45–90 min)** — Un boîtier plus une **optimisation** : chaque boîtier résolu affiche trois scores (pièces utilisées, place occupée, écart de précision) et propose un objectif secondaire facultatif. C'est le mode « replay » du jeu, et il est optionnel.

---

## 4. Ressources

| Ressource | Rôle | Ordre de grandeur | Notation |
|---|---|---|---|
| **Couple** (C) | ce qui fait tourner, se conserve et se divise | de 1,0 N·m à 10⁻⁶ N·m | **unités physiques, jamais scientifique avant le boîtier 9** |
| **Place** (S) | surface libre de la platine | mm², affiché en grille | grille visible |
| **Période** (T) | durée d'un tour de sortie — **l'objectif** | 1 s → 3·10⁹ s (un siècle) | **en unités humaines : s, min, h, jours, ans** |
| **Énergie** (E) | ressort remonté ou poids levé | joules, se vide | jauge |
| **Pièces** | inventaire de pignons, arbres, échappements | ~40 types | unité |

**Règle structurante n°1 — conservation du couple.** `C_sortie = C_entrée × (r_entrée / r_sortie) × η`, avec `η ≈ 0,97` par étage. Vingt étages, et il ne reste que 54 % du couple. **Le frottement est la seule perte du jeu et il est incompressible** : les meilleurs pivots montent η à 0,993, jamais à 1.

**Règle structurante n°2 — l'espace prime sur le coût.** Les pièces s'achètent, mais l'argent cesse d'être une contrainte au boîtier 4. **À partir de là, le jeu n'est plus qu'un problème d'encombrement**, et c'est la vraie nature du concept.

**Règle structurante n°3 — la période est le seul compteur qui monte, et elle monte en unités humaines.** Le jeu n'écrit jamais `3,15·10⁷ s` mais `un an`. C'est ce qui rend l'échelle vertigineuse : `un jour`, `un mois`, `un an`, `un siècle` — quatre mots, neuf ordres de grandeur, et le joueur les ressent tous.

---

## 5. Les pièces (les générateurs, en vrai)

| Famille | Pièces | Rôle | Contrainte propre | Boîtier |
|---|---|---|---|---|
| **Moteurs** | ressort, poids, pendule, remontage automatique | fournissent C et E | occupent beaucoup de place | 1 |
| **Trains** | pignons 8 à 120 dents, roues, pignons doubles | multiplient / divisent | engrènement géométrique strict | 1 |
| **Transmission** | arbres, renvois d'angle, chaînes, cardans | déportent le mouvement | perte η supplémentaire | 2 |
| **Échappements** | ancre, cylindre, détente | régulent, transforment le continu en discret | exigent un couple **minimal** | 3 |
| **Réserves** | barillets, contre-poids, remontage | stockent E | volumineuses | 4 |
| **Compensations** | balancier bimétallique, tourbillon, correcteur de mois | annulent les dérives | très encombrantes, très précises | 7 |
| **Différentiels** | trains épicycloïdaux | combinent deux entrées | difficiles à placer | 8 |
| **Longue durée** | rubis, pivots céramiques, entretien automatique | montent η, réduisent l'usure | chers, minuscules | 10 |

Trois familles méritent un mot :

**Les échappements** introduisent la contrainte inverse de tout le reste : ils exigent un couple **minimum** pour fonctionner. Le joueur qui a démultiplié à outrance découvre que son mécanisme est trop faible pour battre. C'est le premier vrai problème de conception du jeu, au boîtier 3, et il enseigne la conservation du couple mieux que n'importe quel tutoriel.

**Les différentiels** (boîtier 8) permettent d'additionner deux mouvements. Ils ouvrent tout le jeu tardif — calendriers, équations du temps, corrections — et ils sont difficiles à caser. Chacun est un petit puzzle spatial à lui seul.

**Les pièces de longue durée** (boîtier 10) sont le seul endroit où le jeu redevient un incrémental classique dans son vocabulaire : on améliore η de 0,97 à 0,993. Sur trente étages, cela change tout, et c'est ce qui rend possibles les trois derniers boîtiers.

---

## 6. L'engrènement — la mécanique centrale

La règle est géométrique et non symbolique : deux pignons engrènent si la distance entre leurs axes vaut `(d₁ + d₂)/2 ± tolérance`. Il n'y a **pas de connexion logique** : il n'y a que des positions.

Conséquences directes, et c'est là que le jeu devient intéressant :

- Un rapport 1:1000 demande de la place, et cette place a une forme. Les joueurs découvrent d'eux-mêmes les solutions de l'horlogerie réelle : trains repliés, superposition sur plusieurs étages, pignons partagés entre deux trains.
- **Une même roue peut servir à deux trains** — c'est l'optimisation reine du jeu, et elle n'est jamais expliquée.
- Les collisions sont réelles : deux roues qui se chevauchent bloquent le mécanisme, avec un son de grippage et un arrêt immédiat.

**Le mécanisme tourne toujours, en temps réel, à l'écran.** Il n'y a pas de bouton « simuler ». On pose une pièce, elle se met à tourner. C'est la sensation centrale du jeu, et c'est aussi la meilleure capture d'écran possible pour en parler.

---

## 7. Les boîtiers (l'arbre de progression)

| # | Commande | Période visée | Contrainte dominante | Nouveauté |
|---|---|---|---|---|
| 1 | Minuterie de cuisson | 20 min | aucune (tutoriel) | trains simples |
| 2 | Compteur d'eau | 1 h | espace en L | renvois d'angle |
| 3 | Réveil d'atelier | 12 h | couple minimal | échappement |
| 4 | Horloge de cuisine | 24 h | autonomie 8 jours | réserve de marche |
| 5 | Mouvement de clocher | 24 h + sonnerie | deux sorties | second train |
| 6 | Horloge de marées | 12 h 25 min | **période non ronde** | rapports irrationnels approchés |
| 7 | Régulateur d'observatoire | 24 h, ±0,5 s/jour | précision | compensation thermique |
| 8 | Calendrier perpétuel | 4 ans | mois inégaux | différentiels |
| 9 | Horloge séculaire | 100 ans | 3·10⁹ s | trains très longs, η critique |
| 10 | Mouvement d'abbaye | 400 ans | entretien impossible | usure, rubis |
| 11 | Compteur de précession | ~26 000 ans | **la place devient absurde** | trains repliés obligatoires |
| 12 | **La commande** | voir §10 | tout | — |

Le boîtier 6 (marées) est le meilleur puzzle du lot : la période demandée n'est pas un multiple simple, il faut l'approcher par une fraction continue avec les dentures disponibles. C'est de l'arithmétique déguisée en horlogerie, et c'est exactement ce que faisaient les horlogers.

---

## 8. Le temps réel — ce qui rend ce jeu un incrémental

Un mécanisme validé **est mis en service** : il rejoint l'étagère de l'atelier et il tourne, en temps réel, y compris hors ligne, indéfiniment.

- L'étagère affiche les douze mécanismes en marche, chacun à sa vitesse propre.
- Le boîtier 9 (horloge séculaire) tournera pendant toute la vie de la sauvegarde et n'aura pas fait un tour. Le joueur peut revenir six mois plus tard : l'aiguille aura bougé d'un demi-degré. **Elle aura bougé.**
- Les mécanismes en service produisent une petite ressource passive (des commandes, donc de l'argent, donc des pièces), ce qui donne au jeu son fil incrémental — mais cette ressource est plafonnée et cesse d'être limitante au boîtier 4, comme dit en §4.

C'est le seul endroit du concept où l'idle est authentique : **le joueur ne laisse pas un compteur monter, il laisse un objet tourner.**

---

## 9. Courbes, invariants, rythme

### Rythme cible

| Phase | Boîtiers | Temps cumulé | Période atteinte | Pièces disponibles |
|---|---|---|---|---|
| Apprentissage | 1–3 | 0–1 h 30 | 12 h | 12 types |
| Métier | 4–6 | 1 h 30–4 h | 12 h 25 min | 22 types |
| Précision | 7–8 | 4 h–6 h 30 | 4 ans | 31 types |
| Durée | 9–11 | 6 h 30–10 h | 26 000 ans | 40 types |
| Fin | 12 | 10 h–11 h | — | — |

### Invariants d'équilibrage

- **I1** — **Aucun nombre abstrait.** Aucun multiplicateur qui ne soit un objet. Aucun pourcentage de bonus.
- **I2** — Le rendement η ne dépasse jamais 0,993 par étage. Il n'existe pas de mécanisme sans perte.
- **I3** — Chaque boîtier admet **au moins trois solutions structurellement différentes**. Un boîtier à solution unique est un boîtier raté et doit être re-conçu. C'est le critère de recette principal.
- **I4** — La contrainte dominante est l'espace à partir du boîtier 4, jamais l'argent.
- **I5** — **La période progresse d'environ un ordre de grandeur par boîtier**, et elle est toujours annoncée en unités humaines. C'est la seule courbe du jeu et le joueur la ressent dans les mots, pas dans les chiffres : `une journée`, puis `quatre ans`, puis `un siècle`, puis `vingt-six mille ans`.

### Hors-ligne

100 %, sans plafond, pour les mécanismes en service. Sans aucune justification à donner : c'est une horloge.

---

## 10. Arc — douze commandes

Le jeu n'a pas d'actes narratifs mais une **progression d'échelle**, et l'effet émotionnel vient entièrement de la durée demandée.

Les trois premières commandes sont des objets d'usage : on fait une minuterie, un compteur, un réveil. La quatrième et la cinquième sont des objets de métier. La sixième introduit une exigence bizarre. À partir de la neuvième, les fiches deviennent troublantes sans que rien ne soit dit : personne ne verra jamais fonctionner une horloge séculaire, et pourtant elle est commandée, avec des tolérances précises.

**La commande n°12** est une feuille sans période indiquée. À la place, une phrase : *« qu'elle tienne le plus longtemps possible ».* Il n'y a pas de cible, pas de validation, pas de réussite. Le joueur dispose de toutes les pièces et de la plus grande platine du jeu. Il construit ce qu'il veut, il le met en service, et le jeu calcule la durée avant la première défaillance — usure des pivots, épuisement de la réserve, dérive cumulée.

Le record est affiché en années. Les bonnes réponses tournent autour de 400 000 ans.

---

## 11. Fins

- **Mettre en service.** Le douzième mécanisme rejoint l'étagère. L'écran s'éloigne lentement de l'atelier : la fenêtre, la rue, puis rien. Le mécanisme continue de tourner dans un coin de l'écran, et **il continue réellement de tourner tant que la sauvegarde existe.**
- **Démonter.** Le joueur peut choisir de tout démonter, pièce par pièce, et de ranger l'atelier. Le jeu l'accepte sans commentaire. L'étagère se vide.

Pas de score global. Les scores existent par boîtier (pièces, place, précision) et ils sont **facultatifs**, jamais mis en avant sur l'écran principal.

**Épilogue (après *Mettre en service*)** — « L'inventaire de l'atelier » : la liste des douze mécanismes, avec pour chacun la date réelle de mise en service, le temps écoulé depuis, et l'angle parcouru par son aiguille de sortie. Le joueur qui rouvre son jeu un an plus tard verra ces chiffres avoir changé. Coût de production nul, effet durable.

---

## 12. Interface, son, production d'assets

**Écran unique** : la platine occupe 75 % de l'écran, l'inventaire de pièces 20 %, la fiche de commande 5 % en haut.

- **Zoom continu** et déplacement libre. Aux boîtiers 9 à 11, les trains sont si longs que la vue d'ensemble ne laisse plus distinguer les dents : c'est voulu et c'est beau.
- **Rendu vectoriel** — les dentures sont générées (développante de cercle), pas dessinées à la main. Un pignon de 47 dents est produit par la même fonction qu'un pignon de 8.
- **Le son est le second dispositif** : chaque étage a son battement, et un mécanisme complexe produit un rythme composite. Une erreur d'engrènement s'entend avant de se voir.

**Coût de production réel** : le plus **technique** des douze. Il faut une géométrie exacte (engrènement, collisions, propagation du couple dans un graphe pouvant contenir des cycles), un rendu fluide à 60 fps sur des centaines de pièces, et un éditeur de placement agréable — c'est ce dernier point qui décide de tout. En revanche : ~900 mots seulement, et aucun art à produire au sens classique. **Le budget du jeu est le moteur et l'ergonomie de pose.**

---

## 13. Risques

| | Risque | Réponse |
|---|---|---|
| R1 | **L'ergonomie de pose** — si poser un pignon est pénible, le jeu est mort à la dixième minute | C'est le vrai risque du projet. Réponse : accrochage automatique à la distance d'engrènement, rotation libre, pose en un glisser. À prototyper en premier, avant tout le reste |
| R2 | Le joueur ne comprend pas la conservation du couple | Le boîtier 3 (échappement) l'enseigne par l'échec, en trois minutes, sans texte. Et le couple est affiché sur chaque arbre, en épaisseur de trait |
| R3 | Performance sur les grands trains | Le rendu est indépendant de la simulation : le graphe se résout une fois par changement, pas par frame. Les pignons lents peuvent être animés à 12 fps sans que cela se voie |
| R4 | Ce n'est pas vraiment un incrémental | Assumé et documenté (§8). C'est un jeu de construction avec une boucle idle authentique. Il faut le dire dans la communication plutôt que de le déguiser |
| R5 | Portage tactile | Traité comme un portage ultérieur. Ne pas dégrader la version souris pour lui |

---

## 14. MVP falsifiable

Un week-end, une platine :

- Une source de couple (ressort), des pignons de 8 à 60 dents, un arbre de sortie avec aiguille.
- Pas de boîtier, pas d'échappement, pas de commande, pas de progression.
- **Obligatoire : poser des pignons et voir tourner**, avec la période affichée en unités humaines, et le couple restant visible.

**Le test** : est-ce qu'un joueur, laissé seul cinq minutes, essaie spontanément d'obtenir la période la plus longue possible ? S'il joue avec le mécanisme sans qu'on lui donne d'objectif, le concept tient. S'il attend qu'on lui dise quoi faire, l'ergonomie de pose est en cause (R1) et rien d'autre ne compte.

---

## 15. Notes d'implémentation

- Géométrie : rayon primitif `r = m·z/2` (module × nombre de dents). Engrènement si `|d(A,B) − (r_A + r_B)| < ε`. Tout le jeu tient dans cette ligne.
- Le mécanisme est un **graphe orienté** résolu par parcours depuis la source : vitesse multipliée par `z_entrée/z_sortie`, couple par l'inverse × η. Détection de cycles (deux chemins vers la même roue) : si les rapports sont incompatibles, le mécanisme est bloqué — et c'est une vraie situation de jeu, pas une erreur.
- Résolution **événementielle**, jamais par frame : on recalcule à chaque pose ou retrait.
- Les mécanismes en service sont stockés comme `{ graphe, période, t_mise_en_service }` ; leur position d'aiguille est calculée à l'affichage à partir de l'horloge système. Rien ne tourne en arrière-plan.
- Rendu SVG ou canvas ; les dentures en développante sont générées une fois par valeur de `z` et mises en cache.

---

## À trancher ensuite

1. **Prototyper l'ergonomie de pose (R1) avant toute autre décision.** Un week-end, et la réponse est binaire.
2. Faut-il un mode bac à sable dès le début, ou seulement après le boîtier 12 ? (Recommandation : dès le boîtier 4, comme onglet séparé.)
3. Concevoir les boîtiers 6 et 8 en détail — ce sont les deux vrais puzzles ; s'ils ne tiennent pas, le jeu retombe à cinq heures de contenu.
4. Décider si le boîtier 12 (durée libre) publie un classement. Il ferait beaucoup pour la visibilité, et un peu de mal à la fin.
