#!/bin/sh

set -eu
exec node /app/scripts/action-entrypoint.cjs "$@"
