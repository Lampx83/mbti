FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_AI_API_BASE=""
ARG VITE_LOG_API_BASE=""
ENV VITE_AI_API_BASE=$VITE_AI_API_BASE
ENV VITE_LOG_API_BASE=$VITE_LOG_API_BASE
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server.js"]
