# How it works

This document explains exactly how the Digital Battery Passport calculates health, decides what is allowed, and protects its records. Every number on a passport comes from the rules below.

> The health model is a set of **transparent heuristics**, not a battery-physics simulation. It is designed to be explainable and to be replaced by a calibrated model once real fleet data exists.

---

## 1. Cell health (State of Health of one cell)

Calculated from the cell's **most recent reading**.

```
cycle wear         = min(1, cycles ÷ rated cycle life) × 100
resistance penalty = max(0, (resistance_mΩ − 30) ÷ 4)      (only if a resistance was measured)
cell health (%)    = clamp( 100 − cycle wear − resistance penalty , 0 , 100 ), rounded to 1 decimal
```

| Chemistry | Rated cycle life used |
|---|---|
| LFP (LiFePO4) | 3000 |
| NMC | 1200 |
| LTO | 6000 |
| Anything else | 1500 |

A cell with **no readings yet** is assumed to be 100% — but its evidence score is 0 (see section 4), which is why a freshly registered pack shows *100% health, 0% confidence*.

**Worked examples** (from the sample data in `demo/`)

| Cell | Calculation | Result |
|---|---|---|
| LFP, 260 cycles, 26 mΩ | wear 8.67, penalty 0 | **91.3%** |
| LFP, 2750 cycles, 52 mΩ | wear 91.67, penalty 5.5 | **2.8%** |
| NMC, 395 cycles, 35 mΩ | wear 32.92, penalty 1.25 | **65.8%** |
| LFP, 60 cycles, 70 mΩ | wear 2.0, penalty 10 | **88.0%** |

A BMS can report cell voltage but not per-cell resistance; those readings are stored with an empty resistance and simply get no resistance penalty.

## 2. Pack health: the weakest cell decides

```
pack health = the lowest cell health in the pack
```

| Pack health | Stage |
|---|---|
| ≥ 80% | **Healthy** (fit for vehicle use) |
| 60% – 80% | **Second-life** (not for vehicles, still useful for storage) |
| < 60% | **Retire** |

A pack is a chain of cells; one failing cell limits the whole pack and ages faster. Example (sample pack B): three cells at 83.3% and one at 2.8%. The *average* is about 63% ("second-life"); the weakest cell says **retire** — and that is the answer shown.

## 3. Flags

A cell is flagged when either rule is true:

- **≤ 20% life** — "At or below 20% life — replace"
- **Drift:** it is **6 or more points below the pack average** (average of all cells' health in that pack) — "Drifting x% below pack average"

When a new reading takes a cell from above 20% to 20% or below, the **database** records a *flag event* automatically (shown on the Activity page). It is logged once, at the moment of crossing.

## 4. Evidence confidence

How much recent data stands behind the passport (0–100%).

```
recency  = 1 if the cell's latest reading is ≤ 1 year old, then falls linearly to 0 over the next year
depth    = min(1, number of readings for that cell ÷ 3)
cell score = 0.6 × recency + 0.4 × depth        (a cell with no readings scores 0)
confidence = average cell score × 100, rounded
```

Readings a reused cell collected in earlier packs count toward its depth.

## 5. Recommendation

| Situation | Recommendation |
|---|---|
| Healthy, no flagged cells | **Continue in vehicle use** |
| Healthy, but one or more cells flagged (drift) | **Repair candidate** — replace the flagged cells |
| Second-life | **Route to second-life storage** (tell the buyer about weak cells) |
| Retire | **Route to recycling** (check individual cells; some may be reusable in another pack) |

## 6. Degradation forecast

A **straight-line fit** through the weakest cell's own health-over-time. It needs at least two readings on different dates. It reports the trend (% per month) and the months until the 80% and 60% lines (0 if already below; none if the trend is flat or improving). It is a projection of past behaviour, not a prediction from battery physics.

## 7. Marketplace clearance

A battery may be listed only if **both** are true:

1. Its stage is not **Retire**
2. Its evidence confidence is **≥ 30%**

This rule exists twice, in the browser (to preview the verdict) and in the database as `battery_clearance()`. **Listing goes through `create_listing()`, which re-checks it on the server**, so calling the API directly cannot bypass it. The SQL health formula is a line-for-line mirror of the browser formula.

Other listing rules: only the registering technician (or an admin) may list; one active listing per battery; recording an ownership transfer marks the active listing as sold; the seller (or an admin) may withdraw.

## 8. Price band (indicative)

```
energy (kWh) = capacity_Ah × nominal_V ÷ 1000
base         = energy × ₹9,000 per kWh × (pack health ÷ 100)
band         = base × 0.85  …  base × 1.10   (rounded to the nearest ₹100)
```

This is a placeholder for a real pricing feed. It is not a market quote.

## 9. Cells keep their identity

Every cell has its own permanent ID, independent of the pack it sits in. When a cell is reused in another pack:

- its row is moved to the new pack and its **provenance** row for the old pack is closed (`moved_out_at`); a new one opens
- **all earlier readings stay attached to the cell**
- both packs get a timeline event ("removed and reused in…", "installed from… — history carried over")
- new readings must name the *new* pack; the old pack no longer lists the cell ("Only 3 of 4 cells are in this pack now")

Reuse is only allowed from packs you registered (admins: any), and not from a pack that has an active listing. The whole registration, including reuse, is one atomic server call.

## 10. Integrity: append-only and hash-chained

**Append-only.** Readings, pack readings, usage events and flag events cannot be updated or deleted. This is enforced by database triggers (so it also blocks the SQL editor), not only by the interface. Batteries can only change their owner; cells can only change pack assignment.

**Hash chain.** Each record stores a SHA-256 hash of its own content plus the previous record's hash:

| Chain | One chain per | Hash covers |
|---|---|---|
| Readings | cell | cell ID, pack ID, time (UTC), voltage, resistance, temperature, cycles, source, previous hash |
| Usage history | pack | pack ID, event type, time (UTC), detail, who added it, previous hash |

`verify_battery_integrity(pack)` recomputes every hash and reports the first problem: *edited reading*, *broken link*, or *missing reading/event*. The passport page shows the result as a badge.

**What this does and doesn't prove.** It is *tamper-evident*, not tamper-proof:
- An edit or deletion in the middle of a history is detected.
- Deleting only the **newest** record cannot be detected unless hashes are also anchored outside the database (on the roadmap).
- The database owner can disable triggers; a later edit would then show up in the integrity check.

## 11. Rules the database enforces on readings

| Rule | Detail |
|---|---|
| Rising cycle count | A cell's cycle count can never be lower than its previous reading |
| Time order | A reading cannot be dated before the previous one (2-second tolerance for simultaneous writers) or more than 5 minutes in the future |
| Right pack | A reading must name the pack the cell currently belongs to |
| Plausible values | Voltage > 0 and ≤ 6 V; resistance 0–1000 mΩ; temperature −60 to 200 °C; state of charge 0–100% |
| Known source | `manual`, `csv_upload`, `bms_jbd`, `ble_battery_service` (BMS data carries its source) |
| Honest authorship | The server stamps who added each reading; the client cannot spoof it |

## 12. Who can do what

| | Public / signed-in but unapproved | Approved technician | Admin |
|---|---|---|---|
| View passports, Home, Compare, Marketplace, run integrity check | ✅ | ✅ | ✅ |
| Register batteries, reuse own cells | ❌ | ✅ | ✅ (any cell) |
| Add readings | ❌ | ✅ | ✅ |
| Transfer ownership, list / withdraw | ❌ | ✅ own batteries | ✅ any |
| View Dashboard and Activity | ❌ | ✅ | ✅ |
| Approve new accounts, see real emails | ❌ | ❌ | ✅ |

The first account created becomes admin; every later account waits for approval. The *Add Reading* screen lists the packs you registered; at the database level any approved technician can add readings, so independent workshops can contribute (each reading records who added it and from which source).

## 13. Data model

| Table | Holds |
|---|---|
| `batteries` | The pack: maker, model, chemistry, capacity, owner, photo, retro flag |
| `cells` | Each cell, its permanent ID, current pack and slot, original pack |
| `cell_pack_history` | Every pack a cell has lived in, with enter/leave times |
| `cell_readings` | Voltage, resistance, temperature, cycles per cell (hash-chained) |
| `pack_readings` | State of charge and six temperature sensors per pack |
| `usage_history` | Registration, ownership changes, cell removed/installed (hash-chained) |
| `cell_flag_events` | Automatic "crossed the replace line" events |
| `marketplace_listings` | Listings and their status |
| `profiles` | Role and approval status per account |

Server functions: `register_battery`, `transfer_ownership`, `create_listing`, `withdraw_listing`, `approve_technician`, `list_pending_technicians`, `technician_stats_list`, `battery_clearance`, `verify_battery_integrity`.
