FROM node:20-alpine as build
WORKDIR /app

# Build the client app (React/Vite)
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

# Setup the Node.js Express server
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server ./server

# Final lean stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server ./server
WORKDIR /app/server
EXPOSE 3000
CMD ["npm", "start"]
