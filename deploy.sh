#!/bin/bash
# Pull the latest changes from GitHub
git pull origin main

# Optionally you might need to create a .env in `server/.env` if you prefer it instead of docker-compose variables

# Rebuild and restart the container in the background
docker-compose up -d --build
echo "App deployed successfully! Running on localhost:80"
