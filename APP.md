# Building the phone app (Capacitor)

The web app is wrapped as a native app with [Capacitor](https://capacitorjs.com). Everything is bundled inside the app, so it
works offline. Building needs your own computer: **Node 20+**, and **Android Studio** (Android) or **Xcode on a Mac** (iPhone).

## One-time setup
```
npm run app:setup          # installs Capacitor (latest) and the file/share plugins
npx cap add android        # and/or: npx cap add ios
```
Before you publish to a store, change `appId` in `capacitor.config.json` (now `app.wsw.cardwiki`) to an id you own.

## Build and run
```
npm run app:android        # admin edition: builds www/ and copies it into the Android project
npx cap open android       # opens Android Studio -> press Run, or Build > Build APK
```
`npm run app:ios` then `npx cap open ios` does the same for iPhone.

## Two editions
| | Admin | User |
|---|---|---|
| Command | `npm run app:android` | `npm run app:android:user` |
| Import PDFs, delete sets | yes | no (pages, PDF engine and routes are left out) |
| Decks, search, sets | yes | yes |

Both build from the same code; `tools/build-app.mjs --edition user|admin` flips `ADMIN` in `js/lib/config.js`.
Sets imported in the admin app do **not** reach user apps yet: that needs the shared online store (not built).

## Keeping your data
* The app asks the device to keep its data (`navigator.storage.persist()`), but a device can still clear it when space is short.
* **Decks** page: *Back up all decks* / *Restore backup*. **Import** page (admin): *Back up sets* / *Restore sets*.
* Saving the backup file inside the phone app uses the Filesystem and Share plugins installed by `app:setup`. This path has not been tried on a real phone yet.

## Not yet done
* App icon and splash screen (the app uses the placeholder icon in `icons/icon.svg`; generate real ones with `@capacitor/assets`).
* Testing on real Android/iOS devices.
* The shared online store for the admin -> user update.
