# Putting the shop online

This runs on **Cloudflare**, not on ordinary web hosting. It is not a PHP site —
there is no folder of files to upload over FTP. It needs a Workers runtime, a D1
database and an R2 bucket for the product photos, and Cloudflare is where those
live.

Your Hostinger shared hosting plan cannot run it. Your **domain** is fine; only
the DNS has to point at Cloudflare.

## What it costs

Nothing, for a shop this size. The free allowances are 100,000 requests a day,
5 GB of database and 10 GB of images. Cloudflare asks for a card on file to
switch R2 on even though the first 10 GB are free.

A domain is about $10 a year wherever you buy it.

## Buying the domain

**Buy it at Cloudflare** (dash.cloudflare.com → Domain Registration). They sell
at cost with no markup, and the DNS is then already in the right place — it
skips the most error-prone step below.

If you buy it elsewhere, or already own one, you will instead have to change its
nameservers to the two Cloudflare gives you. Cloudflare walks you through it and
it takes a few hours to take effect.

> If you move a domain that already receives **email** — say a Hostinger
> mailbox — you must recreate its MX records in Cloudflare DNS or the email
> stops arriving. A brand-new domain has nothing to lose.

## One-time setup

Do this once, in a terminal in the project folder.

**1. Sign in**

```sh
npx wrangler login
```

Opens your browser. Approve it.

**2. Create the database**

```sh
npx wrangler d1 create huqa
```

It prints a block ending in a long `database_id`. Copy that id.

**3. Create the image bucket**

```sh
npx wrangler r2 bucket create huqa-images
```

If this is your first bucket, Cloudflare asks you to enable R2 and add a card.

**4. Fill in `cloudflare.json`**

Open it in the project folder and paste the id from step 2:

```json
{
  "workerName": "huqa-shop",
  "d1": { "name": "huqa", "id": "PASTE-THE-DATABASE-ID-HERE" },
  "r2": { "bucket": "huqa-images" }
}
```

Keep the other names matching what you typed in steps 2 and 3.

## Publish

```sh
npm run deploy
```

This builds, applies any new database migrations to the live database, and
publishes. It prints a `.workers.dev` URL — the shop is already reachable there.

## Attach your domain

In the Cloudflare dashboard: **Workers & Pages → huqa-shop → Settings → Domains
& Routes → Add → Custom domain**. Type your domain and save. HTTPS is set up for
you.

## Set the shop up

1. Open `https://your-domain/admin` and create your username and password.
   **Save the recovery code** — it is shown once and is the only way back in.
2. In the sidebar open **Storefront**, set the WhatsApp number and the delivery
   fee, and switch **Your shop is live** on.
3. Add your products.

Until you switch it live, visitors see a "coming soon" page.

> The live shop is public and `/admin` is protected by that username and
> password alone. Choose a real password, not something guessable. Five wrong
> attempts lock it for fifteen minutes.

## Changing something later

Edit the code, then:

```sh
npm run deploy
```

Test locally first with `npm start` — see `LOCAL_TESTING.md`.

## Things worth knowing

- **Local and live are separate.** Your local demo products are not on the live
  site, and live orders are not on your machine. Never run `npm run demo`
  against the live database — it only ever touches the local one.
- **Backups.** The admin's *Export inventory* button downloads your products and
  change history as a file. Do it now and then. Orders and customer files live in
  R2 and can be downloaded from the Cloudflare dashboard.
- **Rolling back.** Cloudflare keeps previous versions of the Worker; you can
  roll back from the dashboard under Deployments.
