# Carnet de visites

Mini app pour rédiger des comptes rendus de visites fournisseurs : une fiche par entreprise, six critères notés de 1 à 5, comparatif et export en texte.

## Où vont les données

- Les notes restent dans le navigateur de l'appareil. L'app n'a pas de serveur, pas de compte, pas de statistiques.
- Une politique de sécurité (CSP) interdit à la page toute requête vers un autre site.
- Un verrou par code, facultatif, chiffre les notes sur l'appareil (AES-GCM 256, clé dérivée du code par PBKDF2-SHA256, 600 000 itérations). Sans le code, les notes sont illisibles et irrécupérables.
- Avec le verrou, la copie de secours est chiffrée elle aussi. Les comptes rendus exportés en texte, eux, sont en clair : c'est leur but.
- Le bouton « Dicter » est désactivé par défaut, car il envoie la voix au service vocal du navigateur. Le micro du clavier fonctionne dans tous les champs.

## Hors ligne

Une fois ouverte une première fois avec du réseau, l'app s'ouvre ensuite sans connexion. Pour l'installer : ouvrir la page sur le téléphone, puis « Ajouter à l'écran d'accueil ».

## Mettre à jour l'app

Modifier les fichiers, puis changer `VERSION` dans `sw.js` : c'est ce qui déclenche la mise à jour sur les appareils.
