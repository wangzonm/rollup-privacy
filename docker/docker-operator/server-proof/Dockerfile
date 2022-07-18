FROM node:10
#ARG access_token
ARG branch=master
#RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
RUN git clone https://github.com/wangzonm/rollup.git
WORKDIR /rollup
RUN git checkout $branch
RUN npm install
WORKDIR /rollup/rollup-operator/src
RUN npm install

CMD ["sh","-c","node server-proof.js $PROOF_TIME"]
