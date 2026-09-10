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

## Rule 9 — A customer's payment lands in an account immediately

You sell a car and the money goes into the cash box that moment. So recording
the payment **is** recording the money arriving — the system credits the account
you choose (normally the cash box) in the same action.

This means one thing you must not do: **never enter money from a car sale on the
Deposit screen as well.** It is already in. Entering it twice would show cash you
do not have.

Moving that money onwards to a transfer company is a **transfer between two of
your own accounts**, not a new deposit. Use *Move between accounts*. Your total
treasury does not change — only which account holds it. Recording a move as a
deposit would inflate your total by the amount moved, every time you did it.

The Deposit screen is only for money coming in from **outside** the business:
your own capital, or a loan.

### The two lists

Every sale sits on one of two lists:

- **Still owing** — the buyer has not paid in full
- **Paid in full** — nothing left to collect

A sale moves from the first to the second **by itself**, the moment the last
franc arrives. There is nothing to tick and nothing to remember.

## Rule 10 — Costs are corrected, never deleted

A car was sold and you notice a 100,000 repair was recorded twice. Deleting the
wrong line would raise that car's reported profit by 100,000 and leave nothing
to say why — a year later, nobody could explain the change.

So a mistake is fixed by **adding a correction**, not removing a line:

- the original repair, part or expense stays **exactly as it was recorded**
- a correction sits beside it carrying the difference and **your reason**
- the car's cost becomes the original plus the corrections, so the profit is
  right everywhere it is reported
- both the mistake and the fix stay visible for as long as the car exists

If the mistake also changed what you owe someone — an amount charged to the
wrong worker — naming that account corrects their balance in the same action.

This is the same principle as Rule 4, applied to costs instead of balances:
history is added to, never rewritten.

---

## Rule 11 — A deposit is cash you hold, not money you have earned

A buyer puts something down to hold a car until he comes back with the rest.

The money is real and it is in your hands the moment he hands it over, so it
goes into an account straight away, exactly like any other receipt. What it is
**not** is profit: the car has not been sold, and nothing about its cost has
happened yet.

So a deposit does three things and no more:

- it adds to the balance of the account it went into
- it holds that car — the system will not sell it to anybody else while the
  deposit stands
- it counts towards the price when the sale is finally recorded, **without the
  cash being taken a second time**

It ends in one of three ways:

| What happens | What the system does |
|---|---|
| He buys the car | The deposit becomes part of the payments on that sale. The money already in the account is not re-entered. |
| He walks away and you give it back | A line takes the money back out of the account it went into. |
| He walks away and you keep it | The money stays where it is, and it is reported as income — never left in the cash box with nothing to explain it. |

The car cannot be sold to a different buyer while a deposit is standing on it.
Release the deposit first — refunded or kept — and then sell it. That is the
system refusing to let a car be promised to two people at once.

---

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
