#!/bin/bash
# Build sd-server + sd-cli natively on TrueNAS Scale
# Uses zig cc as C compiler (since gcc/clang not installed)
# Dev tools at /mnt/pool/dev-tools/

set -e
SR=/mnt/pool/dev-tools/sysroot
export BINDGEN_EXTRA_CLANG_ARGS="-I$SR/usr/lib/gcc/x86_64-linux-gnu/12/include -I$SR/usr/include -I$SR/usr/include/x86_64-linux-gnu"
export PATH="/mnt/pool/dev-tools:/mnt/pool/dev-tools/bin:/mnt/pool/dev-tools/sysroot/usr/bin:$PATH"
export CC=/mnt/pool/dev-tools/cc
export CXX="/mnt/pool/dev-tools/c++"
export AR=/mnt/pool/dev-tools/ar
export C_INCLUDE_PATH="$SR/usr/include:$SR/usr/include/x86_64-linux-gnu:$SR/usr/lib/gcc/x86_64-linux-gnu/12/include"
export CPLUS_INCLUDE_PATH="$C_INCLUDE_PATH"
export OPENSSL_INCLUDE_DIR="$SR/usr/include"
export OPENSSL_LIB_DIR="$SR/usr/lib/x86_64-linux-gnu"

cd /mnt/pool/spacedrive
cargo build --release --bin sd-server --bin sd-cli \
  --features sd-core/heif,sd-core/ffmpeg \
  -j10 "$@"

echo "Binaries at:"
ls -lh target/release/sd-server target/release/sd-cli 2>/dev/null
