# Telegram Model & Financial Management Dashboard (`model.autoacts.link`)

Production-ready, modular full-stack agency and creator financial management dashboard with automated background workers for Telegram adult/creator channels.

---

## 🌟 Key Capabilities

1. **Telegram MTProto Background Sync (GramJS)**:
   - Automated 15-minute cron worker using a dedicated session string to query native Telegram `payments.getStarsTransactions`.
   - 21-day holding period calculation (`maturesAt = transactionDate + 21 days`).
   - Maturity cron updating status from `PENDING` to `MATURED`.

2. **100% Recoupment & 50/50 Split Financial Engine**:
   - **100% Recoupment:** All matured revenue first satisfies open investments (`openInvestBalance` and logged `Expense` items).
   - **50/50 Profit Split:** Once investments reach $0, all additional matured income is split 50% to Management and 50% to the Partner.
   - **3-Phase Visual Pipeline:**
     - **Locked / Pending:** Escrowed revenue within the 21-day holding period.
     - **Recouping:** Matured funds actively paying down initial investments.
     - **Available for Payout:** Liquid net profit available for immediate withdrawal.

3. **xAI Grok Scheduling Engine**:
   - Automated posting schedule generator using xAI Grok API with **Strict JSON Mode**.
   - Generates high-engagement captions, peak interaction timestamps, and sets paywall pricing (Free `0 Stars` for `TEASER` assets, `50-500 Stars` paywall for `PPV` assets).
   - Enqueued via BullMQ with delay timers.

4. **Telegram Bot API Content Delivery**:
   - Dispatches scheduled posts to channels via `sendPhoto`, `sendVideo`, `sendMessage`, and `sendPaidMedia` for Stars paywalls.

5. **Client-Side TON Wallet & On-Chain Payout Ledger**:
   - Zero-knowledge client-side 24-word mnemonic generation & address derivation using `@ton/crypto` and `@ton/ton`.
   - TON blockchain transaction hash verification on-chain via TonCenter / TonAPI RPC before booking into the audit ledger.

6. **DevOps & VPS Deployment**:
   - Complete `docker-compose.yml` orchestration with App, Worker, PostgreSQL 16, Redis 7, and Caddy reverse proxy with automatic SSL for `model.autoacts.link`.

---

## 🛠 Tech Stack

- **Frontend:** Next.js 14+ (App Router), React 18, Tailwind CSS, Shadcn/UI patterns, Lucide Icons, TanStack.
- **Backend:** Node.js (TypeScript), Next.js API Routes, BullMQ Workers.
- **Database & ORM:** PostgreSQL 16 with Prisma ORM.
- **Queue & Scheduler:** Redis 7 with BullMQ.
- **APIs & Protocols:**
  - xAI Grok API (`https://api.x.ai/v1`)
  - Telegram Bot API (`sendPaidMedia`, `sendPhoto`, etc.)
  - Telegram MTProto API via GramJS (`telegram`)
  - The Open Network (`@ton/ton`, `@ton/crypto`, TonCenter RPC)
- **Edge / Reverse Proxy:** Caddy 2 with automatic Let's Encrypt SSL.

---

## 🚀 Quickstart & Local Development

### 1. Prerequisites
- Node.js 20+ installed
- PostgreSQL 16 & Redis 7 running locally or via Docker

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 4. Database Setup & Seeding
```bash
# Push schema to database
npm run prisma:push

# Seed with demo models, assets, and 3-stage transactions
npm run prisma:seed
```

### 5. Generate MTProto Session String (GramJS)
To authenticate the background worker to fetch `payments.getStarsTransactions` from channel channels you manage:
1. Obtain your `API_ID` and `API_HASH` from [https://my.telegram.org/apps](https://my.telegram.org/apps).
2. Run the interactive login helper:
```bash
npm run telegram:login
```
3. Enter your phone number and 2FA code. Copy the generated session string into your `.env` as `TELEGRAM_SESSION_STRING`.

### 6. Run the Next.js App & Worker
```bash
# Terminal 1: Next.js Frontend & API
npm run dev

# Terminal 2: BullMQ & MTProto Background Worker
npm run worker
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## 🚢 Production Deployment (Self-Hosted VPS)

The application is engineered to run seamlessly on your VPS behind a Caddy reverse-proxy mapped to `model.autoacts.link`.

### 1. DNS Configuration
Ensure your DNS records point to your VPS IP:
- `A` record: `model.autoacts.link` -> `YOUR_VPS_IP`
- Or wildcard: `*.autoacts.link` -> `YOUR_VPS_IP`

### 2. Clone & Configure on VPS
```bash
git clone <repo-url> /opt/model-dashboard
cd /opt/model-dashboard

# Setup production environment
cp .env.example .env
nano .env # Enter production database passwords, Telegram keys, and xAI key
```

### 3. Launch Docker Compose Stack
```bash
docker compose build
docker compose up -d
```

Docker Compose will start:
- `model_postgres`: PostgreSQL 16 (persisted volume `postgres_data`)
- `model_redis`: Redis 7 (persisted volume `redis_data`)
- `model_app`: Next.js 14 Web Application on port 3000
- `model_worker`: Node.js Background Worker for MTProto 15m Sync & BullMQ Schedulers
- `model_caddy`: Caddy reverse-proxy handling HTTPS / SSL certificates automatically on ports 80 & 443

### 4. Apply Database Migrations on Production
```bash
docker compose exec app npx prisma db push
docker compose exec app npx tsx prisma/seed.ts # Optional demo seed
```

---

## 📐 Financial Engine Math & Logic

Let:
- $E$ = Total investments/expenses (`openInvestBalance` + logged expenses)
- $R_{matured}$ = Sum of all Telegram Stars transactions where `now() >= maturesAt`
- $R_{pending}$ = Sum of all Telegram Stars transactions where `now() < maturesAt` (Locked)

```
1. Recouped USD        = min(R_matured, E)
2. Open Invest Balance = max(0, E - R_matured)
3. Gross Profit USD    = max(0, R_matured - E)
4. Partner 50% Share   = Gross Profit USD * 0.5
5. Management Share    = Recouped USD + (Gross Profit USD * 0.5)
6. Liquid Payout Avail = Partner 50% Share - Total Paid Out
```

---

## 🔒 Security & Client-Side TON Wallet Generation

1. **Non-Custodial Keys:**
   The 24-word recovery phrase is generated directly in browser memory using `@ton/crypto`. The secret never touches any network socket or database.
2. **Blockchain Verifiability:**
   Any recorded TON payout requires on-chain proof. The system queries TON RPC nodes using the `txHash` to verify recipient, block confirmation, and amount before booking.
