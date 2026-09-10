# Putting the system online

You chose a cloud deployment with a hard password and two-factor
authentication. This is how to set that up on a small VPS you control.

**What you need:** a VPS with 2 GB of RAM (about $6–12/month), a domain name,
and about an hour.

---

## 1. The server

Any Ubuntu 22.04 or 24.04 machine will do. Sign in as root and install what is
needed:

```bash
apt update && apt upgrade -y
apt install -y mysql-server nginx git curl ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
```

Lock down the firewall — only web traffic and SSH get in:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

MySQL must never be reachable from the internet. It listens only on the machine
itself by default; confirm that `bind-address = 127.0.0.1` is set in
`/etc/mysql/mysql.conf.d/mysqld.cnf`.

## 2. The database

```bash
mysql -e "CREATE DATABASE carshowroom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER 'showroom'@'localhost' IDENTIFIED BY 'PUT-A-LONG-RANDOM-PASSWORD-HERE';"
mysql -e "GRANT ALL PRIVILEGES ON carshowroom.* TO 'showroom'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"
```

Generate that password rather than inventing one: `openssl rand -base64 24`.

## 3. The application

```bash
git clone <your-repository-url> /opt/showroom
cd /opt/showroom
npm install
```

Create `/opt/showroom/server/.env`:

```ini
DATABASE_URL="mysql://showroom:THE-PASSWORD-YOU-JUST-MADE@127.0.0.1:3306/carshowroom"
SESSION_SECRET="paste the output of: openssl rand -hex 32"
PORT=4000
NODE_ENV=production
```

Then set up the database and build:

```bash
cd /opt/showroom/server
npx prisma migrate deploy         # creates every table
npm run seed:vpic                 # loads all car makes and models (needs internet)
cd /opt/showroom && npm run build # builds the interface and the server
```

Create your login. The password is the only thing between the internet and every
balance in your business, so make it long:

```bash
cd /opt/showroom/server
npm run create:user -- yourname "a-long-passphrase-you-will-remember"
```

If the phone holding your authenticator is ever lost, two-factor can be switched
off from the server itself — sign in with the password, then set it up again on
the new phone from Settings:

```bash
npm run reset:2fa -- yourname
```

## 4. Keep it running

`/etc/systemd/system/showroom.service`:

```ini
[Unit]
Description=Car Showroom
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/showroom/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now showroom
systemctl status showroom
```

## 5. HTTPS

Never run this over plain HTTP — the login and every figure would travel in the
clear.

`/etc/nginx/sites-available/showroom`:

```nginx
server {
    server_name showroom.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 5M;
}
```

```bash
ln -s /etc/nginx/sites-available/showroom /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d showroom.yourdomain.com   # gets and renews the certificate
```

## 6. Switch on two-factor — do this immediately

Open `https://showroom.yourdomain.com`, sign in, go to **Settings**, and set up
two-factor authentication with Google Authenticator or Authy.

**Write the ten recovery codes on paper and keep them somewhere safe.** If you
lose your phone and have no codes, nobody can let you back in.

## 7. Backups

```bash
mkdir -p /var/backups/showroom
chmod +x /opt/showroom/scripts/backup.sh
crontab -e
```

Add:

```cron
15 2 * * * DB_PASSWORD='your-db-password' OFFSITE_TARGET='user@another-host:/backups' /opt/showroom/scripts/backup.sh >> /var/log/showroom-backup.log 2>&1
```

**Test the restore before you trust it.** On a spare machine:

```bash
gunzip < carshowroom_2026-03-01_0215.sql.gz | mysql carshowroom_test
```

A backup you have never restored is a guess, not a backup.

---

## Practising before you go live

The system ships with the worked example as practice data:

```bash
cd /opt/showroom/server
npm run seed:demo            # loads the example
npm run seed:demo -- --wipe  # ERASES EVERYTHING, then reloads it
```

Run real cars of yours through it, check every figure against your own
arithmetic, and when you are satisfied, wipe it and start entering real data:

```bash
npm run seed:demo -- --wipe   # clears the demo
mysql -e "TRUNCATE TABLE carshowroom.Party;"   # ...or just remove the demo accounts in the UI
```

## Updating later

```bash
cd /opt/showroom
git pull
npm install
cd server && npx prisma migrate deploy
cd .. && npm run build
systemctl restart showroom
```

Always take a backup before updating.

---

## The one honest warning about cloud hosting

If the internet at the showroom drops, the system is unreachable. It works fine
on a phone over mobile data, which covers most outages. If you ever want it to
keep working with no internet at all, that means running it on a machine in the
showroom instead — say so and it can be changed.
