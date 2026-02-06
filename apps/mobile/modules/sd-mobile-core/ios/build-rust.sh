#!/bin/bash
set -e

# Build Spacedrive Mobile Core Rust libraries
# This script is called by CocoaPods during the build process

echo "Building Spacedrive Mobile Core..."

# Navigate to workspace root
WORKSPACE_ROOT="$PODS_TARGET_SRCROOT/../../../../.."
cd "$WORKSPACE_ROOT"

# Ensure we're in the right directory
pwd

# Export CFLAGS to fix libwebp linker issues
export CFLAGS_aarch64_apple_ios="-fno-stack-check -fno-stack-protector"
export CFLAGS_aarch64_apple_ios_sim="-fno-stack-check -fno-stack-protector"

# Clean aws-lc-sys build cache if requested (fixes stale cmake state when
# switching between device/simulator or after Xcode updates)
# Usage: export CLEAN_AWS_LC=1 before building in Xcode, or: CLEAN_AWS_LC=1 bun run ios
if [ "${CLEAN_AWS_LC:-0}" = "1" ]; then
    echo "Cleaning aws-lc-sys build cache..."
    rm -rf target/aarch64-apple-ios/release/build/aws-lc-sys-* || true
    rm -rf target/aarch64-apple-ios-sim/release/build/aws-lc-sys-* || true
fi

# Run xtask to build mobile libraries
cargo xtask build-mobile

echo "Rust libraries built successfully"
