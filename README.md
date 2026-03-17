# Turo Fleet Manager

A Next.js dashboard for managing a Turo car rental fleet, powered by WhatsGPS telematics.

## Features

- **Fleet Overview** — Real-time status of all vehicles (online, moving, parked)
- **Remote Lock/Unlock** — Lock doors and cut/restore engine via WhatsGPS G21L devices
- **Lock All Idle** — One-click lock + engine kill for all cars not on active rentals
- **Auto Token Refresh** — WhatsGPS JWT tokens auto-refresh on expiry (no manual intervention)

## Tech Stack

- **Next.js 14** with App Router
- **TypeScript**
- **Tailwind CSS**
- **WhatsGPS API** for telematics
- **Vercel** for deployment

## Environment Variables

| Variable | Description |
|---|---|
| `WHATSGPS_USER` | WhatsGPS account username |
| `WHATSGPS_PASS` | WhatsGPS account password |
| `WHATSGPS_ENT_ID` | WhatsGPS entity/enterprise ID |
| `WHATSGPS_CMD_PASSWORD` | Password for engine cut/restore commands |
| `WHATSGPS_TOKEN` | (Optional) Static token — auto-login is used if empty |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your WhatsGPS credentials

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed on Vercel. Push to `main` triggers auto-deploy.

```bash
npx vercel --prod
```

## API Routes

- `GET /api/fleet` — Returns all active vehicles with status
- `POST /api/command` — Send lock/unlock/kill/restore commands

## License

Private — Eduardo Carrascosa
