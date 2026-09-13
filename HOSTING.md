# Where this shop can run

A short answer to a question that keeps coming up.

## Why shared hosting cannot run it

Shared hosting — Hostinger Web Hosting, Premium, Business, and "Cloud Hosting"
too — works one way: you upload files, and when a visitor asks for a page the
host's web server runs your **PHP** file and returns the result. You are a guest
on a machine running hundreds of other sites. You cannot start a program of your
own and leave it running, and you cannot claim a network port to listen on.

This shop is a **JavaScript program that has to be running**. It holds the
catalogue, prices the cart, checks stock, writes orders. There is no `index.php`
to upload, because there is no PHP in it at all.

So this is not a settings problem or a missing upload. Shared hosting runs PHP
files on demand; this needs a process that stays alive. Those are different
products.

**SSH access does not change it.** Some shared plans offer SSH. You can log in
and look around, but you still cannot leave a server process running or bind a
port — the host stops both.

## What you can do, keeping your Hostinger plan

**Your domain does not have to live where the shop lives.** Keep the domain at
Hostinger, keep your email there, and point the DNS at wherever the shop runs.
Visitors type your domain and never see the difference.

### Option 1 — Cloudflare, free (recommended)

The shop runs on Cloudflare's network. No server for you to maintain, free at
this size, and the code already works there.

- Cost: nothing, plus your existing Hostinger plan for the domain and email
- Effort: about 30 minutes, once
- See **DEPLOY.md**

Your Hostinger hosting stays exactly as it is. You are only changing where the
domain points.

### Option 2 — a Hostinger VPS

A real Linux machine on your Hostinger account, where the shop runs as a normal
program. Everything lives on one server you control.

- Cost: about $5–10 a month on top of what you pay now
- Effort: about an hour, plus ongoing security updates and backups that are
  yours to remember
- See **HOSTINGER.md**

### Option 3 — rebuild the whole thing in PHP

The only way the shop itself could sit on shared hosting is if it were a
different program: the storefront, the admin, the cart, the orders, the image
uploads, all written again in PHP against MySQL.

That is starting over. Everything built and tested here would be thrown away,
and the result would do the same things, no better, while still costing your
current hosting fee. It is an option, not a recommendation.

## The short version

| | Runs the shop? | Extra cost |
|---|---|---|
| Hostinger Web Hosting / Cloud Hosting | No | — |
| Hostinger Web Hosting for the domain + Cloudflare for the shop | Yes | nothing |
| Hostinger VPS | Yes | ~$5–10/month |
| Rewriting it all in PHP | Yes | weeks of work |
