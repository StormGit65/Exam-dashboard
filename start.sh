#!/bin/bash

# Change directory to the script's location
cd "$(dirname "$0")" || exit

# Start server
node server.js

# If node exits unexpectedly, keep terminal open to see errors
echo ""
echo "  Server stopped. Press Enter to close..."
read -r
