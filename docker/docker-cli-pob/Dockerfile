FROM node:10
ARG access_token
ARG branch=master
RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
WORKDIR /rollup
RUN git checkout $branch
RUN npm install
COPY config-cli-pob/* ./
RUN node build-config.js
RUN mv config.json ./cli-pob
RUN mv wallet.json ./cli-pob
WORKDIR "./cli-pob"

CMD ["sh", "-c", ""]