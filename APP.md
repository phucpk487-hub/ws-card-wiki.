# Building the phone app (Capacitor)

The web app is wrapped as an Android app with [Capacitor](https://capacitorjs.com). Everything is bundled inside the app,
so it works offline. Everyone who installs it can import their own card sets from PDFs; there is no shared online database.

## Build online (no PC needed)
The repository has a GitHub Actions workflow (`.github/workflows/android.yml`). Every push to `main` builds the app and
publishes `ws-card-wiki.apk` on the repository's **Releases** page (tag `latest`). You can also start it by hand:
**Actions > Build Android app > Run workflow**. On the phone, download the `.apk` from the release and open it
(allow "install unknown apps" for your browser once).

## Build on your own computer
Needs Node 20+, Java 21 and Android Studio.
```
npm run app:setup          # installs Capacitor (latest) and the file/share plugins
npx cap add android
npm run app:android        # builds www/ and copies it into the Android project
npx cap open android       # Android Studio: Run, or Build > Build APK
```
Before you publish to a store, change `appId` in `capacitor.config.json` (now `app.wsw.cardwiki`) to an id you own.

## Keeping your data
* The app asks the device to keep its data (`navigator.storage.persist()`), but a device can still clear it when space is short.
* **Decks** page: *Back up all decks* / *Restore backup*. **Import** page: *Back up sets* / *Restore sets*.
* Saving a file (backup, print PDF) inside the phone app writes straight to the Downloads folder (then Documents), and only falls back to the share sheet if the phone refuses. Not yet tried on a real phone.
* Updating: every build is signed with the same key (tools/signing/ws-wiki.jks, or your own via the ANDROID_KEYSTORE_B64 and ANDROID_KEYSTORE_PASSWORD repository secrets) and numbered by build, so a new APK installs over the old one and keeps your sets and decks. The first install after this change needs the old app removed once.

## Not yet done
* A real app icon and splash screen (placeholder icon in `icons/icon.svg`; generate with `@capacitor/assets`).
* A signed release build for the Play Store (the workflow makes a debug build for installing directly).
