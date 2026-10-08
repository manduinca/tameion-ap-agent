# Tameion AP Agent

An autonomous accounts-payable agent for a real company (Deep Skill, Peru), built for the
[Tameion Agents Hackathon](https://tameion.thecanteenapp.com/) by Canteen and Circle.

The agent reads vendor invoices from email and from the company's Odoo ERP, checks them for
duplicates and amount anomalies, and decides to pay, hold or escalate with a written rationale.
Payments settle in USDC on Arc through Circle Developer-Controlled Wallets, within spending
limits and approval thresholds enforced by an on-chain contract. Every decision is logged and
reconciled back to Odoo.

Our vendors (Google Workspace, Cloudflare, DigitalOcean, Meta) do not accept USDC, so each one
has its own vendor wallet on Arc testnet.

## Status

Work in progress during the hackathon (Sep 27 - Oct 17, 2026).

- [x] Circle entity secret and SCA wallets on `ARC-TESTNET` (`scripts/setup.mjs`)
- [ ] Spending-limit treasury contract
- [ ] Invoice ingestion (email + Odoo) and checks
- [ ] Agent decisions, payments and Odoo reconciliation

## Setup

Requires Node.js 22+ and a Circle testnet API key.

```bash
npm install
cp .env.example .env   # set CIRCLE_API_KEY; CIRCLE_ENTITY_SECRET is a new 32-byte hex secret
node scripts/setup.mjs # registers the entity secret, creates the wallets, prints balances
```

New Circle accounts get HTTP 403 from the faucet API; fund the treasury wallet ID from the
console faucet instead.
