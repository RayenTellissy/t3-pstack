#!/bin/sh
# Installs t3-pstack into ~/.claude, or updates it to the latest main.
# Usage: curl -fsSL https://raw.githubusercontent.com/RayenTellissy/t3-pstack/main/install.sh | sh
# From a local checkout: PSTACK_SRC=/path/to/t3-pstack sh install.sh
# A branch, tag, or commit: PSTACK_REF=<ref> sh install.sh
set -eu

ref="${PSTACK_REF:-main}"
dest="$HOME/.claude"
previous_manifest="$dest/pstack/.installed"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 22 && minor >= 18) || (major === 23 && minor >= 6) || major > 23 ? 0 : 1)' 2>/dev/null ||
  { echo "t3-pstack needs Node 22.18 to 22.x or Node 23.6 or later on PATH." >&2; exit 1; }

if [ -n "${PSTACK_SRC:-}" ]; then
  src="$PSTACK_SRC"
  label="$src"
else
  curl -fsSL -o "$tmp/pstack.tar.gz" "https://github.com/RayenTellissy/t3-pstack/archive/$ref.tar.gz"
  mkdir "$tmp/src"
  tar -xzf "$tmp/pstack.tar.gz" -C "$tmp/src" --strip-components=1
  src="$tmp/src"
  label="$ref"
fi
mkdir -p "$dest"

(cd "$src" && find skills agents output-styles pstack -mindepth 1 -maxdepth 1) > "$tmp/manifest"
cat "$previous_manifest" "$tmp/manifest" 2>/dev/null | while IFS= read -r path; do
  case "$path" in
    */*/*|*/.|*/..) ;;
    skills/?*|agents/?*|output-styles/?*|pstack/?*) rm -rf "${dest:?}/$path" ;;
  esac
done

for dir in skills agents output-styles pstack; do
  mkdir -p "$dest/$dir"
  (cd "$src/$dir" && tar --exclude node_modules -cf - .) | (cd "$dest/$dir" && tar -xf -)
done
cp "$tmp/manifest" "$previous_manifest"
[ -e "$dest/pstack/models.md" ] || cp "$dest/pstack/models.large.md" "$dest/pstack/models.md"
node "$src/scripts/install-hooks.mjs"

echo "t3-pstack ($label) is installed in $dest. Start a new T3 Code thread to load it."
