FROM node:10
#ARG access_token
ARG branch=master
#RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
RUN git clone https://github.com/wangzonm/rollup.git
WORKDIR /rollup
RUN git checkout $branch
RUN npm install
COPY ./config-contracts/* ./

CMD ["sh", "-c", "npx truffle compile && node deployment-script.js && cp synch-config.json ../config-contracts/ && cp pool-config.json ../config-contracts/ && cp wallet.json ../config-contracts/ "]
