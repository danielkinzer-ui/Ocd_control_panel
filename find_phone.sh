#!/bin/bash
# Quick find my phone script
# Usage: ./find_phone.sh PHONE_IP TOKEN

PHONE_IP=${1:-"192.168.1.100"}
TOKEN=${2:-""}
PORT=${3:-18790}

if [ -z "$TOKEN" ]; then
    echo "Usage: ./find_phone.sh PHONE_IP TOKEN [PORT]"
    echo "Example: ./find_phone.sh 192.168.1.100 abc123def456"
    exit 1
fi

echo "🔍 Finding your phone (port $PORT)..."
echo ""

# Get location
echo "📍 Getting location..."
LOCATION=$(curl -s -H "X-OCD-Token: $TOKEN" "http://$PHONE_IP:$PORT/location" 2>/dev/null)
echo "Location: $LOCATION"
echo ""

# Ring phone
echo "🔔 Ringing phone..."
curl -s -X POST -H "X-OCD-Token: $TOKEN" "http://$PHONE_IP:$PORT/ring" 2>/dev/null
echo ""

echo "✅ Done! Phone should be ringing."
