#!/usr/bin/env bash
# Выкладка на Vercel + оба адреса
set -e
vercel deploy --prod --yes 2>&1 | grep -E "Aliased|Error" || true
vercel alias set zerowaste-atu.vercel.app sarqyt-atu.vercel.app 2>&1 | grep -E "Success|Error" || true
