# CryptoGate — Payment & Crypto Wallet Gateway for MT5

Crypto deposits and withdrawals for MT5 brokerage accounts. Supported assets: **USDT (TRC20 / ERC20 / BEP20), BTC and SOL**.

- HD wallet address per client on every network (watch-only xpub derivation; SLIP-10 for Solana)
- On-chain listeners with confirmation tracking and a re-org guard
- MT5 balance auto-credit (idempotent) after confirmations
- Withdrawals with an MT5 hold, finance review, hot-wallet signing, and confirmation tracking
- Sweeper: gas top-up, then sweep to the hot wallet (up to its target) or to cold storage. BTC uses multi-input UTXO consolidation
- RabbitMQ workers with retry/backoff and dead-letter queues, Redis locks, and Socket.IO realtime (Redis adapter + emitter)
- Signed (HMAC-SHA256) webhooks for CRM and RMS
- **Mock mode**: a built-in chain simulator plus seed data, so every flow can be tested in realtime with no RPC and no funds

```
payment-crypto-gateway/
├── backend/            Node.js · Express 5 · Mongoose · Redis · RabbitMQ · Socket.IO
├── frontend/           Next.js 16 (App Router) · MUI 9 · MUI X DataGrid/Charts
├── api-tests/          Postman collection + .http file (REST Client)
└── docker-compose.yml  MongoDB (replica set) · Redis · RabbitMQ
```

## Quick start

```bash
# 1. infra
docker compose up -d                       # mongo rs0, redis, rabbitmq (UI: http://localhost:15672 guest/guest)

# 2. backend
cd backend
cp .env.example .env
npm install
npm run seed                               # wipes + seeds mock data (clients, 14 days of history)
npm run dev                                # API :4000 + workers in-process (RUN_WORKERS_IN_API=true)

# 3. frontend
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev                                # http://localhost:3000
```

Logins (password `Passw0rd!`). The login page also has one-click demo buttons.

| Email | Role |
|---|---|
| `admin@gateway.test` | admin (back office + simulator + config) |
| `finance@gateway.test` | finance (back office) |
| `client@gateway.test` | client: Omar Haddad, MT5 5100100 (7 more clients are seeded) |

## Realtime testing (mock mode)

Open the **client portal** in one browser and the **back office** in another (or a private window), then:

1. **Back office → Simulator → Broadcast deposit** to a client. The tx goes into the mock mempool, the block ticker mines it, the listener detects it, and confirmations tick up live in both UIs. At the threshold a `deposit.confirmed` message goes to RabbitMQ. The credit worker then credits MT5, and the client's balance updates live.
2. **Burst / Auto traffic**: random deposits (and some withdrawal requests) across all clients.
3. **Mine +N blocks** on a network to skip ahead (BTC needs 2 confirmations, ETH 12, BSC 15, TRON 19, SOL 32).
4. **Client → Withdraw**: MT5 is debited immediately. **Back office → Withdrawals → Approve** sends it from the hot wallet and tracks confirmations until it completes. Reject refunds MT5.
5. **Treasury → Force sweep all**: gas top-ups and sweeps run as a visible state machine.
6. **Webhooks & Audit → Live receiver**: shows every signed webhook the gateway emits.

You can also use `api-tests/gateway.postman_collection.json` (run *Auth* first) or `api-tests/gateway.http`.
`MOCK_SPEED=3` makes blocks 3× faster.

## Architecture

```
              ┌──────────── API process (Express + Socket.IO) ────────────┐
 Next.js ───► │ /auth /client /admin /dev        JWT roles client|finance|admin │
   ▲          └─────────────┬──────────────────────────────┬───────────────┘
   │ socket.io (redis       │ publish                       │
   │ adapter / emitter)     ▼                               ▼
   │               RabbitMQ: deposit.confirmed · withdrawal.approved · sweep.run · webhook.out  (+ .dead DLQs)
   │                        │
   │          ┌─────────── Worker process ─────────────────────────────────────┐
   └───────── │ listeners (1/network) → recordDetected → refreshConfirmations   │
              │ credit worker → MT5 (mock | .NET bridge)                          │
              │ withdrawal worker → signer → chain adapter                        │
              │ sweeper (plan + advance state machine) · price feed · webhooks    │
              └───────────┬───────────────────────────────────────────────────┘
                          ▼
              Chain adapters: mock (simulator) | live (EVM · TronGrid · Esplora · Solana RPC)
```

Run the API and the workers separately in production: set `RUN_WORKERS_IN_API=false`, then run `npm start` and `npm run worker`. Listeners and the sweeper take Redis locks, so extra worker replicas won't double-process.

### State machines

- **Deposit:** `confirming → confirmed → crediting → credited`, plus `credit_failed` (retry button / auto-retry), `below_minimum` and `orphaned` (re-org guard).
- **Withdrawal:** `pending_review → approved → processing → broadcast → completed`, plus `awaiting_liquidity` (re-queued automatically after a hot-wallet sweep), `rejected` / `cancelled` (MT5 refunded) and `failed`.
- **Sweep:** `pending → gas_topup → sweeping → completed | failed`. On failure the deposits are released for the next cycle.

### Idempotency and safety

- Deposits are unique on `(network, txHash, outputIndex)`. The listener only inserts, so rescans are harmless.
- MT5 calls carry idempotency keys (`dep:<id>`, `wd:<id>`, `wd-refund:<id>`). Status flips are conditional (`findOneAndUpdate` on the expected state) and wrapped in Redis locks.
- A refund always happens *before* the status changes to rejected or cancelled.
- The API only needs **xpubs** for address derivation. Everything that touches the mnemonic or private keys lives in `backend/src/signer/`, which is the boundary to extract into an isolated signer service (HSM/KMS) before mainnet.

### HD derivation

| Network | Deposit path (client *i*) | Hot wallet |
|---|---|---|
| TRON | `m/44'/195'/0'/0/i` | `m/44'/195'/1'/0/0` |
| ETH / BSC | `m/44'/60'/0'/0/i` (same address on both chains) | `m/44'/60'/1'/0/0` |
| BTC (BIP84 P2WPKH) | `m/84'/1'/0'/0/i` (testnet) | `m/84'/1'/1'/0/0` |
| SOL (SLIP-10) | `m/44'/501'/(i+1)'/0'` | `m/44'/501'/0'/0'` |

Run `npm run derive` to print the first addresses for the configured mnemonic.

## Going live (testnets first)

The default `MASTER_MNEMONIC` is the public Hardhat test phrase, so anyone can drain those addresses. **Generate your own phrase** before using any real testnet funds, and never use this setup on mainnet as-is.

1. `CHAIN_MODE=live`, then set the RPC URLs and USDT contracts in `.env`.
2. **EVM (ETH/BSC)** is fully wired: log scanning, balances, and native + ERC20 sends via ethers.
3. **TRON / BTC / SOL** have the read path live (detection, confirmations, balances). Sending is stubbed with `NotImplementedError` and goes into the signer service (tronweb, PSBT via `@scure/btc-signer`, `@solana/web3.js`).
4. `MT5_MODE=bridge` plus `MT5_BRIDGE_URL`: the REST contract the .NET bridge must expose is documented in `backend/src/services/mt5/bridge.js`.
5. Point `WEBHOOK_URLS` at the CRM and RMS, and verify the `x-gateway-signature` header (`t=<ts>,v1=hmac_sha256(secret, "<ts>.<body>")`).
6. Before mainnet: isolated signer/HSM, KYT/AML screening on withdrawal addresses, address whitelisting, 2-person approval above a threshold, and indexer/webhook providers instead of per-address polling.

## Main endpoints

| | |
|---|---|
| `POST /api/auth/login` · `GET /api/auth/me` | auth |
| `GET /api/client/account · wallets · deposits · withdrawals` | client portal |
| `GET /api/client/withdrawals/quote` · `POST /api/client/withdrawals` · `POST …/:id/cancel` | withdrawals |
| `GET /api/admin/stats · deposits · withdrawals · sweeps · treasury · clients · addresses · webhooks · audit` | back office |
| `POST /api/admin/withdrawals/:id/approve · reject · retry` · `POST /api/admin/deposits/:id/retry-credit` · `POST /api/admin/sweeps/run` | operations |
| `POST /api/dev/simulate/deposit · simulate/burst · chain/:net/mine · traffic · fund-hot-wallets` | simulator (mock only) |

Socket events: `deposit:new`, `deposit:update`, `withdrawal:new`, `withdrawal:update`, `sweep:update`, `mt5:balance`, `chain:block`, `price:update`, `webhook:received`, `traffic:state`.
# payment_crypto_gateway
