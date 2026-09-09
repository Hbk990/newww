# Car Import & Showroom Management System

Buy cars from suppliers in the USA and Canada, ship them, repair what needs
repairing, sell from the showroom, and know exactly what each car cost and what
you actually made.

Built around one rule: **a car's cost is locked at the rate on the day its
shipment arrives, and never changes afterwards.**

---

## What it does

| | |
|---|---|
| **Suppliers** | USA and Canada, each with a running account in USD. Canada's tax rule is applied automatically. |
| **Buying** | Brand/model search that works offline, VIN checking, expenses abroad, problem notes. |
| **Shipments** | 1 to N cars. One car alone is a shipment of one — same screen, same maths. Freight split equally by default, editable per car. |
| **Arrival** | One rate, entered once, converts every car in the shipment and then freezes. |
| **Garage** | Blacksmith, painter, mechanic — any combination. Labour goes to the worker's account, parts to the parts supplier's. |
| **Showroom** | Stock with real landed cost, days held, and profit before you agree a price. |
| **Money** | Transfer companies as your bank, USD wires with the rate and commission, payments to everyone. |
| **Reports** | Monthly profit that counts a car's cost in the month it sells, per-car profit, stock valuation, exchange differences, Excel export. |

Every figure is explained in **[docs/money-rules.md](docs/money-rules.md)** —
read that first if a number ever surprises you.

## Running it for real

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: a small VPS, MySQL, HTTPS,
two-factor authentication and nightly backups, step by step.

## Trying it on your own computer

```bash
npm install
npm run setup     # asks where MySQL is, then does everything else
npm run dev       # open http://localhost:5173
```

Step by step, including how to get MySQL and what to check first:
**[docs/LOCAL-TESTING.md](docs/LOCAL-TESTING.md)**.

## Tests

```bash
cd server && npm test
```

- `tests/money.test.ts` — the money engine against hand-computed numbers: tax
  capping, freight splitting, rate locking, exchange differences, the monthly
  report.
- `tests/flow.test.ts` — the whole business through the real API and a real
  database: buy in Canada, ship a container, arrive and lock the rate, repair,
  sell, wire the supplier, and check every balance.

The worked example is traced end to end in both, so if a change ever breaks the
arithmetic, the tests say so before your accounts do.

## How it is built

```
server/    Fastify + TypeScript + Prisma + MySQL
  src/lib/money.ts        every calculation, as pure functions
  src/services/ledger.ts  the only place ledger entries are written
  src/routes/             the API
web/       React + Vite — plain, fast, works on a phone
scripts/   backups, user creation
docs/      the money rules and the deployment guide
```

Amounts are `DECIMAL(18,4)` in the database and `decimal.js` in code. There is no
floating-point arithmetic anywhere near money.
