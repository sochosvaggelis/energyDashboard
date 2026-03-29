# Admin Dashboard - EnergyCompare

Διαχειριστικό panel για τη διαχείριση παρόχων ηλεκτρικής ενέργειας, συμβολαίων/πλάνων και μεταβλητών τιμολόγησης.

## Τεχνολογίες

| Κατηγορία | Τεχνολογία |
|-----------|------------|
| Framework | React 19 |
| Build Tool | Vite 6 |
| Backend / Database | Supabase (PostgreSQL) |
| Styling | CSS3 με custom properties |
| Font | Plus Jakarta Sans |

## Εγκατάσταση & Εκκίνηση

```bash
# Εγκατάσταση dependencies
npm install

# Development server (port 5174)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Environment Variables

Δημιουργήστε αρχείο `.env` στο root του AdminDashboard:

```
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

## Δομή Εφαρμογής

Η εφαρμογή χωρίζεται σε **3 κύριες καρτέλες (tabs)**:

1. **Providers** - Διαχείριση παρόχων
2. **Plans** - Διαχείριση συμβολαίων/πλάνων
3. **Settings** - Καθολικές μεταβλητές για τους τύπους υπολογισμού

---

## Λειτουργίες

### 1. Διαχείριση Παρόχων (Providers)

- **Προβολή** όλων των παρόχων σε πίνακα (Όνομα, Adjustment Factor, Ημερομηνία Δημιουργίας)
- **Αναζήτηση** παρόχων κατά όνομα σε πραγματικό χρόνο (case-insensitive)
- **Προσθήκη** νέου παρόχη μέσω modal φόρμας
  - Πεδία: Όνομα (υποχρεωτικό), Adjustment Factor (προαιρετικό)
- **Επεξεργασία** παρόχη inline μέσα στον πίνακα
  - Τροποποίηση ονόματος και adjustment factor
  - Κουμπιά Save/Cancel
- **Διαγραφή** παρόχη με dialog επιβεβαίωσης

---

### 2. Διαχείριση Πλάνων/Συμβολαίων (Plans)

- **Προβολή** όλων των πλάνων σε πίνακα (Πάροχος, Όνομα, Τύπος Τιμολογίου, Τιμή/kWh, Νυχτερινή Τιμή, Κλιμάκια, Μηνιαίο Πάγιο, Κοινωνικό Τιμολόγιο)
- **Αναζήτηση** κατά όνομα πλάνου ή πάροχο
- **Προσθήκη** νέου πλάνου μέσω wide modal φόρμας
- **Επεξεργασία** πλάνου inline (expanded row στον πίνακα)
- **Διαγραφή** πλάνου με dialog επιβεβαίωσης

#### Πεδία Πλάνου

| Πεδίο | Περιγραφή |
|-------|-----------|
| Πάροχος | Επιλογή από dropdown (foreign key στον πίνακα providers) |
| Όνομα Πλάνου | Ελεύθερο κείμενο |
| Τύπος Τιμολογίου | Σταθερό, Κυμαινόμενο, Ειδικό, Δυναμικό |
| Τιμή/kWh | Στατική τιμή ή τύπος (formula) |
| Νυχτερινή Τιμή/kWh | Στατική τιμή ή τύπος (formula) |
| Κλιμάκια (Tiers) | Πολλαπλά κλιμάκια τιμολόγησης |
| Μηνιαίο Πάγιο (EUR) | Αριθμητική τιμή |
| Κοινωνικό Τιμολόγιο | Checkbox (Ναι/Όχι) |

#### Τύποι Τιμολογίου

- **Σταθερό Τιμολόγιο** - Σταθερή τιμή ανά kWh
- **Κυμαινόμενο Τιμολόγιο** - Μεταβλητή τιμή βάσει αγοράς
- **Ειδικό Τιμολόγιο** - Ειδικές συνθήκες τιμολόγησης
- **Δυναμικό Τιμολόγιο** - Δυναμική τιμολόγηση σε πραγματικό χρόνο

#### Λειτουργία Τιμολόγησης (Static vs Formula)

Κάθε πεδίο τιμής (ημερήσια, νυχτερινή, ανά κλιμάκιο) υποστηρίζει δύο modes:

- **Static**: Απευθείας εισαγωγή αριθμητικής τιμής
- **Formula (fx)**: Δυναμικός υπολογισμός μέσω του Formula Builder

#### Σύστημα Κλιμακίων (Tiers)

- Προσθήκη/αφαίρεση κλιμακίων δυναμικά
- Κάθε κλιμάκιο περιλαμβάνει:
  - Ελάχιστο kWh
  - Μέγιστο kWh (ή άπειρο)
  - Τιμή/kWh (στατική ή formula)
- Εναλλαγή μεταξύ static/formula ανά κλιμάκιο

---

### 3. Καθολικές Μεταβλητές (Settings)

Μεταβλητές διαθέσιμες στους τύπους υπολογισμού τιμών (Formula Builder).

- **Προβολή** όλων των μεταβλητών ως κάρτες
- **Προσθήκη** νέας μεταβλητής μέσω modal
  - Αυτόματη μετατροπή ονόματος σε snake_case (πεζά, κάτω παύλα αντί κενών)
  - Αριθμητική τιμή
- **Επεξεργασία** τιμής inline (αριθμητικό input + κουμπί Save)
  - Οπτική επιβεβαίωση αποθήκευσης (checkmark ✓)
- **Διαγραφή** μεταβλητής με dialog επιβεβαίωσης

---

### 4. Formula Builder

Εργαλείο δημιουργίας μαθηματικών τύπων για δυναμικό υπολογισμό τιμών.

#### Δυνατότητες

- **Βασική τιμή (Base Value)**: Μεταβλητή ή αριθμός
- **Βήματα υπολογισμού (Steps)**: Αλυσιδωτές πράξεις
  - Πρόσθεση (+)
  - Αφαίρεση (−)
  - Πολλαπλασιασμός (×)
  - Διαίρεση (÷)
- **Κάθε βήμα** μπορεί να χρησιμοποιεί αριθμό ή μεταβλητή
- **Live υπολογισμός** σε πραγματικό χρόνο
- **Οπτικοποίηση τύπου**: Εμφάνιση τύπου σε μορφή κειμένου (π.χ. `wholesale_price(0.50) + 0.05 = 0.55`)
- **Προστασία** από διαίρεση με μηδέν
- **Στρογγυλοποίηση** σε 5 δεκαδικά ψηφία

#### Διαθέσιμες Μεταβλητές

- Όλες οι καθολικές μεταβλητές από το tab Settings
- `adjustment_factor` ανά πάροχο

#### Παράδειγμα Δομής Formula

```
Βάση: wholesale_price (μεταβλητή)
  + 0.05 (αριθμός)
  × adjustment_factor (μεταβλητή)
= τελικό αποτέλεσμα
```

---

## Caching

- **LocalStorage** caching με TTL 5 λεπτών
- Αυτόματη ακύρωση cache μετά από κάθε CRUD ενέργεια
- Cache keys: `admin_providers`, `admin_plans`

## UI/UX

- **Dark Theme** με midnight blue background (#0a1628)
- **Accent χρώμα**: Πορτοκαλί/amber (#f59e0b)
- **Responsive layout** με max-width 1100px
- **Modal overlays** με κλείσιμο στο click εκτός
- **Inline editing** σε πίνακες
- **Hover effects** σε κουμπιά και γραμμές πινάκων
- **Horizontal scroll** σε πίνακες για μικρές οθόνες
- **Loading indicators** κατά τη φόρτωση δεδομένων
- **Error messages** σε κόκκινη μπάρα πάνω από το περιεχόμενο
- **Empty state messages** όταν δεν υπάρχουν δεδομένα

## Database (Supabase)

### Πίνακες

| Πίνακας | Πεδία | Περιγραφή |
|---------|-------|-----------|
| `providers` | id, name, adjustment_factor, created_at | Πάροχοι ηλεκτρικής ενέργειας |
| `plans` | id, provider_id, plan_name, tariff_type, price_per_kwh, price_formula, night_price_per_kwh, night_price_formula, monthly_fee_eur, social_tariff, pricing_tiers, created_at | Πλάνα/Συμβόλαια |
| `settings` | key, value, updated_at | Καθολικές μεταβλητές |

### Σχέσεις

- `plans.provider_id` → `providers.id` (Foreign Key)
- Τα πεδία `price_formula`, `night_price_formula`, `pricing_tiers` αποθηκεύονται ως JSON

## Δομή Αρχείων

```
AdminDashboard/
├── .env                        # Environment variables
├── index.html                  # HTML entry point
├── package.json                # Dependencies & scripts
├── vite.config.js              # Vite configuration
└── src/
    ├── main.jsx                # React root
    ├── App.jsx                 # Main app component
    ├── App.css                 # App layout styles
    ├── index.css               # Global styles & CSS variables
    ├── lib/
    │   ├── supabase.js         # Supabase client
    │   ├── cache.js            # Caching utilities
    │   └── formula.js          # Formula evaluation & display
    └── components/
        ├── Tabs.jsx            # Tab navigation
        ├── Tabs.css
        ├── ProvidersTab.jsx    # Providers management
        ├── ProvidersTab.css
        ├── PlansTab.jsx        # Plans/contracts management
        ├── PlansTab.css
        ├── SettingsTab.jsx     # Global variables management
        ├── SettingsTab.css
        ├── FormulaBuilder.jsx  # Dynamic formula builder
        └── FormulaBuilder.css
```
