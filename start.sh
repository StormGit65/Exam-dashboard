#!/bin/bash

# Change directory to the script's location
cd "$(dirname "$0")" || exit

# Open browser after a short delay (runs in background)
(sleep 2 && xdg-open http://localhost:3000 > /dev/null 2>&1) &

# Start server — this keeps the terminal alive
echo ""
echo "  Kaizen is running at http://localhost:3000"
echo "  Close this terminal or press Ctrl+C to stop the server."
echo ""
node server.js

# If node exits unexpectedly, keep terminal open to see errors
echo ""
echo "  Server stopped. Press Enter to close..."
read -r
