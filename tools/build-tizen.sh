#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source tools/studio-env.sh
"$TIZEN_STUDIO/tools/ide/bin/tizen" build-web -- apps/tizen
"$TIZEN_STUDIO/tools/ide/bin/tizen" package -t wgt -s "${TIZEN_PROFILE:-TV-test-3}" -- apps/tizen/.buildResult
