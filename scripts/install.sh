#!/bin/bash
set -e

# stitch installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/captainsafia/stitch/main/scripts/install.sh | bash
#
# Options:
#   --version <ver>  Install a specific version
#   --preview        Install the latest preview version
#   --pr <number>    Install from a PR artifact (requires gh CLI)
#   --cli-only       Only install the CLI binary
#   --mcp-only       Only install the MCP server binary

REPO="captainsafia/stitch"
INSTALL_DIR="$HOME/.stitch/bin"
CLI_BINARY_NAME="stitch"
MCP_BINARY_NAME="stitch-mcp"

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
CLI_ONLY=false
MCP_ONLY=false

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
        --cli-only)
            CLI_ONLY=true
            shift
            ;;
        --mcp-only)
            MCP_ONLY=true
            shift
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Validate mutually exclusive options
if [ "$CLI_ONLY" = true ] && [ "$MCP_ONLY" = true ]; then
    error "Cannot specify both --cli-only and --mcp-only"
fi

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
    local binary_prefix="$1"
    local binary_name="$2"
    
    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is required to download PR artifacts. Install it from https://cli.github.com/"
    fi

    log "Downloading PR #$PR_NUMBER artifact for $binary_prefix-$PLATFORM..."

    ARTIFACT_NAME="${binary_prefix}-pr-${PR_NUMBER}-${PLATFORM}"

    gh run download --repo "$REPO" --name "$ARTIFACT_NAME" --dir "$INSTALL_DIR" || \
        error "Failed to download artifact. Make sure the PR exists and has artifacts."
}

# Install a binary
install_binary() {
    local binary_prefix="$1"
    local binary_name="$2"
    local display_name="$3"
    
    if [ -n "$PR_NUMBER" ]; then
        download_pr_artifact "$binary_prefix" "$binary_name"
    else
        # Construct download URL
        BINARY_SUFFIX=""
        if [ "$OS" = "windows" ]; then
            BINARY_SUFFIX=".exe"
        fi

        DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/${binary_prefix}-${PLATFORM}${BINARY_SUFFIX}"

        download_binary "$DOWNLOAD_URL" "$INSTALL_DIR/$binary_name$BINARY_SUFFIX"
    fi

    # Make binary executable (not needed on Windows)
    if [ "$OS" != "windows" ]; then
        chmod +x "$INSTALL_DIR/$binary_name"
    fi

    log "Installed $display_name to $INSTALL_DIR/$binary_name"
}

# Main installation
main() {
    detect_platform

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Determine version (only for non-PR installs)
    if [ -z "$PR_NUMBER" ]; then
        if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
            VERSION=$(get_latest_version)
            if [ -z "$VERSION" ]; then
                error "Failed to determine latest version"
            fi
        fi
        log "Installing stitch $VERSION..."
    fi

    # Install CLI unless --mcp-only is specified
    if [ "$MCP_ONLY" = false ]; then
        install_binary "stitch" "$CLI_BINARY_NAME" "stitch CLI"
    fi

    # Install MCP unless --cli-only is specified
    if [ "$CLI_ONLY" = false ]; then
        install_binary "stitch-mcp" "$MCP_BINARY_NAME" "stitch MCP server"
    fi

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
    if [ "$MCP_ONLY" = false ]; then
        echo "Run 'stitch --help' to get started with the CLI."
    fi
    if [ "$CLI_ONLY" = false ]; then
        echo "Run 'stitch-mcp' to start the MCP server."
    fi
}

main "$@"
