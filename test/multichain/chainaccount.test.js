const { assert, expect } = require("chai");
const Scalar = require("ffjavascript").Scalar;
const poseidon = require("circomlib").poseidon;
const poseidonHash = poseidon.createHash(6, 8, 57);
const Constants = require("../../js/constants");
const utils = require("../../rollup-cli/helpers/utils");
const CliExternalOperator = require('../../rollup-operator/src/cli-external-operator');
/* eslint-disable no-restricted-syntax */
const { stringifyBigInts } = require('ffjavascript').utils;
const MultiChainTxSend = require("../../rollup-operator/src/multichainTxSend");

describe("Cross chain account", async function() {
    it("Chain account definition should be correct", async function() {
        const hashAxAy = poseidonHash([Scalar.fromString(Constants.mainnetAx, 16), Scalar.fromString(Constants.mainnetAy, 16)]);
        const a = Scalar.eq(hashAxAy, Constants.mainnetAccount);
        assert.equal(a, true);
    });

    it("Can compute out the right rollup account", async function() {
        const ax = "2faa6242826700b2118c7b3ac601451b627061116d196f7ff03bda7e189e16cb";
        const ay = "2f116982d128d058135564de86b0654da88a82f2d942acee5457f69336ba390d";
        const rollupAddress = utils.pointHexToCompress([ax, ay]);
        assert.equal(rollupAddress, "0d39ba3693f65754eeac42d9f2828aa84d65b086de64551358d028d1826911af");
    });
});

describe("Cross chain", async function() {
    it("Can send cross chain receive tx", async function() {
        const urlOperator = "http://127.0.0.1:9006";
        const toAx = "2faa6242826700b2118c7b3ac601451b627061116d196f7ff03bda7e189e16cb";
        const toAy = "2f116982d128d058135564de86b0654da88a82f2d942acee5457f69336ba390d";
        const toEthAddr = "0x21859705f7b8512e9f9745216d4e31ff2fa2b0aa";

        const res = await MultiChainTxSend.sendTxToTargetChain(urlOperator, 
            Constants.mainnetAx, 
            Constants.mainnetAy,
            Constants.mainnetEthAddr,
            toAx,
            toAy,
            toEthAddr,
            0,
            20000000000000000000);
        assert.equal(res.status.toString(), "200");
    });
});