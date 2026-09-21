#!/bin/zsh
set -euo pipefail
root_dir="${0:A:h}"
build_dir="$root_dir/build"
app_dir="$build_dir/Kobe's Monitor.app"
rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
swiftc "$root_dir/Sources/KobesMonitor/main.swift" -o "$app_dir/Contents/MacOS/KobesMonitor" -framework AppKit -framework WebKit -framework Carbon
cp "$root_dir/Info.plist" "$app_dir/Contents/Info.plist"
cp "$root_dir/Resources/AppIcon.icns" "$app_dir/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$app_dir"
echo "$app_dir"
