const path = require("path");
const fs = require("fs");
const configSynchPath = path.join(__dirname, "./synch-config.json");
const configPath = path.join(__dirname, "./config.json");

const configSynch = JSON.parse(fs.readFileSync(configSynchPath, "utf-8"));
const config = {
    nodeUrl: configSynch.ethNodeUrl,
    posAddress: configSynch.rollupPoS.address,
    posAbi: configSynch.rollupPoS.abi
};

fs.writeFileSync(configPath, JSON.stringify(config));