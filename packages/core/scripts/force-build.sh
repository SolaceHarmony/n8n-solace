#!/bin/bash
echo "Forcefully compiling TypeScript code regardless of errors..."
npx tsc --build tsconfig.build.json --skipLibCheck --pretty false || true
npx tsc-alias -p tsconfig.build.json || true
