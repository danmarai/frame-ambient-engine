#!/usr/bin/env bash
# Source in a build shell; does not alter global Node/Java installations.
export PATH="$HOME/.local/share/frame-toolchain/node/bin:$HOME/.local/share/frame-toolchain/pnpm/node_modules/.bin:/opt/homebrew/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export TIZEN_STUDIO="$HOME/tizen-studio"
