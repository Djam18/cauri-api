# Guide d'Utilisation & Scénarios d'Évaluation
# Cauri — API Sandbox de Paiement

Ce guide est destiné aux **Lead Développeurs**, recruteurs techniques et développeurs intégrateurs souhaitant comprendre, lancer et évaluer Cauri en moins de **5 minutes**.

---

## 1. Démarrage en 60 secondes (Zéro Configuration)

Le projet est entièrement conteneurisé. Aucune installation locale de PostgreSQL ou MongoDB n'est nécessaire.

```bash
# 1. Cloner et se placer dans le projet
cd cauri

# 2. Lancer l'environnement complet (API + PostgreSQL + MongoDB)
docker compose up -d

# 3. Vérifier la santé des conteneurs
docker compose ps
```

Une fois démarré :
* **Console Développeur (UI)** : `http://localhost:3000`
* **Swagger / OpenAPI interactif** : `http://localhost:3000/docs`
* **API REST** : `http://localhost:3000/v1`
* **Identifiants de test pré-injectés (Seed)** :
  * Clé API Marchand : `sk_test_demo123`
  * Secret Webhook : `whsec_cauri_secret_demo456`

---

## 2. Les 4 Scénarios d'Évaluation Technique

Ces 4 cas de test concrets permettent d'évaluer la robustesse du système :

### Scénario A : Le Paiement Nominal (Happy Path)
* **Objectif** : Vérifier la création d'une intention de paiement, son enregistrement en base SQL et la réception du webhook signé.
* **Commande cURL** :
  ```bash
  curl -X POST http://localhost:3000/v1/payment-intents \
    -H "Authorization: Bearer sk_test_demo123" \
    -H "Idempotency-Key: cmd_test_001" \
    -H "Content-Type: application/json" \
    -d '{
      "amount": 10000,
      "currency": "XOF",
      "reference": "CMD-8921",
      "customer_phone": "+2290166646310",
      "webhook_url": "https://webhook.site/votre-id"
    }'
  ```
* **Résultat attendu** :
  * Code HTTP `201 Created` avec statut `SUCCEEDED`.
  * Émission d'un webhook vers votre URL avec l'en-tête `X-Cauri-Signature`.

---

### Scénario B : La Tolérance aux Doubles Clics (Idempotence)
* **Objectif** : Prouver qu'une double émission (réseau instable ou double clic) ne duplique JAMAIS la transaction.
* **Action** : Réexécutez **exactement** la même commande cURL que le Scénario A (avec la même `Idempotency-Key: cmd_test_001`).
* **Résultat attendu** :
  * Code HTTP `200 OK` (et non `201`).
  * En-tête de réponse `X-Cache-Lookup: HIT`.
  * La base PostgreSQL ne compte qu'**une seule transaction**.
  * Le corps de la réponse est identique au premier appel.

---

### Scénario C : La Simulation de Pannes Déterministe (Magic Values)
* **Objectif** : Valider la résilience du client face aux erreurs bancaires ou réseau sans altérer le code.
* **Cas 1 : Solde insuffisant** :
  ```bash
  curl -X POST http://localhost:3000/v1/payment-intents \
    -H "Authorization: Bearer sk_test_demo123" \
    -H "Idempotency-Key: req_fail_solde" \
    -H "Content-Type: application/json" \
    -d '{ "amount": 4002, "currency": "XOF", "reference": "CMD-FAIL-1", "customer_phone": "+2290166646310" }'
  ```
  * **Résultat** : Statut `FAILED`, `failure_code: "INSUFFICIENT_FUNDS"`.
* **Cas 2 : Dépassement de délai réseau (Timeout)** :
  * Envoyer le montant `5004 XOF`.
  * **Résultat** : Statut `FAILED`, `failure_code: "GATEWAY_TIMEOUT"`.

---

### Scénario D : Audit Trail & Observabilité (MongoDB)
* **Objectif** : Vérifier que chaque tentative, payload brut et métrique de latence sont immuablement historisés.
* **Vérification** :
  * Ouvrir la Console UI sur `http://localhost:3000/console`.
  * Observer l'onglet **Audit Logs** affichant les documents MongoDB avec la trace complète (`PAYMENT_INTENT_CREATED`, latence en `ms`, adresse IP, réponse JSON).

---

## 3. L'Interface Développeur (Console Interactive)

Pour les évaluateurs qui ne souhaitent pas ouvrir un terminal :
1. Rendez-vous sur `http://localhost:3000`.
2. Cliquez sur **« Tester le flux »** dans la barre de navigation.
3. Trois panneaux interactifs sont disponibles :
   * **Simulateur** : Cliquez sur les boutons d'action rapide (*Succès*, *Solde Insuffisant*, *Double clic*) pour déclencher les requêtes.
   * **Inspecteur de Webhooks** : Affiche le JSON envoyé et génère le code de validation HMAC pour votre langage (Node.js, PHP, Python).
   * **Vérificateur Cryptographique** : Permet de coller une signature reçue et un secret pour vérifier son authenticité en direct.
