# Zentro 1.2 - eenmalige installatie van de online onderdelen

De app zelf werkt direct. Voor **inloggen**, **Premium/VPN** en de **update-melding** moet je 1 keer wat instellen.
Alles wat je invult staat in `src/core/config.js`. Daarna: `npm test` en bouw je installer zoals altijd.

## 1. Update-melding ("You need to update the app")  - 2 minuten
1. Zet in `src/core/config.js`: `UPDATE_REPO: 'jouwnaam/jouwrepo'` (je GitHub-repo, moet **publiek** zijn).
2. Nieuwe versie uitbrengen: verhoog `version` in `package.json`, commit, en dan
   `git tag v1.3.0` + `git push origin v1.3.0`. Je bestaande workflow bouwt de .exe en maakt de Release.
3. Iedereen met een **oudere versie (vanaf 1.2.0)** ziet bij het openen "You need to update the app" met een Download-knop. De browser opent pas na updaten.
   - Mensen die 1.1.0 of ouder hebben, hebben deze code nog niet: zij zien de melding pas als ze 1.2.0 hebben geinstalleerd.
   - Geen internet = de browser opent gewoon (niemand wordt buitengesloten).

## 2. Inloggen (Firebase, gratis)
1. https://console.firebase.google.com -> project maken -> **Authentication** -> Sign-in method: zet **Email/Password** en **Google** aan.
2. Project settings -> General -> **Web API Key** kopieren -> `FIREBASE_API_KEY` in config.js.
3. Google-knop: https://console.cloud.google.com -> APIs & Services -> Credentials -> Create credentials -> OAuth client ID -> type **Desktop app**.
   Zet Client ID en Client secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (bij desktop-apps is dit "secret" niet geheim; dat is normaal).
   Vul ook het OAuth consent screen in.
4. `ALLOW_SKIP_LOGIN: false` = verplicht inloggen. `true` = "Continue without an account" is mogelijk.
Zonder `FIREBASE_API_KEY` verschijnt er geen loginscherm.

## 3. Zentro server (Premium + VPN-lijst)
De map `server/` is een kleine server zonder dependencies (Node 18+). Zet hem op Render/Railway/Fly (gratis tier kan), start: `node server.js`.
Environment variables op de server:
| Naam | Waarde |
|---|---|
| `FIREBASE_API_KEY` | zelfde key als hierboven |
| `STRIPE_SECRET_KEY` | `sk_test_...` (testmodus; later `sk_live_...`) - **nooit in de app zetten** |
| `STRIPE_PAYMENT_LINK_ID` | optioneel, `plink_...`; vindt aankopen met een ander e-mailadres |
| `VPN_SERVERS` | JSON, zie hieronder |

Zet daarna de URL in config.js: `API_BASE: 'https://jouw-server.onrender.com'`.

Hoe Premium werkt: de app opent jouw Stripe-link met account-id en e-mail ingevuld. De server vraagt bij Stripe of er een betaalde sessie voor dat account is. Alleen accounts met een **geverifieerd e-mailadres** kunnen Premium krijgen (anders kan iemand een andermans e-mail gebruiken). De Stripe-link in config.js is een **test**-link (`test_`): daar is niet echt voor te betalen (testkaart 4242 4242 4242 4242). Voor echt geld: nieuwe live Payment Link maken, in config.js zetten en `sk_live_` op de server.

## 4. De VPN zelf
**Ik kan geen VPN-servers leveren.** De app stuurt al het browserverkeer via een proxy-server die jij beheert, en alleen Premium-accounts krijgen de gegevens. Je hebt dus een VPS nodig met een proxy (bijv. Squid of Caddy met TLS + wachtwoord). Voorbeeld voor `VPN_SERVERS`:
```json
[{"id":"nl1","name":"Amsterdam","country":"NL","scheme":"https","host":"proxy.jouwdomein.nl","port":443,"username":"zentro","password":"lang-wachtwoord"}]
```
`scheme` mag `https` (aanbevolen, versleuteld), `http` of `socks5` zijn (Chromium ondersteunt geen wachtwoord bij socks5). Dit is een browser-VPN: het beschermt alleen verkeer van Zentro, niet van andere programma's. Als de server uitvalt laden pagina's niet (geen terugval naar je echte IP); WebRTC wordt beperkt zodat je echte IP niet lekt.

## Waar vind je alles
Menu -> **Account & Premium** (inloggen, kopen, VPN) - Settings -> About ("Made by Zentro dev team").
