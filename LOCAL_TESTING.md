# Running HUQA on your own machine

Works on Windows, macOS and Linux. You need **Node.js 22.13 or newer** and
nothing else — no XAMPP, no PHP, no MySQL.

Get it from [nodejs.org](https://nodejs.org) (the LTS button). Check it with
`node -v`.

## Open a terminal in the project folder

The folder is the one containing `package.json`.

- **Windows** — open the folder in File Explorer, click the address bar, type
  `powershell` and press Enter.
- **macOS** — right-click the folder, Services, New Terminal at Folder.

## Set it up

```sh
npm run setup
```

Installs dependencies, builds, and creates the local database. A few minutes the
first time. Safe to run again — it skips whatever is already done.

> Do **not** run `npm run install:ci`. That is the hosting platform's installer:
> a bash script that needs Linux `flock` and GNU `timeout`, so on Windows it
> fails with `execvpe(/bin/bash) failed: No such file or directory`.
> `npm run setup` replaces it.

## Fill it with demo data (optional)

```sh
npm run demo
```

38 products across every shelf, three offers, five orders and four customer
files — enough to click through the whole shop before you type in your own
stock. The demo products have no photos; add those in the editor.

Remove it all again with `npm run demo -- --clear`. It only ever touches the
local `.wrangler` database, never a live site.

## Start it

```sh
npm start
```

Open **http://127.0.0.1:8787**. Leave that terminal window open — closing it
stops the site.

## Create your admin login

Go to **http://127.0.0.1:8787/admin** and pick a username and a password of at
least 12 characters. **Copy the recovery code it shows you** — it appears once
and is the only way back in if you forget the password.

Then open **Storefront** in the sidebar to set the WhatsApp number, the delivery
fee, and the live/hidden switch. Until the shop is switched live, visitors see a
"coming soon" page — that is expected, not a bug. (`npm run demo` switches it on
for you.)

## Day to day

- Starting it again later: just `npm start`.
- After changing any code: `npm run build`, then `npm start`.
- `npm run dev` instead gives you a server that reloads as you edit, on
  http://127.0.0.1:5173.

## Starting completely fresh

Delete the `.wrangler` folder and run `npm run setup` again. That wipes the local
products, orders, customers, images and your admin login. It does not touch a
live site.

## If something goes wrong

- `execvpe(/bin/bash) failed` — you ran `install:ci`. Use `npm run setup`.
- `Could not find pnpm 11.25.0` — run `npm install -g pnpm@11.25.0` once, then
  `npm run setup` again.
- `This project needs Node 22.13 or newer` — update Node from nodejs.org.
- Anything else — copy the red error text and send it over.
