const Scalar = require("ffjavascript").Scalar;
const poseidon = require("circomlib").poseidon;
const poseidonHash = poseidon.createHash(6, 8, 57);
const Constants = require("../../js/constants");
// const utils = require("../../rollup-cli/helpers/utils");
const CliExternalOperator = require('./cli-external-operator');
/* eslint-disable no-restricted-syntax */
const { stringifyBigInts } = require('ffjavascript').utils;

module.exports.sendTxToTargetChain = async function(
    urlOperator, 
    fromAx, 
    fromAy, 
    fromEthAddr, 
    toAx, 
    toAy, 
    toEthAddr, 
    coin,
    amount
) {
    // const urlOperator = "http://127.0.0.1:9000";
    // const toAx = "2faa6242826700b2118c7b3ac601451b627061116d196f7ff03bda7e189e16cb";
    // const toAy = "2f116982d128d058135564de86b0654da88a82f2d942acee5457f69336ba390d";
    // const toEthAddr = "0x21859705f7b8512e9f9745216d4e31ff2fa2b0aa";

    const apiOperator = new CliExternalOperator(urlOperator);
    const generalInfo = await apiOperator.getState();
    const currentBatch = generalInfo.data.rollupSynch.lastBatchSynched;

    const resOp = await apiOperator.getStateAccount(0, Constants.mainnetAx, Constants.mainnetAy);
    const senderLeaf = resOp.data;

    const tx = {
        // r8x = signature.R8[0];
        // r8y = signature.R8[1];
        // s = signature.S;
        fromAx,
        fromAy,
        fromEthAddr,
        toAx,
        toAy,
        toEthAddr,
        coin,
        amount,
        nonce: senderLeaf.nonce + 1,
        fee: 14,
        rqOffset: 0,
        onChain: 0,
        newAccount: 0,
    };

    console.log("----------- cross chain tx:");
    console.log(tx);

    const parseTx = stringifyBigInts(tx);
    const resTx = await apiOperator.sendTx(parseTx);
    
    const res = {
        status: resTx.status,
        currentBatch,
    };
    
    return res;
}