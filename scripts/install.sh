#!/bin/bash
set -e

# stitch installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/captainsafia/stitch/main/scripts/install.sh | bash

REPO="captainsafia/stitch"
INSTALL_DIR="$HOME/.stitch/bin"
BINARY_NAME="stitch"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}==>${NC} $1"
}

warn() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

error() {
    echo -e "${RED}Error:${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case "$OS" in
        linux)
            OS="linux"
            ;;
        darwin)
            OS="darwin"
            ;;
        mingw*|msys*|cygwin*)
            OS="windows"
            ;;
        *)
            error "Unsupported operating system: $OS"
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)
            ARCH="x64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    log "Detected platform: $PLATFORM"
}

# Parse command line arguments
VERSION=""
PR_NUMBER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --preview)
            VERSION="preview"
            shift
            ;;
        --pr)
            PR_NUMBER="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Get the latest release version
get_latest_version() {
    curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download binary
download_binary() {
    local url="$1"
    local output="$2"

    log "Downloading from: $url"

    if command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$output"
    elif command -v wget &> /dev/null; then
        wget -q "$url" -O "$output"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Download from PR artifacts (requires gh CLI)
download_pr_artifact() {
    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is required to download PR artifacts. Install it from https://cli.github.com/"
    fi

    log "Downloading PR #$PR_NUMBER artifact for $PLATFORM..."

    ARTIFACT_NAME="stitch-pr-${PR_NUMBER}-${PLATFORM}"

    gh run download --repo "$REPO" --name "$ARTIFACT_NAME" --dir "$INSTALL_DIR" || \
        error "Failed to download artifact. Make sure the PR exists and has artifacts."
}

# Main installation
main() {
    detect_platform

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    if [ -n "$PR_NUMBER" ]; then
        download_pr_artifact
    else
        # Determine version
        if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
            VERSION=$(get_latest_version)
            if [ -z "$VERSION" ]; then
                error "Failed to determine latest version"
            fi
        fi

        log "Installing stitch $VERSION..."

        # Construct download URL
        BINARY_SUFFIX=""
        if [ "$OS" = "windows" ]; then
            BINARY_SUFFIX=".exe"
        fi

        DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/stitch-${PLATFORM}${BINARY_SUFFIX}"

        download_binary "$DOWNLOAD_URL" "$INSTALL_DIR/$BINARY_NAME$BINARY_SUFFIX"
    fi

    # Make binary executable (not needed on Windows)
    if [ "$OS" != "windows" ]; then
        chmod +x "$INSTALL_DIR/$BINARY_NAME"
    fi

    log "Installed to $INSTALL_DIR/$BINARY_NAME"

    # Check if PATH needs to be updated
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        warn "Add the following to your shell configuration file:"
        echo ""

        SHELL_NAME=$(basename "$SHELL")
        case "$SHELL_NAME" in
            bash)
                echo "  echo 'export PATH=\"\$HOME/.stitch/bin:\$PATH\"' >> ~/.bashrc"
                echo "  source ~/.bashrc"
                ;;
            zsh)
                echo "  echo 'export PATH=\"\$HOME/.stitch/bin:\$PATH\"' >> ~/.zshrc"
                echo "  source ~/.zshrc"
                ;;
            fish)
                echo "  set -U fish_user_paths \$HOME/.stitch/bin \$fish_user_paths"
                ;;
            *)
                echo "  export PATH=\"\$HOME/.stitch/bin:\$PATH\""
                ;;
        esac
        echo ""
    fi

    log "Installation complete!"
    echo ""
    echo "Run 'stitch --help' to get started."
}

main "$@"
