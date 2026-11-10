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
* Updating: every build is signed with the same key (your private key, stored only in the ANDROID_KEYSTORE_B64 and ANDROID_KEYSTORE_PASSWORD repository secrets; keep a copy of it, because losing it means one more uninstall and reinstall) and numbered by build, so a new APK installs over the old one and keeps your sets and decks. The first install after this change needs the old app removed once.

## Google Play
* **Actions > Build Play Store bundle > Run workflow** builds a signed release `.aab` (same keystore secrets, alias `wswiki`) and attaches it to the run under *Artifacts*. This build sets `STORE = true` in `js/version.js`, which turns off the GitHub update check and download links (Google Play forbids apps that update themselves outside the store). The APK build keeps them.
* `docs/privacy.html` is the privacy policy Play Console asks for. It needs a public URL and a contact email (see the comment inside). Update it if the app ever starts sending data anywhere. The *APK* build still contacts GitHub for update checks; the *Play* build does not.
* A new personal developer account must run a closed test (12 testers, 14 days) before production access.
* Decide the final `appId` before the first upload: it can never be changed afterwards, and a different id installs as a separate app (your sets and decks do not carry over).

## Not yet done
* A real app icon and splash screen (placeholder icon in `icons/icon.svg`; generate with `@capacitor/assets`). Play also needs a 512x512 icon and a feature graphic for the store listing.
* The release bundle workflow has not been run yet; the first run may need small fixes.
