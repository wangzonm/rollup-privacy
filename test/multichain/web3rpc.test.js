const { assert, expect } = require("chai");
const Web3 = require('web3');

describe("Contract PoB rpc test", async function() {
    it("Call method", async function() {
        // tusima test
        const web3 = new Web3(new Web3.providers.HttpProvider("http://164.52.51.13:8545"));
        // tusima
        // const web3 = new Web3(new Web3.providers.HttpProvider("http://106.3.133.180:8545"));
        // kovan test
        // const web3 = new Web3(new Web3.providers.HttpProvider("https://kovan.infura.io/v3/6ef437a0bfc743d0bbfe73f72c90afd4"));
        
        web3.eth.net.isListening().then(async (result) => {
            console.log("---- " + result);
        });

        // await web3.eth.net.isListening();

        let isListening;
        isListening = await web3.eth.net.isListening();
        assert.equal(isListening, true);
    });
});