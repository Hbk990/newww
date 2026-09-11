#!/usr/bin/env sh
# SessionStart hook: make `rtk` available in this checkout's session.
#
# Why this exists
# ---------------
# .claude/settings.json registers a PreToolUse hook that runs `rtk hook claude`
# on every Bash call. That hook is only useful if the binary exists. On a
# developer machine it already does — rtk was installed once, by hand. In a
# Claude Code cloud session it does not: the container is built fresh from a
# base image every time and thrown away afterwards, so without this script the
# PreToolUse hook exits 127 on every single Bash call and the transcript fills
# with hook errors.
#
# Never fails the session
# -----------------------
# Every exit below is 0. A session that could not start because a token-saving
# optimisation failed to download would be a bad trade, so an install failure
# degrades to "no rtk" and says so on stderr.
#
# Not for Windows
# ---------------
# Bails on anything but Linux and macOS. On Windows `rtk init -g` writes the
# hook into your own ~/.claude/settings.json and the binary is already on PATH,
# so there is nothing for this to do — see rtk discussions #671 and #1212 for
# the state of Windows hook installation.

# Already installed — the developer-machine case, and any session where a
# previous run of this script succeeded.
if command -v rtk >/dev/null 2>&1; then
  exit 0
fi

case "$(uname -s 2>/dev/null)" in
  Linux | Darwin) ;;
  *) exit 0 ;;
esac

# The installer verifies a SHA-256 checksum against the release's checksums.txt
# and refuses tarballs containing absolute or `..` paths, so it is a reasonable
# thing to run unattended. It installs to ~/.local/bin.
#
# RTK_VERSION pins the release. Leave it empty to track the latest, or set a tag
# like v0.40.0 so a new release cannot change behaviour under you mid-project.
RTK_VERSION="${RTK_VERSION:-}"
export RTK_VERSION

if ! curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh >/dev/null 2>&1; then
  # Fall back to building from source, but only when asked.
  #
  # The release tarball is served from github.com, which some sandboxes block
  # at the egress proxy while still allowing git through it — this repo's own
  # cloud environment is one: raw.githubusercontent.com answers 200, github.com
  # answers 403. Cargo fetches via git and takes its crates from
  # index.crates.io, so `cargo install --git` reaches rtk where the download
  # cannot.
  #
  # Opt-in because it is slow: measured at 3m27s for rtk 0.49.0 on the cloud
  # image. Paying that on every fresh container would delay every session
  # start, which is a worse trade than running unfiltered. Allowlisting
  # github.com in the environment's network settings is the better fix; this is
  # for when that is not available.
  if [ "${RTK_BUILD_FROM_SOURCE:-0}" = "1" ] && command -v cargo >/dev/null 2>&1; then
    echo "rtk: release download failed; building from source (a few minutes)." >&2
    if cargo install --git https://github.com/rtk-ai/rtk --branch master --locked rtk >/dev/null 2>&1; then
      echo "rtk: built and installed from source." >&2
    else
      echo "rtk: source build failed — continuing without it." >&2
      exit 0
    fi
  else
    echo "rtk: install failed — continuing without it (Bash output will not be filtered)." >&2
    exit 0
  fi
fi

# ~/.local/bin is on PATH in the cloud image, but not on every machine, and a
# binary the PreToolUse hook cannot find fails silently — rtk issue #685.
if ! command -v rtk >/dev/null 2>&1; then
  echo "rtk: installed to ~/.local/bin but not on PATH; add it to your profile." >&2
fi

exit 0
