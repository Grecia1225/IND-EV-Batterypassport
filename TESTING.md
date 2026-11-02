# Testing guide

A step-by-step plan to verify every main feature using the sample files in [`demo/`](../demo). It takes about 25 minutes and doubles as a demo script.

## Before you start

1. The database is set up (`supabase/schema.sql`, then `supabase/migration_03_hardening.sql`).
2. You are signed in as the **admin** (the first account ever created).
3. The Supabase project is awake (free projects pause after about a week without use).
4. Browser date format note: the *Manufacture date* box follows your browser's format (for example `dd-mm-yyyy`).

## The five sample packs

Register them **in this order** (pack E must be last, because it reuses a cell from pack B that should already have history).

| Field | A | B | C | D | E |
|---|---|---|---|---|---|
| Maker | VoltEdge Energy | VoltEdge Energy | GridCell | AmpWorks | SunBox |
| Model | VE-48-30 | VE-48-30 | GC-48-24 | AW-48-24 | SB-48-30 |
| Place of manufacture | Chennai, India | Chennai, India | Pune, India | Bengaluru, India | Hyderabad, India |
| Manufacture date | 01-06-2025 | 01-11-2024 | 01-09-2025 | 01-03-2024 | 01-01-2025 |
| Chemistry | LFP (LiFePO4) | LFP (LiFePO4) | LFP (LiFePO4) | NMC | LFP (LiFePO4) |
| Cell count | 4 | 4 | 4 | 4 | 4 |
| Nominal voltage (V) | 48 | 48 | 48 | 48 | 48 |
| Capacity (Ah) | 30 | 30 | 24 | 24 | 30 |
| Owner name | Ravi Kumar | Sunrise Fleet Services | Meena Traders | City Loader Co | Anil Solar Shop |
| Vehicle type | E-rickshaw | E-loader | E-rickshaw | E-loader | Other |
| "Already in use" | no | no | no | no | **yes** |
| Cells section | none reused | none reused | none reused | none reused | **Position 1: reused** (paste the ID of pack B's cell 1) |

For pack E: open pack B's passport, tap cell 1, copy the cell ID shown in the panel, then paste it at Position 1 in the register form. A green "Found — originally from DBP-…" line confirms it.

## Test steps

For each pack: **Add Reading** → choose the pack → *Import a tester file (CSV)* → choose the matching file → check the preview says all rows are ready → **Import**.

| # | Do this | Expect |
|---|---|---|
| 1 | Register pack A | Success screen with a QR code and an ID like `DBP-7F3A9C`; passport shows 100% health but **0% confidence** and **Not cleared** (no readings yet) |
| 2 | Import `A_healthy_pack.csv` into A (12 rows) | "12 reading(s) saved" |
| 3 | Add a pack reading to A: state of charge `72`, sensors `31.2, 31.8, 32.0, 31.5, 30.9, 31.1` | Passport shows State of Charge 72% and the six temperatures |
| 4 | Open A's passport | Health **91.3%**, Healthy, confidence 100%, **Cleared**, price about ₹10,100–13,000, forecast about 8–9 months to the 80% line, "Continue in vehicle use", green *History integrity verified* badge |
| 5 | Register B, import `B_retire_pack.csv` (16 rows); add pack reading: state of charge `18`, sensors `34, 36, 45, 35, 34, 33` | Health **2.8%**, **Retire**, one cell flagged red, **Not cleared**, "Route to recycling". The **Activity** page shows one automatic flag event |
| 6 | Register C, import `C_drift_repair_pack.csv` | Health **88%**, Healthy, cell 4 flagged "Drifting 7.5% below pack average", **"Repair candidate"**, forecast about 5 months to 80% |
| 7 | Register D, import `D_second_life_pack.csv` | Health **65.8%**, **Second-life**, confidence 73%, **Cleared**, no forecast (single date), "Route to second-life storage" |
| 8 | Register E (retro, reuse B's cell 1), import `E_retro_reuse_pack.csv` | "Retro-registered" banner; health 82.7%; tap cell 1 → **Cell journey (2 packs)** and the reused-cell panel; B's passport now says *"Only 3 of 4 cells are in this pack now"* and its timeline records the removal |
| 9 | **Compare** A and B | Side-by-side table; A's health highlighted as better |
| 10 | **Marketplace**: select B | "Not cleared: weakest cell is below the 60% storage threshold…" and the button is disabled |
| 11 | **Marketplace**: list A at 38000 | Listing appears; a second listing for A is refused ("already has an active listing") |
| 12 | A's passport → **Transfer** → enter a new owner | Owner changes, a timeline event appears, the active listing becomes *sold* |
| 13 | **Scan** → upload a screenshot of a pack's QR, or type its ID | Opens that passport (camera needs HTTPS or localhost) |
| 14 | Sign up a second account | Register / Add Reading show "Your account is waiting for approval". As admin: **Activity → Approve**; the second account can now register |
| 15 | Switch to **हिं**, press **Listen**, press **Certificate** | Original labels translate; summary is read aloud (voice depends on the device); print dialog opens |
| 16 | Add Reading → **Simulate a BMS (preview only)** | Decoded values and the mapping to this pack are shown, labelled SIMULATED; nothing is saved |
| 17 | Try importing a CSV with a falling cycle count, or a future date | The preview marks the rows with a reason, or the database refuses the save with a clear message |

## Safe database checks (Supabase SQL Editor)

Both always roll back. A red "ERROR … DEMO RESULT" line is the expected output.

**1. The database refuses to edit history**
```sql
do $$ begin begin
  update public.cell_readings set voltage_v = 4 where cell_id = (select id from public.cells limit 1);
  raise exception 'DEMO RESULT: the edit was ALLOWED (nothing was saved, rolled back)';
exception when others then
  if sqlerrm like '%append-only%' then raise exception 'DEMO RESULT: the database REFUSED the edit -> %', sqlerrm;
  else raise; end if;
end; end $$;
```
Expected: `DEMO RESULT: the database REFUSED the edit -> cell_readings is append-only: UPDATE is not allowed`

**2. Tampering is detected** (replace `DBP-XXXXXX` with pack A's ID, in both places)
```sql
do $$ declare r record; begin
  alter table public.cell_readings disable trigger cell_readings_immutable;
  update public.cell_readings set voltage_v = 4.2 where chain_pos = 2 and cell_id =
    (select id from public.cells where current_battery_id = 'DBP-XXXXXX' order by position_in_pack limit 1);
  select * into r from public.verify_battery_integrity('DBP-XXXXXX');
  raise exception 'DEMO RESULT (nothing saved): history intact = %, problem = %', r.ok, r.first_problem;
end $$;
```
Expected: `history intact = f, problem = edited reading 2 of cell CELL-…` — and the passport still shows the green badge afterwards, because the experiment was rolled back.

**3. Integrity of any pack**
```sql
select * from public.verify_battery_integrity('DBP-XXXXXX');
```

**4. Server-side clearance**
```sql
select * from public.battery_clearance('DBP-XXXXXX');
```

## Resetting a demo database

History cannot be deleted from the app, by design. To wipe a **demo** database and start over (keeps accounts, deletes **all** batteries, readings, listings and history), run once in the SQL Editor:

```sql
do $$ begin
  alter table public.cell_readings disable trigger cell_readings_notruncate;
  alter table public.usage_history disable trigger usage_history_notruncate;
  truncate public.marketplace_listings, public.cell_flag_events, public.pack_readings, public.cell_pack_history,
           public.cell_readings, public.usage_history, public.cells, public.batteries;
  alter table public.cell_readings enable trigger cell_readings_notruncate;
  alter table public.usage_history enable trigger usage_history_notruncate;
end $$;
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Every page errors, or sign-in fails | The free Supabase project is paused — open the dashboard and restore it |
| `/p/DBP-…` shows 404 after deploying | `vercel.json` is missing; it must rewrite all paths to `index.html` |
| QR code opens `localhost` | Set `VITE_PUBLIC_BASE_URL` to the deployed address and redeploy; register packs afterwards |
| "No cell at position N in the selected pack" | That cell was moved to another pack; its rows can't be imported into this one |
| "Date is in the future" | Your computer's date is earlier than the CSV's dates |
| "Cycle count cannot decrease — last recorded was N" | A cell's cycle count can only rise; check the file order and values |
| "Your account is not approved" | An admin must approve the account under *Activity* |
| Camera won't start | Needs HTTPS or localhost and camera permission; use *Upload a photo* or type the ID |

## Automated checks

During development the calculation and database rules were also checked with automated scripts: unit tests for CSV, QR and BMS parsing, database rule tests (roles, append-only, hash-chain tamper detection, concurrency) and a comparison of the browser and server health calculations on generated data. Those scripts are **not part of this repository yet**; adding them with continuous integration is on the roadmap.
