#!/bin/bash
# Start SSH tunnel to DEV PostgreSQL
# Run this in a separate terminal before starting the platform

echo "Starting SSH tunnel to DEV PostgreSQL..."
echo "Forwarding localhost:5433 -> 134.199.235.140:5432"
echo "Press Ctrl+C to stop"
echo ""

ssh -i ~/.ssh/swarm_key -N -L 5433:localhost:5432 root@134.199.235.140
