# Updating to a new version without losing what is in the system

The short answer: **you never delete the database**. You replace the
application files and run one command that adds the new tables to the database
you already have. Your cars, suppliers, balances, sales and login stay exactly
where they are.

---

## Why this is safe

The system keeps a list of database changes — "migrations" — inside
`server/prisma/migrations`. Each one is a small, dated step, and the database
itself records which steps it has already had applied. When you run the update
command it looks at that record and applies **only the steps your database has
not seen yet**. Running it twice does nothing the second time.

Every step is written to **add** — a new table, a new column that starts empty.
None of them drop a table, empty a table, or rewrite a column. So there is no
version of the update that can lose a car.

---

## The update, step by step

### 1. Back up first — always

Do this even though the update is safe. A backup takes ten seconds and it is
the only thing that protects you from a mistake of your own.

**Windows PowerShell, with MySQL in Docker:**

```powershell
docker exec showroom-db mysqldump -u root -pShowroom-Root-2026 --databases carshowroom > backup-before-update.sql
```

**On a server, MySQL installed directly:**

```bash
mysqldump -u root -p --databases carshowroom > ~/backup-before-update.sql
```

Check the file is not empty (`dir backup-before-update.sql` / `ls -lh`).

### 2. Stop the application

Close the window it is running in, or on a server:

```bash
sudo systemctl stop showroom
```

### 3. Put the new files in place

Extract the new ZIP into a **new folder** — do not extract it on top of the old
one, or deleted files would be left behind.

Then copy two things from the old folder into the new one:

| Copy this | Why |
|---|---|
| `server/.env` | your database password and session secret |
| `server/uploads/` | the car photos, if you have added any |

Nothing else needs to come across. The database is not in the folder at all —
it lives inside MySQL, which you have not touched.

### 4. Apply the new database steps

From inside the new folder:

```powershell
npm ci
npm run db:migrate
npm run generate --workspace=server
npm run build
```

`npm run db:migrate` is the one that matters. It prints which steps it applied,
or `No pending migrations to apply` if your database is already up to date.

### 5. Start it again

```powershell
npm start
```

Sign in and check the dashboard shows the same number of cars as before.

---

## What each command actually does

| Command | What it does | Can it lose data? |
|---|---|---|
| `npm run db:migrate` | Adds the new tables and columns | **No** — it only adds |
| `npm run generate` | Rebuilds the code's picture of the database | No, it touches no data |
| `npm run build` | Rebuilds the screens | No |
| `npm run db:seed:demo -- --wipe` | Loads practice data | **YES — erases cars and accounts** |
| `npm run db:seed:large -- --wipe` | Loads the 50-car practice data | **YES — erases cars and accounts** |
| `npm run setup -- --fresh` | Builds a database from nothing | **YES — erases everything** |

Only the last three can destroy anything, and each says so before it runs. If
you are updating a system with real cars in it, you want the first three and
nothing else.

---

## If the update goes wrong

Restore the backup you took in step 1 and go back to the old folder:

```powershell
docker exec -i showroom-db mysql -u root -pShowroom-Root-2026 < backup-before-update.sql
```

```bash
mysql -u root -p < ~/backup-before-update.sql
```

Then say what the error was — a failed migration is a bug worth fixing, not
something to work around.

---

## A note on backups in general

Take one **every day** once you have real cars in the system. `scripts/backup.sh`
does it on a Linux server; on Windows the `mysqldump` line above is the same
thing. Keep the copies somewhere other than the machine running the system — a
backup on the same disk does not survive the disk.
