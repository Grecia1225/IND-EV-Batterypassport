# 🔋 IND-EV Battery Passport

> A digital battery lifecycle record and health assessment app for EV battery packs in India.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://battery-passport-eight.vercel.app)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ECF8E?logo=supabase&logoColor=white)
![Deployed on Vercel](https://img.shields.io/badge/Vercel-deployed-000000?logo=vercel&logoColor=white)

**Live demo:** https://battery-passport-eight.vercel.app

---

## 📖 Overview

Battery Passport gives every EV battery pack a traceable digital identity. Technicians register a pack and log cell or pack readings manually, by CSV upload, or directly from a supported Bluetooth BMS. Anyone can then open a pack's **passport** to see its health, provenance and usage history, compare packs side by side, scan a QR code, or browse resale listings.

It is built to support second-life decisions (reuse, repurposing, resale) with transparent, data-backed battery health instead of guesswork.

## ✨ Features

- **Battery passport**: per-pack page with health assessment, provenance and usage history
- **Pack registration**: register new packs, each with a shareable QR code
- **Flexible reading entry**: manual form, CSV import, or live Bluetooth BMS capture
- **Bluetooth BMS support**: connects over Web Bluetooth and decodes the JBD BMS protocol
- **Health calculations**: computes pack health from stored readings
- **Technician dashboard**: fleet-level summaries across all registered packs
- **Battery directory**: browse and search all packs
- **Pack comparison**: compare health of multiple packs side by side
- **Marketplace**: resale listings backed by each pack's health summary
- **QR scanning**: scan a pack's QR code to open its passport
- **Activity log**: audit trail of changes
- **Write approval gate**: write actions are restricted to approved users
- **Demo data fallback**: the app works with sample records when no backend is configured

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, React Router 7 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS 4, Lucide icons |
| Backend / Auth / DB | Supabase (`@supabase/supabase-js`) |
| Data import | PapaParse (CSV) |
| QR | `qrcode` (generate), `jsQR` (scan) |
| Hardware | Web Bluetooth API (JBD BMS protocol) |
| Hosting | Vercel |

## 🏗️ Architecture

```mermaid
flowchart TD
    U[Battery users] --> App[Route application<br/>App.tsx]
    App --> Auth[Authentication]
    App --> Home[Battery directory]
    App --> Passport[Battery passport]
    App --> Register[Pack registration]
    App --> Add[Reading entry]
    App --> Dash[Technician dashboard]
    App --> Market[Marketplace]
    App --> Scan[QR scan]
    App --> Compare[Pack comparison]
    App --> Log[Activity log]

    Register --> Gate[Write approval gate]
    Add --> Gate
    Dash --> Gate
    Log --> Gate

    Add --> CSV[CSV parsing]
    Add --> BMS[BMS connection panel]
    BMS --> BT[Bluetooth transport]
    BMS --> JBD[JBD BMS protocol]

    Passport --> Calc[Health calculations]
    Dash --> Fleet[Fleet summaries]
    Fleet --> Calc
    Compare --> Calc

    Register --> Data[Data access]
    Add --> Data
    Passport --> Data
    Fleet --> Data
    Market --> Data
    Log --> Data
    Compare --> Data

    Auth --> SB[(Supabase)]
    Data --> SB
    Home -.fallback.-> Demo[Demo records]
    Compare -.fallback.-> Demo
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- A [Supabase](https://supabase.com) project (optional, the app falls back to demo data without one)
- A Chromium-based browser (Chrome, Edge) if you want to use Bluetooth BMS capture

### Installation

```bash
git clone https://github.com/Grecia1225/IND-EV-Batterypassport.git
cd IND-EV-Batterypassport
npm install
```

### Environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> ⚠️ Never commit your real `.env` file. Only the anon (public) key belongs in the frontend.

### Database

Apply the schema in the [`supabase/`](./supabase) folder to your Supabase project (via the SQL editor or the Supabase CLI).

### Run locally

```bash
npm run dev
```

### Production build

```bash
npm run build
npm run preview
```

## 📡 Adding Readings

| Method | How |
|---|---|
| Manual | Fill in the form on the *Add Reading* page |
| CSV | Upload a CSV file of cell/pack readings on the *Add Reading* page |
| Bluetooth BMS | Connect a supported JBD BMS from the *Add Reading* page and save the live data |

> Bluetooth requires HTTPS (or `localhost`) and a browser with Web Bluetooth support.

## ☁️ Deployment

The project is configured for [Vercel](https://vercel.com) (see `vercel.json`):

1. Import the repo into Vercel
2. Add the two `VITE_SUPABASE_*` environment variables
3. Deploy

## 🗺️ Roadmap

- [ ] Support for additional BMS protocols beyond JBD
- [ ] Exportable PDF passport
- [ ] Compliance mapping to the Indian battery standards and EU Battery Passport fields
- [ ] Automated tests and CI

## 🤝 Contributing

Contributions, issues and feature requests are welcome. Fork the repo, create a branch, and open a pull request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

## 👤 Author

**Grecia1225** · [GitHub](https://github.com/Grecia1225)
