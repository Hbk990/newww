# Putting the shop on Hostinger

This version is ordinary PHP. You upload the files and it runs — no Node, no
build step, no database to create, no command line.

**It needs PHP 8.1 or newer.** Hostinger's Web Hosting gives you that. Check or
change it in hPanel under **Advanced → PHP Configuration**.

## 1. Upload

1. In hPanel open **Files → File Manager**.
2. Go into `public_html`. If there is a default `index.html` or a welcome page
   in there, delete it — otherwise visitors see that instead of your shop.
3. Upload `HUQA_Shop_PHP.zip`.
4. Right-click it → **Extract**.
5. Make sure `index.php` ends up **directly inside `public_html`**, not inside
   another folder. If extracting made a folder, open it, select everything, and
   move it up one level. `public_html` should look like this:

```
public_html/
  index.php
  .htaccess
  seed-demo.php
  assets/
  src/
  data/          (created on the first visit)
```

> The File Manager hides files starting with a dot. Turn on **Show hidden
> files** in its settings so you can see `.htaccess` — the shop needs it.

## 2. Open your site

Visit your domain. You should see a **“coming soon”** page. That is correct —
the shop stays hidden until you switch it on.

If you see a file listing or a blank page instead, `index.php` is in the wrong
folder. Go back to step 1.

## 3. Create your admin login

Go to **your-domain.com/admin**.

Choose a username and a password of at least 12 characters. **Copy the recovery
code it gives you** — it appears once and it is the only way back in if you
forget the password.

## 4. Set the shop up

In the sidebar open **Storefront**:

- Check the **WhatsApp number** — orders arrive there.
- Set the **delivery fee** and free-delivery threshold.
- Switch **“Your shop is live”** on and save.

Then **Inventory → Add product** and start entering your stock.

## Want a demo catalogue first?

To see the shop full of products before you type your own in, open:

```
your-domain.com/seed-demo.php
```

That adds 38 demo products, 3 offers and 5 orders. Remove them again with:

```
your-domain.com/seed-demo.php?clear=1
```

**Delete `seed-demo.php` once you are finished with it** — anyone who guesses
the address could otherwise fill your shop with demo products.

## Where your data lives

Everything is plain files inside `public_html/data`:

```
data/products.json     your catalogue
data/bundles.json      your offers
data/settings.json     the storefront settings
data/admin.json        your login (the password is hashed, not stored)
data/orders/           one file per order
data/customers/        one file per customer, named by phone number
data/images/           product photos
```

The orders and customer files are readable text — you can open them in the File
Manager or download them.

**Back it up**: right-click the `data` folder in File Manager → Compress →
download the archive. Do that every week or two. Hostinger's own backups are a
separate thing worth turning on as well.

## If something goes wrong

**A blank white page** — PHP hit an error. In hPanel turn on error display
(Advanced → PHP Configuration → `display_errors`), reload, and send me what it
says. Turn it back off afterwards.

**“Could not create … check the folder permissions”** — set `public_html` to
permissions `755` in File Manager (right-click → Permissions), then reload.

**Every page except the home page gives 404** — the `.htaccess` file did not
upload. Check hidden files are shown and that `.htaccess` sits next to
`index.php`.

**The page has no styling** — `assets/` did not upload, or it landed in the
wrong folder.

**You cannot get into /admin** — use the recovery code at
`your-domain.com/admin?recover=1`. If you lost that too, delete
`data/admin.json` in the File Manager and `/admin` will let you create the
account again. That is also why nobody else should have File Manager access.

## Testing it on your own computer first (optional)

If you have PHP installed:

```sh
php -S localhost:8000
```

Then open `http://localhost:8000`. Everything works the same.

## Moving it later

The whole shop is this one folder. Copy it to any other PHP host and it runs
there — nothing is tied to Hostinger.
