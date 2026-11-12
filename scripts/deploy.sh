#!/usr/bin/env bash
# Выкладка на Vercel. Оба адреса (sarqyt-atu и zerowaste-atu) привязаны к проекту как домены и обновляются сами.
vercel deploy --prod --yes 2>&1 | grep -E "Aliased|Error" || true
