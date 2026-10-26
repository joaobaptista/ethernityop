FROM node:22-alpine

WORKDIR /app

# Install native dependencies required for build tools (e.g. sharp/ffmpeg if needed)
RUN apk add --no-cache ffmpeg python3 make g++

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3333 8000

CMD ["node", "src/server.js"]
