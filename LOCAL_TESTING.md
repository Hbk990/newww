# Running HUQA on your own machine

You need **Node.js 22.13 or newer**. Nothing else — no XAMPP, no PHP, no MySQL.
Check with `node -v`.

Everything below runs from the project folder. The database and uploaded images
are created locally inside `.wrangler/`, so nothing touches a live site.

## 1. Install

```sh
npm run install:ci
```

Takes a few minutes the first time.

## 2. Build

```sh
npm run build
```

## 3. Create the local database

Run these three, in this order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_steep_pretty_boy.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_empty_dust.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_messy_toxin.sql
```

Only needed once. Skip this step next time.

## 4. Start it

```sh
npm start
```

It prints a URL, normally `http://127.0.0.1:8787`. Open it.

## 5. (Optional) Fill it with demo data

```sh
node scripts/seed-demo.mjs
```

38 products across every shelf, three offers, five orders and four customer
files — enough to click through the whole shop before you type in your own
stock. The products have no photos; add those in the editor.

Remove it all again with:

```sh
node scripts/seed-demo.mjs --clear
```

It only ever touches the local `.wrangler` database. Never run it against a
live site.

## 6. Set the shop up

1. Go to **`/admin`** — for example `http://127.0.0.1:8787/admin`.
2. Create a username and a password (12 characters or more).
   **Copy the recovery code it shows you.** It appears once and is the only way
   back in if you forget the password.
3. In the left sidebar open **Storefront**, check the WhatsApp number and the
   delivery fee, switch **"Your shop is live"** on, and save. (The demo seed
   already switches it on for you.)
4. Add a few products with **Add product**, then look at the shop on `/`.

Until the shop is switched live it shows a "coming soon" page — that is expected, not a bug.

## Working on it

`npm run dev` gives you a development server that reloads as files change.
After editing anything you want to see in `npm start`, run `npm run build` again.

## Starting over

Delete the `.wrangler` folder and redo step 3. That wipes the local products,
orders, customers, images and your admin login. It does not touch a live site.
