// What changed, newest first. `from` is the build number that first had the change (the number after "1." in the version).
export const CHANGELOG = [
  { from: 50, notes: ['Sheet link import can also get the pictures: tick "Also get the pictures" (needs the tab number). It downloads the tab as a PDF, so it is slower.'] },
  { from: 49, notes: ['Import page: read a card sheet straight from a Google Sheets link (shared as Anyone with the link). Card data only; sheets have no pictures.'] },
  { from: 46, notes: ['Check for updates: when the app cannot look up new versions itself, it now says so and links to the downloads page.'] },
  { from: 45, notes: ['Pick an accent colour: Ruby, Ocean, Forest, Violet, Amber or Rose, with the palette button at the top. It works in light and dark mode.'] },
  { from: 44, notes: ['"Check for updates" at the bottom of the page checks right away; the app also checks every few minutes while it is open.'] },
  { from: 43, notes: ['Decks have a Test hand button: draw 5 cards from your shuffled deck, swap cards once (mulligan), draw more, or start a new hand.'] },
  { from: 41, notes: ['The app now tells you when a newer version is ready, with a Download button.', 'After an update, a "What\'s new" note lists the changes. You can reopen it from the version line at the bottom of any page.'] },
  { from: 40, notes: ['The version number is shown at the bottom of every page.'] },
  { from: 39, notes: ['Decks can be printed: Print PDF makes A4 sheets with 9 cards at real size.', 'Files you save (PDF, backups) go straight into your Downloads folder.', 'New versions install over the old one and keep your sets and decks.'] },
  { from: 38, notes: ['Missing traits are copied from the same card in another set you imported.'] },
];
