# CSV import format

*Add Reading → Import a tester file (CSV)* reads the export from a battery tester and checks **every row before anything is saved**. Different testers name their columns differently, so headers are matched automatically.

## Quick start

1. Open **Add Reading** and choose the pack.
2. Click **Download template for this pack** (it lists that pack's cell IDs), or use any tester export.
3. Choose the file. The preview shows which columns were matched and a check on every row.
4. Click **Import N valid row(s)**. Rows with problems are skipped and shown with the reason.

One file imports into one pack. Comma-separated files are what has been tested; semicolon- and tab-separated files are usually auto-detected.

## Columns

| Meaning | Required? | Accepted header names (case, spaces, punctuation and units like `(V)` are ignored) |
|---|---|---|
| Cell identifier | **Yes** (ID *or* position) | `cell_id`, `cell id`, `cellid`, `cell`, `cell serial`, `serial`, `cell no`, `cell number`, `id` |
| Position in pack | Yes, if there is no cell ID | `position`, `pos`, `slot`, `index`, `channel`, `ch` |
| Voltage | **Yes** | `voltage_v`, `voltage`, `volt`, `volts`, `v`, `vcell`, `cell voltage`, `cell v`, `ocv` |
| Cycle count | **Yes** | `cycle_count`, `cycles`, `cycle`, `cycle no`, `cycle counts` |
| Internal resistance | No | `resistance_mohm`, `resistance`, `ir`, `dcir`, `acir`, `internal resistance`, `mohm`, `milliohm`, `r` |
| Temperature | No | `temperature_c`, `temperature`, `temp`, `temp c`, `t`, `celsius` |
| Date of the reading | No | `recorded_at`, `date`, `timestamp`, `time`, `datetime`, `tested at`, `test date`, `measured at` |

Examples of headers that work: `Voltage (V)`, `IR (mΩ)`, `Temp (°C)`, `Cycle Count`, `Cell #`, `Test Date`, `Slot`, `mOhm`, `Volts`. Unrecognised columns are ignored and listed in the preview.

### Identifying cells

- **By ID:** the value matches a cell ID that is *currently in the selected pack* (case-insensitive).
- **By position:** use a `position` column, **or** a cell column whose values are plain numbers (`1`, `2`, `3` …). Positions refer to the slot in the selected pack.

Position matching is what makes the sample files in `demo/` work with any four-cell pack.

## Values

| Value | Rule |
|---|---|
| Voltage | Greater than 0 and up to 6 V |
| Cycle count | A whole number, 0 or more |
| Resistance | Empty, or 0–1000 mΩ |
| Temperature | Empty, or −60 to 200 °C |
| Numbers | A decimal point (`3.31`); a single decimal comma inside quotes (`"3,31"`) is also accepted |

Empty optional values are stored as "not measured". Nothing is guessed or filled in.

## Dates

| Format | Example | Stored as |
|---|---|---|
| `YYYY-MM-DD` | `2026-08-15` | 12:00 UTC on that day |
| `DD/MM/YYYY` or `DD-MM-YYYY` | `15/08/2026` | 12:00 UTC on that day |
| ISO date-time | `2026-08-15T10:30:00Z` | exactly that time |
| *(empty)* | | the moment you import ("now") |

Impossible dates such as `31/02/2026` are rejected, and so is any date in the future. A date column lets you import **history**, which is what gives the forecast something to work with. Without dates, every reading is stamped "now", so a trend needs at least two imports on different days.

## Ordering rules

The database keeps history honest, so the importer applies the same rules and checks them for you:

- Rows are imported **per cell, oldest first**; rows without a date go last, in cycle order. The order inside your file doesn't matter.
- A cell's **cycle count can never go down**, neither within the file nor compared with its existing history.
- A reading can't be dated **before** that cell's previous reading.
- The cell must **currently be in the selected pack**.

## Source label

Imported rows are saved with the source `csv_upload`, visible in the cell's detail panel and counted separately in the technician activity table.

## Example

```csv
Cell #,Voltage (V),IR (mΩ),Temp (°C),Cycles,Date
1,3.31,24,29,20,15/02/2026
2,3.31,25,29,20,15/02/2026
1,3.29,25,30,140,15/05/2026
2,3.29,25,30,140,15/05/2026
```

A BMS-style file with no resistance or temperature is fine too:

```csv
Position,Voltage,Cycles,Date
1,3.27,520,05/09/2026
2,3.31,5,05/09/2026
```

## Troubleshooting

| Message | Meaning and fix |
|---|---|
| Couldn't find a column for: … | The file has no recognisable cell/position, voltage or cycle column — rename the header or add the column |
| Cell "X" is not in the selected pack | Wrong pack chosen, or the cell was moved to another pack |
| No cell at position N in the selected pack | The pack has no cell in that slot (for example it was reused elsewhere) |
| Voltage … is outside 0–6 V / Resistance … / Temperature … | Value outside the plausible range — check units (volts, not millivolts) |
| Cycle count … must be a whole number ≥ 0 | Decimals or negatives are not allowed |
| Unrecognised date | Use `YYYY-MM-DD` or `DD/MM/YYYY` |
| Date is in the future | The date is later than today |
| Cycle count … is lower than … on row … | The file contains a falling cycle count for the same cell |
| *Database:* "Cycle count cannot decrease — last recorded was N" | The cell already has a higher cycle count in its history |
| *Database:* "Readings must be added in time order…" | The cell already has a later reading than the date you gave |
