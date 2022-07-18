FROM node:10
#ARG access_token
ARG branch=master
#RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
RUN git clone https://github.com/wangzonm/rollup.git
RUN mkdir table-conversion

# Download and install dependencies
WORKDIR /rollup
RUN git checkout $branch
RUN npm install
WORKDIR /rollup/rollup-operator
RUN npm install
WORKDIR /rollup

# Build configuration files
COPY config-operator/* ./
RUN node build-config.js
RUN ./create-config-env.sh
RUN mv pool-config.json ./rollup-operator/src/server/proof-of-burn
RUN mv synch-config.json ./rollup-operator/src/server/proof-of-burn
RUN mv wallet.json ./rollup-operator/src/server/proof-of-burn
RUN mv config.env ./rollup-operator/src/server/proof-of-burn

CMD ["sh","-c","node rollup-operator/src/server/proof-of-burn/operator-pob.js --clear $CLEAR_DB --onlysynch $ONLY_SYNCH"]
