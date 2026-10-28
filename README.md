# Maison Dashboard

Dashboard Home Assistant sombre, pensé pour le téléphone, **construit automatiquement** à partir de vos étages, pièces et appareils — avec un menu **Administration** pour le personnaliser sans YAML.

*English summary below.*

```
Accueil simple  →  bouton « Maison » (pièces par étage)  →  page de la pièce
```

<p align="center">
  <img src="https://raw.githubusercontent.com/nadjib59/maison-dashboard/main/images/menu-maison.png" width="260" alt="Menu Maison : pièces par étage">
  <img src="https://raw.githubusercontent.com/nadjib59/maison-dashboard/main/images/piece.png" width="260" alt="Page d'une pièce">
  <img src="https://raw.githubusercontent.com/nadjib59/maison-dashboard/main/images/chauffage.png" width="260" alt="Vue Chauffage">
</p>

## Fonctionnalités

- **Zéro configuration** : les pièces viennent des zones de Home Assistant, les étages des étages ; chaque pièce affiche ce qui s'y trouve réellement (lumières, chauffage, volets, multimédia, serrures, aspirateur, caméras). Une pièce sans télévision n'affiche pas de commandes de télévision.
- **Accueil** : profil de la personne connectée (photo, présence), météo, alarme (modes réellement supportés, clavier si un code est requis), serrures, accès rapides, lecteur multimédia, deux caméras.
- **Menu Maison** : fenêtre flottante à fond flouté, pièces classées par étage avec température, lumières allumées et lecture en cours.
- **Pages de pièce** : lumières (marche/arrêt, intensité ; appui sur l'icône = toutes les options de HA), « Tout éteindre », chauffage (+/−), volets, lecteurs, serrures, aspirateur, caméras.
- **Vues globales** : Caméras, Chauffage, Volets, Aspirateur (avec la carte si l'intégration en fournit une).
- **Espace personnel** : agendas et listes de tâches choisis par l'administrateur pour chaque compte.
- **Mini-lecteur** flottant quand un média est en lecture.
- **Administration** (administrateurs Home Assistant uniquement) : titre, couleur, météo, alarme, lecteur, caméras de l'accueil, serrures affichées, ordre / visibilité / photo / icône des pièces, préférences par utilisateur (pièces, caméras et serrures visibles, agendas, listes), journal des modifications.
- **Aucune dépendance** : un seul fichier JavaScript, aucune autre carte HACS nécessaire. Compatible [kiosk-mode](https://github.com/NemesisRE/kiosk-mode) s'il est installé.

## Installation

### HACS (recommandé)

1. HACS → ⋮ → **Dépôts personnalisés** → ajoutez l'URL de ce dépôt, catégorie **Dashboard**.
2. Installez **Maison Dashboard**, puis rechargez le navigateur.

### Manuelle

1. Copiez `dist/maison-dashboard.js` dans `config/www/maison-dashboard/`.
2. Paramètres → Tableaux de bord → ⋮ → **Ressources** → ajoutez `/local/maison-dashboard/maison-dashboard.js` (type *Module JavaScript*).

### Créer le dashboard

Paramètres → Tableaux de bord → **Ajouter un tableau de bord** → *Nouveau tableau de bord à partir de zéro*, ouvrez-le, ⋮ → **Modifier** → ⋮ → **Éditeur de configuration brute**, et remplacez tout par :

```yaml
strategy:
  type: custom:maison-dashboard
```

C'est tout : le dashboard se construit seul. Pour masquer la barre du haut avec kiosk-mode :

```yaml
strategy:
  type: custom:maison-dashboard
  kiosk_mode:
    hide_header: true
```

## Bien préparer Home Assistant

Le dashboard est aussi bon que votre organisation dans HA :

- **Zones** (Paramètres → Zones, étages et étiquettes) : rangez chaque appareil dans sa pièce, et chaque pièce dans un étage.
- **Température d'une pièce** : choisissez le capteur dans les réglages de la zone (sinon : premier capteur de température de la pièce, puis le thermostat).
- **Groupes de lumières** : si un groupe et ses membres sont dans la même pièce, seul le groupe est affiché.
- Les entités **masquées** ou de **configuration/diagnostic** ne sont pas affichées.

## Options (toutes facultatives, modifiables depuis le menu Administration)

| Option | Description |
|---|---|
| `title` | Titre du dashboard |
| `accent` | Couleur d'accent (ex. `#29b6f6`) |
| `weather` | Entité météo (sinon la première trouvée) |
| `alarm` | Panneau d'alarme (sinon le premier trouvé) |
| `media_player` | Lecteur de l'accueil (sinon celui qui joue, ou Spotify) |
| `home_cameras` | Caméras de l'accueil (2 max) |
| `locks` | Serrures de l'accueil (vide = toutes) |
| `confirm_unlock` | Demander confirmation avant de déverrouiller |
| `room_order` | Ordre des pièces (identifiants de zone) |
| `hidden_rooms` | Pièces masquées pour tout le monde |
| `hidden_entities` | Entités masquées pour tout le monde |
| `rooms.<zone>.picture / icon / name / temperature` | Photo, icône, nom, capteur de température d'une pièce |
| `users.<id utilisateur>` | `hidden_rooms`, `hidden_entities`, `calendars`, `todos` propres à un compte |
| `kiosk_mode` | Transmis à kiosk-mode s'il est installé |

## Sécurité — à lire

- Le **menu Administration** n'apparaît que pour les administrateurs, et **Home Assistant refuse côté serveur** l'enregistrement de la configuration d'un dashboard (`lovelace/config/save`) et la liste des comptes à tout compte non administrateur.
- **Masquer une pièce, une caméra ou une serrure pour un utilisateur n'est pas une protection.** Home Assistant ne propose pas de droits par entité : tout compte connecté peut lire les états, les images des caméras et commander les serrures par l'API, même si le dashboard les cache. Pour une vraie restriction, utilisez les comptes propres aux appareils (rôles par caméra de Frigate, clés électroniques des serrures) ou n'ajoutez pas l'appareil à Home Assistant.
- Aucun mot de passe ni jeton n'est stocké par ce dashboard ; le code d'alarme saisi n'est ni affiché ni conservé.

## Limites connues

- Interface en français uniquement pour l'instant.
- Les fonctions propres à une marque (pièces d'un robot aspirateur, préréglages PTZ…) ne sont pas encore prises en charge : utilisez l'appui sur l'icône (fenêtre d'options de HA).

---

## English summary

**Maison Dashboard** is a zero-dependency Home Assistant *dashboard strategy* that builds a dark, phone-first dashboard from your floors, areas and devices: a simple home screen, a floating **House** menu listing rooms by floor, and one control page per room showing only what that room really contains. Admins get an **Administration** menu (titles, colors, rooms order/visibility/pictures, per-user preferences, change log) saved in the dashboard config — Home Assistant rejects saving for non-admin users server-side. Hiding something for a user is **not** a security boundary: Home Assistant has no per-entity permissions.

Install via HACS (custom repository, category *Dashboard*) or manually, then set the dashboard raw config to:

```yaml
strategy:
  type: custom:maison-dashboard
```

License: MIT.
