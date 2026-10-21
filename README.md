# Upitko — Savremeni B2B Sales & RevOps CRM za srpske firme

Kompletan veb-sajt i SaaS CRM veb-aplikacija za **Upitko** (`upitko.rs`), izgrađeni u 3D WebGL stilu sa **100% proceduralnom 3D planetom** i povezanim **Supabase PostgreSQL (EU)** backendom.

---

## 🚀 Struktura projekta

```text
├── index.html              # Glavna 3D WebGL stranica (Hero, 6 modula, poređenje, cene, FAQ, lead forme)
├── app.html                # Upitko CRM Web Aplikacija (Kanban levak, Omnichannel Inbox, Automatizacije, Predračuni u RSD)
├── prijava.html            # Prijava u radni prostor (Supabase Auth)
├── registracija.html       # Registracija firme i onboarding (14 dana besplatno)
├── cene.html               # Paketi u RSD, interaktivni ROI kalkulator i tabela funkcija
├── integracije.html        # Katalog integracija (Instagram, Viber, Web forme, Meta Ads, SEF)
├── vodici.html             # Vodiči i playbook-ovi za prodajne timove
├── o-nama.html             # O nama i kontakt forma
├── pravno.html             # Politika privatnosti (ZZPL), Uslovi korišćenja, DPA i Bezbednost
├── api/
│   ├── config.js           # Serverless endpoint za bezbednu distribuciju javnih Supabase ključeva
│   ├── lead.js             # Lead capture endpoint sa marketing formi (Vercel serverless)
│   └── v1/inbound.js       # Javni webhook gateway za prijem upita sa klijentskih sajtova
├── supabase/
│   └── schema.sql          # Kompletna PostgreSQL RLS šema za višekorisnički rad (multi-tenancy)
└── vercel.json             # Vercel konfiguracija (Clean URLs, sigurnosni hederi)
```

---

## ⚙️ Environment Variables (Vercel)

Za punu funkcionalnost baze i slanja notifikacija, podesite sledeće promenljive u **Vercel Settings -> Environment Variables**:

| Promenljiva | Opis | Gde se nalazi |
|---|---|---|
| `SUPABASE_URL` | Supabase Project URL | Supabase Dashboard -> Project Settings -> API |
| `SUPABASE_ANON_KEY` | Javni anon ključ | Supabase Dashboard -> Project Settings -> API |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Opciono)* Servisni ključ za Inbound gateway | Supabase Dashboard -> Project Settings -> API |
| `TELEGRAM_BOT_TOKEN` | *(Opciono)* Bot token za instant alert na mobilni | @BotFather na Telegramu |
| `TELEGRAM_CHAT_ID` | *(Opciono)* Tvoj Telegram ID | @userinfobot na Telegramu |
| `LEAD_WEBHOOK_URL` | *(Opciono)* Webhook za Zapier/Make/Slack/Sheets | Webhook URL servisa |

---

## 🛠️ Pokretanje i Testiranje

1. Otvorite sajt live na Vercelu ili lokalno.
2. Posetite `/registracija.html` da registrujete prvu firmu i vlasnički nalog.
3. Radite uživo na Kanban tabli u `/app.html` uz automatsku sinhronizaciju u realnom vremenu!
