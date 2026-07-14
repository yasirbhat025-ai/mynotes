# MedNotebook — getting a real app onto your phone, no computer needed

This project now includes everything needed to install MedNotebook as a
real app icon on your phone — full screen, works offline, no browser bar,
no Anthropic account involved. This is called a "PWA" (progressive web
app), and Android/iOS both support installing them directly.

You'll do this using your phone's browser only.

---

## Step 1 — Get the code online (using your phone)

1. Open **stackblitz.com** in Chrome (Android) or Safari (iPhone)
2. Tap **Create → Import Project** (or the "+" button)
3. Choose **"Upload folder"** or **"Import from ZIP"** and select the
   `mednotebook-app.zip` file I gave you
4. StackBlitz will open the project and automatically run `npm install` —
   wait for it to finish (you'll see a terminal panel at the bottom working)

If StackBlitz doesn't offer a direct zip upload on your device, the
alternative is:
1. Open **github.com** → sign up (free) → tap **+ → New repository** →
   name it `mednotebook` → Create
2. Tap **Add file → Upload files** → select all the files from the
   unzipped `mednotebook-app` folder (your phone's Files app can unzip it —
   tap the zip, "Extract")
3. Go back to StackBlitz → **Import from GitHub** → paste your repo URL

## Step 2 — Build it

In the StackBlitz terminal panel, type:

```
npm run build
```

and wait for it to finish. This creates a `dist` folder with the finished app.

## Step 3 — Put it online (one tap, free)

StackBlitz has a **Deploy** button (top right, sometimes says "Deploy to
Netlify"). Tap it, sign in with a free Netlify account when asked, and
it will give you a real web address like:

```
https://mednotebook-xxxxx.netlify.app
```

That's your app's permanent home online.

## Step 4 — Install it on your phone

1. Open that link in **Chrome** on Android (or Safari on iPhone)
2. **Android:** tap the **⋮** menu (top right) → **"Add to Home screen"** /
   **"Install app"** → confirm
3. **iPhone:** tap the **Share** icon (square with arrow) → **"Add to
   Home Screen"** → confirm

You'll now have a MedNotebook icon on your home screen. Tapping it opens
the app full-screen, like any other app — no address bar, works offline
after the first open, and your notes stay on your phone.

---

## Optional — turning it into a downloadable .apk file later

If you ever want an actual `.apk` file (e.g. to share with a classmate,
or upload to the Play Store), go to **pwabuilder.com**, paste in your
Netlify link from Step 3, and it will package your PWA into a real
Android APK for you — also entirely from a browser, no computer needed.
Note that submitting to the Play Store itself does require a one-time
$25 Google Play Developer account.

---

## About your data

Notes are stored only on your phone (IndexedDB), the same "offline, no
account" idea as the original plan. There's no sync between devices. If
you switch phones, use the app's own **Backup** button (Settings → Data)
to export your notes as a file, then **Restore** on the new phone.

---

## If you *do* get access to a computer later

A more advanced option exists in `capacitor.config.json` and this
project's Vite setup, for wrapping this into a Play-Store-native Android
build via Android Studio. Ask me and I'll walk you through it when you
have a computer available — nothing here needs to change first.
