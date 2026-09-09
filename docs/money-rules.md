# How the money works

This is the reasoning behind every number the system produces. If you ever
disagree with a figure on screen, the answer is in here.

---

## Rule 1 — The rate is locked when the shipment arrives

When you mark a shipment as arrived you enter one CFA rate. That single rate
converts, for **every car in that shipment**:

- the purchase price
- the expenses inside the USA or Canada
- the tax that was kept in the cost
- that car's share of the freight

Then it is **frozen**. If the rate goes to 650 next week, these cars still cost
what they cost. A cost that changes by itself is a cost you can never check.

## Rule 2 — Cost is built in layers

```
While the car is abroad — in USD
    purchase price
  + expenses inside USA/Canada        (charged to the supplier's account)
  + tax kept in the cost              (Canada only, capped)
  = the car's cost in USD

  × the shipment's locked rate

After it arrives — in CFA
  + freight share × the same rate
  + garage labour                     (blacksmith / painter / mechanic)
  + garage parts
  = LANDED COST — what the showroom sells against
```

A car still abroad has **no CFA cost at all**. It gets one the moment its
shipment arrives, and not before.

## Rule 3 — Moving money is not spending money

Putting 30,000,000 CFA into a transfer company does not make you poorer. It
moves your own money from one pocket to another. It is **not** an expense and it
never touches profit.

A car's cost reaches your profit **in the month that car is sold**. That is why
the monthly report reads:

```
  Sales of the month
− Landed cost of exactly the cars sold this month
= Gross profit
− Running expenses (rent, salaries)
− Transfer commissions
− Exchange differences
= Real profit
```

If deposits were treated as expenses, a month where you deposited 30 million
would look like a disaster, and the month you sold those cars would look like
pure profit. Both figures would be lies.

## Rule 4 — Balances are never stored, only added up

Every account is a list of dated lines. The balance is their sum, always. So you
can always answer *why* a balance is what it is.

Lines are **never edited or deleted**. A mistake is fixed by posting a reversal,
which leaves both the error and the correction visible. This is what makes the
history trustworthy a year later.

What the sign means depends on the account:

| Account | Positive balance means | Negative means |
|---|---|---|
| Car supplier (USD) | you owe him | he owes you |
| Shipping company (USD) | you owe him | he owes you |
| Transfer company (CFA) | he is holding your money | you have overdrawn him |
| Garage worker (CFA) | you owe him | you paid in advance |
| Parts supplier (CFA) | you owe him | you paid in advance |
| Customer (CFA) | he owes you | he has overpaid |

The screen always prints the meaning next to the number, so there is no way to
read one backwards.

## Rule 5 — Canadian tax

Canadian suppliers are marked as invoicing either the **price only** or the
**price plus tax**. For price-plus-tax suppliers, on each car:

```
kept in the car's cost = the smaller of (tax, 500)
refundable to you      = anything above 500
```

A $700 tax means **$500 into the cost and $200 refundable** — the same as your
own `cost + 700 − 200`.

The refundable part is either credited by the supplier to his account, or
refunded to you separately — you choose per car. Either way it appears in the
"Tax refunds not yet received" list until you mark it as received, so it cannot
quietly be forgotten.

The $500 limit is a setting. Changing it only affects cars bought afterwards.

## Rule 6 — Exchange differences are shown, not hidden

The car's cost is locked at the arrival rate. The money is wired later, at
whatever rate applies that day. If a cost was locked at 600 and you wired at
610, the extra 10 CFA per dollar is a **real loss** — but it must not be added
back into the car, because that cost was already agreed and used.

So it appears as its own line in the monthly report, and on each supplier's
exchange-difference report.

Since supplier accounts are running accounts — you never pay "for car X" — wires
are applied to charges **oldest first**, which is how a current account is
settled in practice. Settlements that involve no exchange at all (a tax credit,
or the proceeds of a car sold abroad) reduce the debt without creating any gain
or loss.

## Rule 7 — Running expenses stay out of car costs

Rent, the showroom salary, electricity: these are subtracted at the bottom of
the monthly report, not spread across cars.

Spreading them would mean a slow month made every car look more expensive, and
you would never know what a car really cost you.

## Rule 8 — Cars sold in the origin country

A car bought in the USA and sold there never ships, never converts to CFA, and
never enters the garage. The sale is in USD and the proceeds land in that
supplier's account: they cancel part of what you owe him, and if they exceed it,
his balance flips and he owes you.

These sales are reported separately from the local CFA profit, because mixing
two currencies in one profit figure produces a number that means nothing.

---

## Rounding

- USD: 2 decimals.
- CFA: whole francs — XOF and XAF have no sub-unit in practice.
- Rates: 6 decimals.
- Every split adds back up to the total exactly. Splitting $1,000 across 3 cars
  gives 333.34 / 333.33 / 333.33 — the leftover cent goes to the first car
  rather than disappearing.
- All arithmetic uses exact decimals, never floating-point numbers. Floats lose
  fractions of a cent silently, and across a year of supplier balances those
  become real, unexplainable differences.
