# pull the base image
FROM node:alpine as base
USER root

FROM base AS builder
USER root
WORKDIR /code
RUN apk add --no-cache python3 py3-pip make g++

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
RUN npm install -g typescript
RUN npm install --loglevel warn --production

COPY . /code

RUN npm run build

FROM base AS production
USER root
LABEL name="Soul Machines Watson NeuralSeek Orchestrator" \
  vendor="IBM" \
  #version="$IMAGE_VERSION" \
  summary="Backend orchestration server" \
  description="Used for handling Watson Assistant and NeuralSeek integration"

ENV NODE_ENV production

ENV EXPRESS_SERVER=wx-avatar-ui.15frzqybga04.us-south.codeengine.appdomain.cloud
ENV EXPRESS_PORT=3001
ENV SSL_CERT=./certs/localhost.crt
ENV SSL_KEY=./certs/localhost.key

# Create a non-root user
RUN addgroup -S watson 
RUN adduser -S watson -G watson

RUN npm i -g pm2

# Create app directory
WORKDIR /home/watson

# Copy the built application
COPY --from=builder --chown=app:0 ["/code", "/home/watson"]

RUN chmod -R 777 /home/watson

USER watson

ENV HOME="/home/watson"

EXPOSE 8080 443 80

CMD ["pm2-runtime", "./dist/server.js"]