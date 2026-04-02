# IfYouBought

Premium crypto what-if calculator built with:

- plain HTML
- modern CSS
- vanilla JavaScript
- a minimal Node server that serves the app and proxies market data

## Local run

1. Copy `.env.example` to `.env`
2. Optionally set `CRYPTOCOMPARE_API_KEY`
3. Run:

```bash
npm start
```

The app runs on `http://127.0.0.1:4173` by default.

## Deploy

This project is not static-only anymore. It needs a Node host because the frontend calls the local proxy under `/api/market/*`.

Recommended hosts:

- Render
- Railway

Environment variables:

- `CRYPTOCOMPARE_API_KEY`
- `PORT` is provided by the host
- `HOST` can be left unset

Start command:

```bash
npm start
```
