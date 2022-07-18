FROM node:10
ARG access_token
ARG branch=master
RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
RUN mkdir table-conversion

# Download and install dependencies
WORKDIR /tusima-core
RUN git checkout $branch
RUN npm install
WORKDIR /tusima-core/rollup-operator/src
RUN npm install
WORKDIR /tusima-core

# Build configuration files
COPY config-pool/* ./
RUN node build-config.js
RUN ./create-config-env.sh
RUN mv config.env ./rollup-operator/src/synch-pool-service/

CMD ["sh", "-c", "node rollup-operator/src/synch-pool-service/run-synch-pool --clear $CLEAR_DB"]