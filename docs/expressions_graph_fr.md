# Manuel rapide: expressions "graph"

Ce guide decrit les fonctions "graph" disponibles dans les expressions utilisees
par les regles de style, les pie charts et les champs personnalises.

## Fonctions graph

- `degree()`  
  Nombre de voisins uniques du noeud courant.

- `linkCount()`  
  Nombre de liens incident au noeud courant (compte les liens multiples).

- `hasNeighbor("expr")`  
  Vrai si au moins un voisin satisfait l'expression.

- `neighborCount("expr")`  
  Nombre de voisins qui satisfont l'expression.

- `sumNeighbors("expr")`  
  Somme d'une expression calculee sur chaque voisin.

- `sumLinks("expr", "direction")`  
  Somme d'une expression calculee sur chaque lien incident.  
  `direction` optionnel: `"in"`, `"out"`, `"both"` (defaut: `both`).

## Important

Pour `hasNeighbor`, `neighborCount`, `sumNeighbors`, `sumLinks`:
- l'argument doit etre une **chaine** entre guillemets.  
  Exemple: `hasNeighbor("contains(status,'ok')")`

## Exemples

- `degree() >= 3`
- `linkCount() >= 5`
- `hasNeighbor("contains(status,'ok')")`
- `neighborCount("gt(score,50)") >= 2`
- `sumNeighbors("weight") > 100`
- `sumLinks("weight","out") > 200`

## Notes

- Les fonctions graph sont evaluees dans le contexte du noeud courant.
- Pour les regles appliquees aux liens, `degree("source")` et `linkCount("target")`
  permettent de choisir la source ou la cible du lien.
