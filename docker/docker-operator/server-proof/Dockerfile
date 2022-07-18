FROM node:10
ARG access_token
ARG branch=master
RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
WORKDIR /tusima-core
RUN git checkout $branch
RUN npm install
WORKDIR /tusima-core/rollup-operator/src
RUN npm install

CMD ["sh","-c","node server-proof.js $PROOF_TIME"]