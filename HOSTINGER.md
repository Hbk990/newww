# Putting the shop on a Hostinger VPS

This runs the shop on your own server, with everything — the site, the database,
the product photos, the orders — living on that one machine.

**You need a VPS plan, not shared hosting and not Cloud Hosting.** Those two are
managed PHP hosting; they cannot run this. Hostinger's VPS plans give you a real
Linux machine you control. The cheapest KVM plan is plenty.

When ordering, choose **Ubuntu 24.04** as the operating system, with no control
panel.

Set aside an hour the first time.

---

## 1. Connect to the server

Hostinger's panel shows your server's IP address and root password, and has a
**Browser terminal** button if you would rather not install anything. From your
own machine:

```sh
ssh root@YOUR-SERVER-IP
```

Everything from here until step 8 is typed on the server.

## 2. Update it and install what is needed

```sh
apt update && apt upgrade -y
apt install -y curl git sqlite3 unzip
```

Node 22:

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
```

That last line must print `v22.` something.

## 3. Make a user for the shop

Running a website as `root` means any mistake has the run of the whole machine.

```sh
adduser --disabled-password --gecos "" huqa
```

## 4. Put the code on the server

If the project is on GitHub:

```sh
sudo -u huqa git clone YOUR-REPO-URL /home/huqa/shop
```

Otherwise upload the zip from your own machine (run this on **your** machine,
not the server):

```sh
scp HUQA_Shop_Source.zip root@YOUR-SERVER-IP:/tmp/
```

then back on the server:

```sh
unzip /tmp/HUQA_Shop_Source.zip -d /tmp/huqa
mv /tmp/huqa/HUQA_Shop /home/huqa/shop
chown -R huqa:huqa /home/huqa/shop
```

## 5. Install and build

```sh
sudo -u huqa -H bash -c 'cd /home/huqa/shop && npm run setup:server'
```

This installs the dependencies, builds the site and creates the database. It
downloads about 1 GB, so give it a few minutes. It ends with `Ready.`

Want the demo catalogue to look around first?

```sh
sudo -u huqa -H bash -c 'cd /home/huqa/shop && npm run serve:demo'
```

Remove it later with `npm run serve:demo -- --clear`.

## 6. Keep it running

```sh
cp /home/huqa/shop/deploy/huqa.service /etc/systemd/system/huqa.service
systemctl daemon-reload
systemctl enable --now huqa
systemctl status huqa
```

`status` should say **active (running)**. The shop now starts by itself when the
server reboots and restarts if it ever crashes.

Check it is answering:

```sh
curl -I http://127.0.0.1:3000
```

`HTTP/1.1 200 OK` means it is up.

## 7. Point your domain at the server

In your domain registrar's DNS settings, create an **A record**:

| Type | Name | Value |
|---|---|---|
| A | `@` | your server's IP |
| A | `www` | your server's IP |

Give it up to an hour to take effect. Check with `ping your-domain.com` — it
should answer from your server's IP.

## 8. HTTPS

Caddy gets the certificate and renews it forever, with no cron job to forget.

```sh
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Edit `/home/huqa/shop/deploy/Caddyfile` and put your real domain on the first
line, then:

```sh
cp /home/huqa/shop/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Open `https://your-domain.com`. The padlock should be there within a minute.

## 9. Lock the server down

```sh
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Port 3000 is deliberately not opened — the shop only listens on `127.0.0.1`, so
the only way in is through Caddy over HTTPS.

## 10. Set the shop up

1. Open `https://your-domain.com/admin`, create your username and password.
   **Save the recovery code.** It is shown once and is the only way back in.
2. Sidebar → **Storefront** → set the WhatsApp number and delivery fee → switch
   **Your shop is live** on.
3. Add your products.

> **Log in through your domain, not the IP address.** The admin session cookie is
> marked secure, so browsers only accept it over HTTPS. `http://YOUR-IP:3000`
> will let you type a password and then look like nothing happened.

---

## Backups — do not skip this

Everything lives on one server now. If it dies, your orders and customer list die
with it. Hostinger's own snapshots are a separate feature worth turning on, and
this script keeps a copy of the data itself:

```sh
sudo -u huqa -H bash -c 'chmod +x /home/huqa/shop/deploy/backup.sh && /home/huqa/shop/deploy/backup.sh'
```

Nightly at 3am — run `sudo -u huqa crontab -e` and add:

```
0 3 * * * /home/huqa/shop/deploy/backup.sh
```

Archives land in `/home/huqa/backups`, last 30 kept. **Copy them off the server
now and then** — a backup that only exists on the machine it is backing up is not
a backup.

## Updating the shop later

```sh
cd /home/huqa/shop
sudo -u huqa git pull          # or upload the new zip over the folder
sudo -u huqa -H bash -c 'cd /home/huqa/shop && npm run setup:server'
systemctl restart huqa
```

`setup:server` applies any new database changes and skips the ones already done.

## Running it

| What | Command |
|---|---|
| Is it running? | `systemctl status huqa` |
| Restart it | `systemctl restart huqa` |
| Watch the log | `journalctl -u huqa -f` |
| Recent errors | `journalctl -u huqa -p err -n 50` |
| Caddy trouble | `journalctl -u caddy -n 50` |

## Where everything is

```
/home/huqa/shop           the code
/home/huqa/shop/data
  huqa.sqlite             products, offers, admin account, sessions
  files/                  product photos
  files/orders/           one JSON file per order
  files/customers/        one JSON file per customer, named by phone number
/home/huqa/backups        the backup archives
```

The orders and customer files are plain text — you can open, copy or email them
straight off the server.

## What you have taken on

This is your server now. Nobody else patches it.

- **Security updates.** `apt update && apt upgrade -y` every few weeks, and
  reboot when it asks. An unpatched Linux box on the internet gets found.
- **Disk space.** `df -h`. A full disk stops the shop taking orders.
- **It can go down.** If the server falls over at 2am, the shop is offline until
  you fix it. Nobody is paged.
- **Backups are yours.** See above. This is the one that actually bites people.
- **Traffic spikes.** One small VPS handles a normal day easily, but a post that
  takes off can overwhelm it.
