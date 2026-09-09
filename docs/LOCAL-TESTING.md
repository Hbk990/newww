# Testing it on your own computer

Run the whole system on your own machine, with practice data, before it ever
touches a real car or a real supplier. Nothing here reaches the internet or
affects anything else.

Works on Windows, Mac and Linux.

---

## What you need first

**1. Node.js 20 or newer** — <https://nodejs.org> (take the LTS version).

Check it worked by opening a terminal and typing:

```bash
node --version
```

**2. MySQL.** Two ways — pick one.

<details>
<summary><b>Option A — Docker (easiest, nothing to configure)</b></summary>

Install Docker Desktop from <https://docker.com>, then run:

```bash
docker run --name showroom-db -e MYSQL_ROOT_PASSWORD=devpassword -p 3306:3306 -d mysql:8
```

That's it. Your database address is:

```
mysql://root:devpassword@127.0.0.1:3306/carshowroom
```

To stop it later: `docker stop showroom-db` · to start again: `docker start showroom-db`
</details>

<details>
<summary><b>Option B — Install MySQL directly</b></summary>

- **Windows:** the MySQL Installer from <https://dev.mysql.com/downloads/installer/> — choose "Server only" and set a root password you will remember.
- **Mac:** `brew install mysql && brew services start mysql`
- **Linux:** `sudo apt install mysql-server`

Your database address is then `mysql://root:YOUR-PASSWORD@127.0.0.1:3306/carshowroom`
</details>

---

## Set it up — one command

```bash
git clone https://github.com/Hbk990/newww.git showroom
cd showroom
npm install
npm run setup
```

`npm run setup` asks where your MySQL is, then does everything else: creates the
database, builds the tables, loads the car brands and models, loads the practice
data, and creates your login.

To skip the questions, pass the database address directly:

```bash
npm run setup -- --db "mysql://root:devpassword@127.0.0.1:3306/carshowroom"
```

---

## Start it

```bash
npm run dev
```

Then open **<http://localhost:5173>** in your browser.

```
username:  owner
password:  Showroom-Test-2026!
```

Press `Ctrl+C` in the terminal to stop it.

---

## What to try first

The practice data puts three real cars mid-journey, so you can check the
arithmetic against your own.

**1. Finish a repair and sell a car.**

Go to **Garage**. The Mercedes CLA 300 is there, showing a cost so far of
**7,550,000** — that is (10,000 + 300 expenses + 500 tax + 1,200 freight) × 600,
plus 150,000 for the painter and 200,000 of parts.

Click *Repairs finished*, set an asking price of `9000000`, then go to
**Showroom** and sell it. You should see a profit of exactly **1,450,000**.

**2. Check a supplier's account.**

**Accounts → Pierre Tremblay.** His statement reads
`10,000 → 10,700 → 10,500 → 10,800 → 0` and says **Settled**. That is the car,
the tax, the tax credited back, the expenses in Canada, and the wire that paid
him off.

**3. See why the rate matters.**

**Reports → February 2026.** The wire went out at 610 while the car's cost was
locked at 600, so there is an exchange loss of **108,000** on its own line — and
the car's cost was not touched.

**4. Buy a car yourself.**

**Buy a car.** Type `m` in the brand box and watch Mercedes-Benz, Mazda and
Mitsubishi appear. Pick the Canadian supplier and enter a tax of `700` to see
the $500 / $200 split happen as you type.

**5. Ship one car on its own.**

**Shipments → New shipment**, add just the one car, and see that a single car is
simply a shipment of one. Before you confirm the arrival, the screen shows you
exactly what each car will cost in local currency — check it against your own
calculator before clicking.

---

## Starting over

```bash
npm run db:seed:demo -- --wipe    # fresh practice data, keeps your login
npm run setup -- --fresh          # erase the database completely and rebuild
```

## Running the tests

```bash
npm test
```

65 tests: the money engine against hand-computed figures, and the whole business
driven through the real API and database.

---

## If something goes wrong

**"Could not reach MySQL"** — MySQL is not running, or the password is wrong.
With Docker: `docker start showroom-db`. Then run `npm run setup` again.

**"Port 4000 (or 5173) is already in use"** — something else is using it, or an
old copy is still running. Close the other terminal, or restart your computer.

**Page loads but nothing appears** — check the terminal running `npm run dev`
for a red error line, and make sure MySQL is still running.

**Forgot the password** — make a new one:

```bash
npm run create:user -- owner 'a-new-password-12-chars+'
```

**Anything else** — the terminal running `npm run dev` prints the real reason.
That message is what to go on.

---

## Before you use it for real

Testing locally is the right first step. But a database on your laptop is not
where a real business's accounts should live: laptops get lost, stolen and
dropped, and there is no backup.

When you are satisfied it does what you need, put it on a server following
[DEPLOYMENT.md](DEPLOYMENT.md) — with HTTPS, two-factor authentication and
nightly backups — and wipe the practice data before entering your first real
car.
