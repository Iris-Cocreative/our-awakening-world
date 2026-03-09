#!/bin/bash
# Simple server for embed pages
# Usage: ./serve-embeds.sh [port]
# Default port: 8080

PORT="${1:-8080}"

echo "Serving embed pages on http://localhost:$PORT"
echo ""
echo "  Our Awakening World:  http://localhost:$PORT/embed.html"
echo "  We Once Were One:     http://localhost:$PORT/embed-weoncewereone.html"
echo ""
echo "Press Ctrl+C to stop."
echo ""

python3 -m http.server "$PORT" --bind 0.0.0.0
