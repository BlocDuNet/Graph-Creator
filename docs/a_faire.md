# A faire plus tard

1. [ ] Pie chart avance (segments par expression, normalisation, "Other").
2. [ ] Groupes de noeuds / groupes de liens reutilisables (regles, champs, pie chart).
3. [ ] Ajouter champs image. et pouvoir associé champ image aux noeuds
4. [ ] Pouvoir générer images via IA depuis le logiciel.
5. [ ] Vérifie lequel de ces éléments pas encore présent dans le builder peuvent être ajouté:
    if, concat, add, sub, mul, div, contains, startsWith, endsWith, replace, regex, substring, dateDiff, formatNumber, degree, linkCount, hasNeighbor, neighborCount, sumNeighbors, sumLinks
6. [X] Lors de l'import d'un graph, les règles style, pi chart... sont conservés (voir que faire)
7. [X] ajout sélection multiples éléments (avec clic souris gauche enfoncé - carré sélection) et avec click gauche + maj enfoncé. Gérer le comportement avec une sélection multiple. (supprimer le focus sur le champ name par exemple).
8. [ ] Ajout d'un menu (clic droit) avec ajout noeud, renommer, suppriemr noeud, ajouter dans groupe etc...
9. [ ] Ajouter export complète (dont gestion des styles noeuds/liens, pie chart etc) avec import rapide

    1. [ ] export configurations (individuelle et complete)
    2. [ ] export PNG/jpeg, SVG, mermaid...
1. [ ] Ajouter import rapide pour config générale
1. [ ] Règles avoir aussi un mode réduit (sur une ligne) pour facilement se déplacer parmis beaucoup de règles. + mode recherche
1. [ ] gestion des liens doubles sens, et multiples
1. [ ] affichage visuel des noeuds et lien possible avec des filtres (dont filtre conditionnel) (affiché les liens entre les noeuds si lien contient champ "poids" > 10 ou encore afficher noeud si statut= "à faire""
1. [ ] ajouter champs liste déroulante avec variable prédéfini
1. [ ] exporter et importer rapidement des règles, condition (style raw, json, copier coller...)
1. [X] Interface anglais/français (choix dans config) + support ajout multilingue depuis fichier langue.
1. [ ] ajouter mode simple/avancé/personnalisé (poru que l'interface s'adapte aux besoin de l'utilisateur sans affiche de fonctionnalité si pas l'utilité. Demander à IA un plan de ce qu'il pense mettre en mode simple/avancé et valider ensuite.
1. [ ] Au lancement du logiciel la première fois, créer les préférence de l'utilisateur (langue, mode simple, avancée etc, disposition de l'interace, raccourcis...)
1. [ ] Ajouter groupe de noeuds, groupe de lien, utilisable dans les formules, pour facilement associé des éléments à des noeuds/liens de manière durable. Ces groupes de noeuds/liens peuvent être définit par des règles logiques (exempl tout les noeuds ayant le champs type_personne = "personne physique" et ou manuellement, en ajoutant des noeuds/liens manuellement.
2. [ ] pour pie chart, règle de style, groupe etc...faire en sorte de povuoir définir dynamiquement quels léments sont modifiés (actuellement il y a une liste : Couleur, Contou, Epaisseur, Opacite  etc... le but étant d'afficher par défaut les champ définir dans le panneau de config, puis de pouvoir ajouter manuellement les champs que l'on veut (la plus complète possible).
2. [ ] Dans les builders, mettre une autre fonction IA pour que cette denrière propose (comme pour les noeuds et les liens) des règles qui sont suceptibles d'être pertinentes selon le schéma et/ou les données du graph).
2. [ ] Pour le builder, si le nombre d'item de logique/compraison sont trop nombreux, essayer de n'afficher par defaut que les items pouvant être associé (un champ "texte" ne peut pas soutraire un champ nombre par exemple.
2. [ ] builder, mieux organiser et gérer les champs, exemple "between" doit proposer entre 2 éléments.
2. [ ] pouvoir config quoi afficher en mode réduit
2. [ ] refaire entièrement le tableur.

# A faire plus tard (ou pas)

* [ ] Multilingue i18n complet (actuellement pseudo i18n, sans dépendance. C'est mieux ainsi pour le moment)
