FROM node:10
ARG access_token
RUN git clone https://oauth2:${access_token}@github.com/triathon/tusima-core.git
WORKDIR "./rollup"
RUN npm install
COPY config-cli-pos/* ./
RUN node build-config.js
RUN mv config.json ./cli-pos
RUN mv wallet.json ./cli-pos
WORKDIR "./cli-pos"

CMD ["sh", "-c", ""]