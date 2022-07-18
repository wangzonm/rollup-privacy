FROM node:10
ARG access_token
ARG branch=master
RUN npm install -g browserify
RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
WORKDIR "./tusima-core"
RUN git checkout $branch
RUN npm install
RUN npm run build:webapp
COPY config-webapp/* ./
RUN node build-config.js
RUN mv config.json ./simple-webapp/src/utils
WORKDIR "./simple-webapp"
RUN npm install

CMD ["npm", "start"]