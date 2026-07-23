# FAMMY — 5 chiavi mancanti da aggiungere a `frontend/src/lib/i18n.jsx`

Queste chiavi sono usate dal codice ma NON esistono nel dizionario.
Effetto visibile oggi:
- il modal "Entra con codice invito" mostra etichette vuote o chiavi grezze
- il bottone "Condividi" in FamilyTab resta in italiano in tutte le lingue

## Come applicare (github.dev, 4 incolli identici come posizione)

Cerca nel file `i18n.jsx` la stringa:  `join_err_6char`
La trovi 4 volte (una per lingua: it → en → fr → de, in quest'ordine).
Dopo OGNUNA delle 4 righe trovate, incolla il blocco corrispondente qui sotto.

---

### 1ª occorrenza (blocco IT) — incolla dopo la riga `join_err_6char: ...`:

    join_who_are_you: 'CHI SEI?',
    join_i_am: 'Sono {name}',
    join_claim_new: 'Nessuno di questi — sono un nuovo membro',
    join_err_ph_taken: 'Questo profilo è appena stato collegato da qualcun altro. Scegli di nuovo.',
    share: 'Condividi',

### 2ª occorrenza (blocco EN):

    join_who_are_you: 'WHO ARE YOU?',
    join_i_am: "I'm {name}",
    join_claim_new: "None of these — I'm a new member",
    join_err_ph_taken: 'That profile was just claimed by someone else. Please choose again.',
    share: 'Share',

### 3ª occorrenza (blocco FR):

    join_who_are_you: 'QUI ES-TU ?',
    join_i_am: 'Je suis {name}',
    join_claim_new: 'Aucun de ceux-ci — je suis un nouveau membre',
    join_err_ph_taken: "Ce profil vient d'être réclamé par quelqu'un d'autre. Choisis à nouveau.",
    share: 'Partager',

### 4ª occorrenza (blocco DE):

    join_who_are_you: 'WER BIST DU?',
    join_i_am: 'Ich bin {name}',
    join_claim_new: 'Keiner davon — ich bin ein neues Mitglied',
    join_err_ph_taken: 'Dieses Profil wurde gerade von jemand anderem übernommen. Bitte wähle erneut.',
    share: 'Teilen',

---

## Verifica rapida dopo il commit

1. Apri l'app in inglese → Famiglia → bottone di condivisione: deve dire "Share"
2. Flusso "I have an invite code" con una famiglia che ha membri placeholder:
   il picker deve mostrare "WHO ARE YOU?", "I'm <nome>", "None of these — I'm a new member"

Nota: `{name}` è un segnaposto gestito da t(key, vars) — va lasciato
esattamente così, graffe comprese.
