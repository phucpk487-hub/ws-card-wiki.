#!/bin/sh
# Renders the app icon PNGs from icons/icon.svg and icons/icon-foreground.svg (needs rsvg-convert).
# Output: icons/icon-192.png, icons/icon-512.png (web) and android-icons/res/mipmap-*/ (Android launcher icons).
set -e
cd "$(dirname "$0")/.."
r() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }
r icons/icon.svg 192 icons/icon-192.png
r icons/icon.svg 512 icons/icon-512.png
for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  n=${d%%:*}; rest=${d#*:}; legacy=${rest%%:*}; fg=${rest#*:}
  o=android-icons/res/mipmap-$n; mkdir -p "$o"
  r icons/icon.svg "$legacy" "$o/ic_launcher.png"
  r icons/icon.svg "$legacy" "$o/ic_launcher_round.png"
  r icons/icon-foreground.svg "$fg" "$o/ic_launcher_foreground.png"
done
mkdir -p android-icons/res/values
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14161C</color>\n</resources>\n' > android-icons/res/values/ic_launcher_background.xml
