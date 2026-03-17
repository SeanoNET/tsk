#!/bin/sh
set -eu

REPO="SeanoNET/tsk"

# Detect OS
case "$(uname -s)" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="darwin" ;;
  *)       echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

# Detect architecture
case "$(uname -m)" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)             echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# Determine version
if [ -n "${TSK_VERSION:-}" ]; then
  VERSION="$TSK_VERSION"
else
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  if [ -z "$VERSION" ]; then
    echo "Failed to determine latest version" >&2
    exit 1
  fi
fi

ARTIFACT="tsk-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ARTIFACT}"
INSTALL_DIR="${TSK_INSTALL_DIR:-$HOME/.local/bin}"

echo "Installing tsk v${VERSION} (${OS}/${ARCH})..."

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download
curl -fsSL "$URL" -o "${INSTALL_DIR}/tsk"
chmod +x "${INSTALL_DIR}/tsk"

echo "Installed tsk to ${INSTALL_DIR}/tsk"

# Check if install dir is in PATH
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *) echo "Warning: ${INSTALL_DIR} is not in your PATH. Add it to your shell profile." >&2 ;;
esac

echo "Run 'tsk --version' to verify."
