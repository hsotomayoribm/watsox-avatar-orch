# pull the base image
FROM node:alpine as base

# set the working direction
WORKDIR /app

COPY package*.json ./

RUN npm i

COPY . .

FROM base as production

ENV NODE_PATH=./build

RUN npm run build

ENV NODE_ENV production

EXPOSE 3001

# start app
CMD ["npm", "run", "start"]
