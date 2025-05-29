# Perpetual Futures Trading App

A decentralized perpetual futures trading platform for crypto assets. The app provides a full-stack, non-custodial trading experience with real-time updates, secure vaulting of user tokens via a Rust-based smart contract, and backend computation for order management and liquidation. Built with a modern React frontend, Rust smart contracts (on Solana), Node backend, Websocket for real time updation and a PostgreSQL database via Prisma.

---

## Screenshot

**Trading Dashboard Example**

![Perpetual Futures Trading Dashboard Screenshot](https://drive.google.com/uc?export=view&id=1lW5gFFFzhWOmvGQviaI8AMJFivkU3PZE)

_Above: Example dashboard displaying live positions, market data, and user wallet info_

---


## Features

- Seamless integration with [Phantom Wallet](https://phantom.app/) for easy staking and trading.
- Buy (long) or short crypto assets at current market prices.
- Real-time mark price, funding rate, borrow rate, and position updates via WebSockets.
- Non-custodial architecture: user funds are escrowed in a smart contract vault, never stored on backend wallets.
- Automated backend computations for position management and risk checks.
- Auto-liquidation if collateral risks are triggered (collateral equals fees, stop loss, take profit, liquidation price hit).
- Persistent, auditable user and trade management using PostgreSQL & Prisma.
- Comprehensive smart contract tests (`deposit.js`, `initialise.js`, `release.js`).

---

## Architecture Overview

Frontend (React) <--> Backend (Node/Express + WebSockets) <--> PostgreSQL (Prisma)
       |                                                   |
 Phantom Wallet        <----------------------------->
                      Smart Contract (Rust, Escrow/Vault)

---

## 1. Frontend (React)

- **Wallet Connection:** Integrates Phantom wallet for authentication and token transactions.
- **Trading Interface:** Users can stake, buy, or short crypto positions.
- **Real-time Updates:** All key trading metrics (e.g., mark price, funding rate, position size) are updated instantly via WebSocket.
- **Position Management:** Users can view open/closed positions and account health.

---

## 2. Smart Contract (Rust — Escrow Vault)

- **Escrow Logic:** When a user opens a position, tokens are transferred from their wallet into a contract-controlled vault. Tokens remain escrowed until the position closes.
- **Settlement:** On position close, tokens are released from the escrow/vault: if the trade is profitable, backend wallet pays gains to user; otherwise losses are deducted.
- **Security:** All critical flows (deposit, release, initialize) are tested via JS test files.
- **No Backend Custody:** At no time can backend impermissibly move user funds—smart contract logic fully governs asset transfers.

---

## 3. Backend Server

- **Technology:** Node.js/Express
- **Role:** Handles heavy computation—P&L calculation, funding, fees, and position liquidation logic and liquidates position automatically if liquidation conditions are met.
- **WebSocket Server:** Sends live updates to the frontend for:
  - Mark price
  - Funding/borrow rate
  - Position size/status
  - liquidation
- **API Endpoints:** Provide RESTful/GraphQL APIs to serve market and user data.
- **Automated Liquidation:**
  - Monitors each open position.
  - Triggers auto-liquidation and settlement if collateral is depleted, liquidation price reached, stop loss, or take profit is hit.
  - Contacts smart contract to handle the settlement.
- **Security:** All API and WebSocket actions are permissioned for authenticated users only.

---

## 4. Database (PostgreSQL + Prisma)

**Schema Overview:**

| Table              | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `User`             | Each open position: collateral, size, market, direction, entry/exit prices. |
| `UserClosed`       | Historical archive of all closed/settled trades for record and audit.       |

- **Prisma ORM** used for schema management and migration.
- **Position Lifecycle:** All trades recorded from open (Position) to close (UserClosed).
- **Audit and Analytics:** Enables analytics, historical P&L analysis, compliance.

---

## 5. Smart Contract Test Files

- `lib.rs` contract file for the vault and settlements

- `deposit.js`, `initialise.js`, `release.js` in the tests/ directory verify that:
  - Deposits are properly escrowed
  - Positions are initialized only with correct parameters
  - Funds are only released on valid close/triggers

---

## Getting Started

### Prerequisites

- Node.js v18+
- Yarn or npm
- [Phantom Wallet](https://phantom.app/)
- Rust toolchain (for contract compilation)
- Docker (for PostgreSQL)

### Setup

1. **Clone the repo:**
git clone https://github.com/your-username/perpetual-futures-trading-app.git

2. **Frontend:**

````bash
npm i
npm run dev
````

3. **Database:**

````bash
cd packages/db npx prisma migrate dev --name init
````
Add DATABASE_URL in .env for the postgres DB running in docker/server

4. **Backend:**

````bash
cd server
npm run dev
````

5. **Smart Contract:**

````bash
cd escrow/trading_escrow anchor build-bpf
anchor build
anchor deploy
````
change the PROGRAM ID after deployment

---

## Contributing

Contributions, issues, and feature requests are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

MIT

---

## Acknowledgements

- [Phantom Wallet](https://phantom.app/)
- [Solana](https://solana.com/)
- [Prisma ORM](https://www.prisma.io/)
