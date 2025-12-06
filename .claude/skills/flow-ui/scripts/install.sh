#!/bin/bash

# Flow UI Skill - Installation Script
# "Primary Color만 바꾸면 브랜드 완성"

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$SKILL_DIR/templates"

# Target project root (current directory)
PROJECT_ROOT="$(pwd)"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Flow UI Skill - Installation${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check if we're in a valid project directory
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    echo -e "${RED}Error: No package.json found in current directory.${NC}"
    echo -e "${YELLOW}Please run this script from your Next.js project root.${NC}"
    exit 1
fi

# Check for Next.js
if ! grep -q "next" "$PROJECT_ROOT/package.json"; then
    echo -e "${YELLOW}Warning: This doesn't appear to be a Next.js project.${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${YELLOW}Installing Flow UI to: $PROJECT_ROOT${NC}"
echo ""

# Create directory structure
echo -e "${GREEN}[1/5] Creating directory structure...${NC}"
mkdir -p "$PROJECT_ROOT/src/components/ui"
mkdir -p "$PROJECT_ROOT/src/lib"
mkdir -p "$PROJECT_ROOT/src/features"
mkdir -p "$PROJECT_ROOT/src/app"

# Copy claude.md files (hierarchy system)
echo -e "${GREEN}[2/5] Installing claude.md hierarchy...${NC}"
cp "$TEMPLATES_DIR/claude.md" "$PROJECT_ROOT/claude.md"
cp "$TEMPLATES_DIR/components/claude.md" "$PROJECT_ROOT/src/components/claude.md"
cp "$TEMPLATES_DIR/lib/claude.md" "$PROJECT_ROOT/src/lib/claude.md"
cp "$TEMPLATES_DIR/features/claude.md" "$PROJECT_ROOT/src/features/claude.md"
echo "  - /claude.md (root constitution)"
echo "  - /src/components/claude.md"
echo "  - /src/lib/claude.md"
echo "  - /src/features/claude.md"

# Copy UI components
echo -e "${GREEN}[3/5] Installing UI components...${NC}"
cp "$TEMPLATES_DIR/components/ui/"*.tsx "$PROJECT_ROOT/src/components/ui/"
cp "$TEMPLATES_DIR/components/ui/"*.ts "$PROJECT_ROOT/src/components/ui/"
COMPONENT_COUNT=$(ls -1 "$PROJECT_ROOT/src/components/ui/"*.tsx 2>/dev/null | wc -l)
echo "  - $COMPONENT_COUNT components installed"

# Copy utilities
echo -e "${GREEN}[4/5] Installing utilities...${NC}"
cp "$TEMPLATES_DIR/lib/utils.ts" "$PROJECT_ROOT/src/lib/"
cp "$TEMPLATES_DIR/lib/text-config.ts" "$PROJECT_ROOT/src/lib/"
echo "  - utils.ts (cn function)"
echo "  - text-config.ts (i18n)"

# Copy globals.css (only if not exists or user confirms)
echo -e "${GREEN}[5/5] Installing design tokens...${NC}"
if [ -f "$PROJECT_ROOT/src/app/globals.css" ]; then
    echo -e "${YELLOW}  globals.css already exists.${NC}"
    read -p "  Overwrite? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$TEMPLATES_DIR/app/globals.css" "$PROJECT_ROOT/src/app/globals.css"
        echo "  - globals.css overwritten"
    else
        echo "  - globals.css skipped (merge manually if needed)"
    fi
else
    cp "$TEMPLATES_DIR/app/globals.css" "$PROJECT_ROOT/src/app/globals.css"
    echo "  - globals.css installed"
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Install dependencies:"
echo "   npm install class-variance-authority clsx tailwind-merge"
echo ""
echo "2. Customize your brand color in /src/app/globals.css:"
echo "   --primary: hsl(YOUR_COLOR);"
echo ""
echo "3. Import components:"
echo "   import { Button, Card } from '@/components/ui'"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
