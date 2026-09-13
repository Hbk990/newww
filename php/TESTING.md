# Testing the shop on your own computer

Two ways. **XAMPP is the one to use** — it runs Apache, the same web server
Hostinger uses, so what you see locally is what you get when you upload.

---

## With XAMPP (recommended)

### 1. Install XAMPP

Download from [apachefriends.org](https://www.apachefriends.org) and install it.
Take the defaults. You only need **Apache** — you can untick MySQL, FileZilla,
Mercury and Tomcat if it asks.

### 2. Start Apache

Open the **XAMPP Control Panel** and press **Start** next to Apache. It should
turn green.

> If it refuses to start, something else is using port 80 — usually Skype or IIS.
> Press **Config → Apache (httpd.conf)**, change `Listen 80` to `Listen 8080` and
> `ServerName localhost:80` to `ServerName localhost:8080`, save, and start it
> again. Then use `http://localhost:8080` everywhere below instead of
> `http://localhost`.

### 3. Put the shop in place

Unzip `HUQA_Shop_PHP.zip` into:

```
C:\xampp\htdocs\huqa
```

So you end up with `C:\xampp\htdocs\huqa\index.php`. Not a folder inside a
folder — if the zip made an extra level, move everything up one.

### 4. Open it

```
http://localhost/huqa
```

You should see a **“coming soon”** page. That is correct — the shop stays hidden
until you switch it on.

### 5. Fill it with demo products

```
http://localhost/huqa/seed-demo.php
```

Then reload `http://localhost/huqa` and the shop is stocked.

### 6. Make your admin login

```
http://localhost/huqa/admin
```

Pick any username and a password of at least 12 characters. This is only your
test copy, so it does not have to be the one you use for real.

---

## Without XAMPP

If you already have PHP on your machine, you do not need anything else. Open a
terminal in the unzipped folder and run:

```sh
php -S localhost:8000
```

Then open `http://localhost:8000`.

This is fine for a quick look, but it is not Apache: it ignores `.htaccess`, and
it handles one request at a time, so pages can feel slow. XAMPP is the better
test of what your host will actually do.

---

# What to try

**The shop** — http://localhost/huqa

- Hover **Disposables** in the black bar → the menu drops open with Shisha
  flavours / 50mg / 20mg. Click one.
- **E-Liquids** → pick 3mg, then a brand, then open a product and pick a flavour.
- **Pouches** → open Velo → pick a flavour, then a strength. The button stays
  grey until you have chosen both. Citrus at 10mg is marked out of stock on
  purpose.
- Type **`elfbr`** in the search box — misspelled deliberately — and it should
  still find Elf Bar. So should `watermellon` and `vopoo`.
- **Offers** → three deals: buy-2-get-1, 15% off, and a set price. Check the
  crossed-out prices look right.
- Add a few things to the cart (bag icon, top right), press **Continue to
  checkout**, fill in a name, a number like `71 234 567`, pick an area and write
  a real-looking address — it rejects anything under 10 characters on purpose.
  Press **Place order**.
- You get an order number and a green WhatsApp button. **Do not press it** unless
  you want a real message opening — the order is already saved either way.
- Open a **private/incognito window** → you should get the 18+ screen.

**The admin** — http://localhost/huqa/admin

- **Orders** → the five demo orders plus the one you just placed. Open one: full
  address, items, and buttons to mark it Confirmed / Delivered / Cancelled.
- **Customers** → one file per phone number. Sami Khoury has two orders on one
  file — that is the repeat-customer logic working.
- **Inventory** → click a product name, change a price or untick a flavour's “In
  stock”, save, then reload the shop and check it changed.
- **Bundles & offers** → open one to see how it is built, and try **New offer**.
- **Storefront** → the WhatsApp number, delivery fee, and the live/hidden switch.

**On your phone**, if it is on the same wifi: find your computer's IP with
`ipconfig` in a terminal, then visit `http://THAT-IP/huqa` from the phone. The
menu becomes a hamburger and the layout stacks.

---

# Starting over

Delete the `data` folder inside the shop folder. Everything — products, orders,
customers, your admin login — goes with it, and the next visit starts fresh.

# When you are happy with it

Upload the same folder to Hostinger. `UPLOAD.md` has those steps. Your local
`data` folder does not come with it, so the live shop starts empty — and you do
**not** want the demo products on the real site anyway.
