# Upitko — Savremeni CRM za srpske firme

Kompletan veb-sajt i interaktivna CRM veb-aplikacija za **Upitko** (`upitko.rs`), izgrađeni u 3D WebGL stilu sa **100% proceduralnom 3D planetom** (bez eksternih GLB modela ili licencnih zavisnosti).

## Struktura projekta

```text
world site/
├── index.html              # Glavna 3D WebGL stranica (Hero, 6 kartica, 6 detaljnih pod-sekcija, Poređenje, Cene, FAQ)
├── app.html                # Interaktivna Upitko CRM Web Aplikacija (Kanban levak, Omnichannel Inbox, Automatizacije, Predračuni u RSD)
├── cene.html               # Stranica sa paketima u RSD, interaktivnim ROI kalkulatorom i tabelom funkcija
├── integracije.html        # Katalog domaćih i globalnih integracija (Instagram, Viber, Sajt, Oglasnici, PIB/APR, SEF)
├── vodici.html             # Playbook vodiči za prodajne timove i prelazak sa Excela na CRM
├── o-nama.html             # O nama, misija i kontakt forma (povezana sa lokalnim CRM sandboxom)
├── pravno.html             # Politika privatnosti (ZZPL), Uslovi korišćenja, DPA i Bezbednost
├── ascend-original.html    # Rezervna kopija originalnog engleskog Ascend šablona
└── README.md               # Dokumentacija projekta
```

## Kako funkcioniše 3D proceduralna planeta?

`index.html` koristi `createFallbackTextures()` i `mountFallbackPlanet()` za generisanje kontinenata, okeana, obalskih noćnih svetala gradova i 3 sloja oblaka direktno u memoriji pregledača pomoću 3D FBM šuma (noise) i prilagođenih GLSL šejdera:
- Nema poziva ka `api.getlayers.ai` niti `gstatic.com` DRACO dekoderu.
- Zadržani su svi 3D efekti: odsjaj sunca na okeanu (*ocean glint*), 3D reljef kontinenata (*bumped normal*), noćna svetla gradova, 60 pulsirajućih zlatnih radarskih tačaka na kopnu, 1.400 zvezda i glatko pomeranje planete pri skrolovanju (*Lenis*).

## Pokretanje

1. Možete direktno otvoriti `index.html` ili `app.html` dvoklikom u pregledaču, ili
2. Pokrenuti lokalni server iz ovog foldera (npr. `npx serve .` ili `python -m http.server 8080`) i otvoriti `http://localhost:8080`.
