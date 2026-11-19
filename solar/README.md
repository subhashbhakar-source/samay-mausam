# Solar Plant Calculator (locked)

Open it: <https://subhashbhakar-source.github.io/samay-mausam/solar/>

A loan, tax and take-home calculator for a solar power plant, in Hinglish and English. `index.html` holds the whole calculator encrypted, so nothing in this folder can be read without a key. No key is kept in this repository.

## Who can open it

- **The owner** opens it with the owner key, on any device. The key is typed once on a device and then remembered there.
- **Anyone else** sees a lock screen with a request to send to the owner. The owner taps the request link, and the page makes a key for that one device. The key is a link: tapping it opens the calculator, and the device remembers it.
- A key works only in the browser that sent the request. A forwarded link or key opens nothing on another device.
- The owner can make a key for one more device at any time, from the "Key banayein" button on the calculator or from any request link.
- A device loses its key when its browser data is cleared, or when another phone or browser is used. It then needs a new request and a new key. Safari on an iPhone can clear a site's data by itself when the site is not visited for a week or more. A page opened from its own Home Screen icon is not cleared this way.

### On an iPhone Home Screen

A page added to the Home Screen from Safari opens as an app of its own (the default from iOS 26). That icon keeps its own storage, apart from Safari's, so it counts as a separate device. A tapped link opens Safari, not the icon. So:

1. Add the page to the Home Screen first: in Safari, the page menu (three dots), Share, Add to Home Screen, Add. Where there are no three dots, the Share button is on the toolbar.
2. Open the icon and send the request from there.
3. The key message for such a request says to copy the whole message and paste it in the icon. The lock screen in the icon has a Paste button.

The page marks a request sent from an icon, and the key made for it, with `&app=1`. A key marked this way that is tapped as a link opens Safari, which says to paste the message in the icon instead. `icon-180.png` is the icon shown on the Home Screen, under the name "Solar Calc". Inside the icon, the calculator's "save as CSV" goes to the share sheet, because an icon has no downloads.

What the lock does not do: an approved person can still show the screen to others or save the tables. One device cannot be removed on its own. To shut everyone out, build the page again with a new content key (see below) and approve the wanted devices again.

## How the lock works

- The page is compressed and then encrypted with AES-256-GCM under a random content key.
- The owner key is 16 letters and digits. It is stretched with PBKDF2-SHA256 (600,000 rounds) into a key that unwraps the content key. Capital or small letters, spaces and hyphens make no difference when it is typed.
- Every other device makes its own ECDH P-256 key pair in the browser. The request carries the public half. The owner's page seals the content key to it: a one-time ECDH key pair, SHA-256 over the shared secret and both public halves, then AES-256-GCM. Only the browser that holds the private half can open the sealed key.
- Kept in the browser's storage, under names that start with `solar-calc.`: the device's key pair, its sealed key and, on the owner's devices, the stretched owner key. The calculator's own figures are kept under `solar-plant-calculator-v1`.

## Changing the calculator

The readable calculator is not in this repository. It is the owner's private Claude artifact named "Solar Plant Calculator", in the form it is published there: its title, style, content and script, without `html`, `head` or `body` tags. Save that as `page.html`, then:

```
OWNER_KEY=XXXX-XXXX-XXXX-XXXX node build/lock.mjs --page page.html --out index.html --previous index.html
```

- `--previous index.html` keeps the content key, so every approved device stays approved and the owner's devices stay open. Leave it out to lock everyone out and start again.
- `node build/lock.mjs --new-key` prints a fresh owner key.
- Only the owner knows the owner key. Ask the owner for it, and never write it into a file here.
- `build/lock-page.tmpl` is the lock screen. `build/tiny-inflate.js` is [tiny-inflate](https://github.com/foliojs/tiny-inflate) 1.0.3 by Devon Govett (MIT licence, in `build/tiny-inflate.LICENSE`), which unzips the page in the browser.

## The clock app's offline worker

This folder sits inside the clock app's folder, so `../sw.js` also answers for it on phones that have opened the clock app. It takes this page from the network first and keeps a copy, so the calculator opens without internet on those phones. If the network takes more than six seconds on a first visit, the worker shows the clock page instead; opening the link again brings the calculator.
