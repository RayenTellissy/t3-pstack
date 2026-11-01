#!/bin/sh
# Installs pstack-claude into ~/.claude, or updates it to the latest main.
# Usage: curl -fsSL https://raw.githubusercontent.com/RayenTellissy/pstack-claude/main/install.sh | sh
set -eu

ref="${PSTACK_REF:-main}"
dest="$HOME/.claude"
installed="$dest/pstack/.installed"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -fsSL -o "$tmp/pstack.tar.gz" "https://github.com/RayenTellissy/pstack-claude/archive/$ref.tar.gz"
tar -xzf "$tmp/pstack.tar.gz" -C "$tmp" --strip-components=1
mkdir -p "$dest"

# Clear what the last install left and what this one ships, so nothing upstream
# dropped lingers. ~/.claude/pstack also holds models.md and run stores, so only
# its docs go.
(cd "$tmp" && find skills agents output-styles -mindepth 1 -maxdepth 1) > "$tmp/installed"
cat "$installed" "$tmp/installed" 2>/dev/null | while IFS= read -r path; do
  case "$path" in
    */*/*|*/.|*/..) ;;
    skills/?*|agents/?*|output-styles/?*) rm -rf "${dest:?}/$path" ;;
  esac
done
rm -rf "$dest/pstack/docs"

cp -R "$tmp/skills" "$tmp/agents" "$tmp/output-styles" "$tmp/pstack" "$dest/"
cp "$tmp/installed" "$installed"

echo "pstack-claude ($ref) is installed in $dest. Start a new Claude Code session to load it."
