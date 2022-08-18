/* eslint-disable no-restricted-syntax */
const { stringifyBigInts } = require('ffjavascript').utils;

const CliExternalOperator = require('../../../../rollup-operator/src/cli-external-operator');
const Constants = require('../../../../js/constants');
const NodeRSA = require('node-rsa');

// check the nonce from the operator and Nonce object and decide wich one use
async function _checkNonce(responseLeaf, currentBatch, nonceObject) {
    const nonceId = nonceObject.find((x) => x.tokenId === responseLeaf.tokenId);
    let nonce;
    if (nonceId !== undefined && nonceId.batch === currentBatch) { // only if the nonce object stores the nonce of the current batch
        nonce = nonceId.nonce;
    } else {
        nonce = responseLeaf.nonce;
    }
    const infoTx = { tokenId: responseLeaf.tokenId, currentBatch, nonce };
    return infoTx;
}

function _addNonce(nonceObject, currentBatch, nonce, tokenId) {
    const newNonce = nonce + 1;
    if (nonceObject !== undefined) {
        if (nonceObject.length > 0) {
            const nonceId = nonceObject.find((x) => x.tokenId === tokenId);
            if (nonceId !== undefined) {
                nonceObject = nonceObject.filter((x) => x.tokenId !== tokenId);
            }
        }
    } else {
        nonceObject = [];
    }
    nonceObject.push({ tokenId, batch: currentBatch, nonce: newNonce });
    return nonceObject;
}

/**
 * send off-chain transaction
 * @param {String} urlOperator - url from operator
 * @param {String[2]} babyjubTo - babyjub public key receiver
 * @param {String} amount - amount to transfer
 * @param {Object} walletRollup - ethAddress and babyPubKey together
 * @param {Number} tokenId - token type identifier, the sender and the receive must use the same token
 * @param {String} fee - % of th amount that the user is willing to pay in fees
 * @param {String} nonce - hardcoded from user
 * @param {Object} nonceObject - stored object wich keep tracking of the last transaction nonce sent by the client
 * @param {String} ethAddress - Ethereum address enconded as hexadecimal string to be used in deposit off-chains
 * @returns {Object} - return a object with the response status, current batch, current nonce and nonceObject
*/
async function send(urlOperator, babyjubTo, amount, walletRollup, tokenId, fee, nonce, nonceObject, ethAddress) {
    const walletBaby = walletRollup.babyjubWallet;
    const [fromAx, fromAy] = [walletBaby.publicKey[0].toString(16), walletBaby.publicKey[1].toString(16)];

    const apiOperator = new CliExternalOperator(urlOperator);
    const generalInfo = await apiOperator.getState();
    const currentBatch = generalInfo.data.rollupSynch.lastBatchSynched;

    let toEthAddr;
    if (babyjubTo[0] === Constants.exitAx && babyjubTo[1] === Constants.exitAy) {
        toEthAddr = Constants.exitEthAddr;
    } else {
        try {
            const res = await apiOperator.getStateAccount(tokenId, babyjubTo[0], babyjubTo[1]);
            const senderLeaf = res.data;
            toEthAddr = senderLeaf.ethAddress;
            console.log("toEthAddr: " + toEthAddr);
        } catch (err) {
            toEthAddr = ethAddress;
        }
    }

    let nonceToSend;
    if (nonce !== undefined) nonceToSend = nonce;
    else {
        const resOp = await apiOperator.getStateAccount(tokenId, fromAx, fromAy);
        const senderLeaf = resOp.data;
        if (nonceObject !== undefined) {
            const res = await _checkNonce(senderLeaf, currentBatch, nonceObject);
            nonceToSend = res.nonce;
        } else nonceToSend = senderLeaf.nonce;
    }

    const tx = {
        toAx: babyjubTo[0],
        toAy: babyjubTo[1],
        toEthAddr,
        coin: tokenId,
        amount,
        nonce: nonceToSend,
        fee,
        rqOffset: 0,
        onChain: 0,
        newAccount: 0,
    };

    await walletRollup.signRollupTx(tx); // sign included in transaction
    const parseTx = stringifyBigInts(tx);


    let opEncPubKey;
    // try {
    //     const res = await apiOperator.getOperatorEncPubKey();
    //     opEncPubKey = res.data;
    //     console.log('opEncPubKey:' + opEncPubKey);
    // } catch (err) {
    //     console.log(`${err.message}`);
    // }

    const resp = await apiOperator.getOperatorEncPubKey();
    if(resp.status.toString() !== '200'){
        return resp;
    }
    opEncPubKey = resp.data;
    console.log('opEncPubKey:' + opEncPubKey);

    let opKey = new NodeRSA();
    opKey.importKey(Buffer.from(opEncPubKey, 'hex'), 'pkcs1-public-der');

    const encTx = {
        toAx: opKey.encrypt(tx.toAx, 'base64'),
        toAy: opKey.encrypt(tx.toAy, 'base64'),
        toEthAddr: opKey.encrypt(tx.toEthAddr, 'base64'),
        coin: opKey.encrypt(tx.coin.toString(), 'base64'),
        amount: opKey.encrypt(tx.amount, 'base64'),
        nonce: nonceToSend,
        fee,
        rqOffset: 0,
        onChain: 0,
        newAccount: 0,
        r8x: tx.r8x,
        r8y: tx.r8y,
        s: tx.s,
        fromAx: opKey.encrypt(tx.fromAx, 'base64'),
        fromAy: opKey.encrypt(tx.fromAy, 'base64'),
        fromEthAddr: opKey.encrypt(tx.fromEthAddr, 'base64'),

    }
    // const parseTx = stringifyBigInts(tx);
    // const resTx = await apiOperator.sendTx(parseTx);

    const parseEncTx = stringifyBigInts(encTx);
    console.log('---------in rollup-cli------sender.js--------');
    console.log('-----------tx-------------');
    console.log(tx);
    console.log('---------parseTx----------');
    console.log(parseTx);
    console.log('-------------encTx--------------------------');
    console.log(encTx);
    console.log('--------------parseEncTx-------------------');
    console.log(parseEncTx);

    
    const resTx = await apiOperator.sendTx(parseEncTx);


    let nonceObjectToWrite;
    if (resTx.status.toString() === '200') {
        nonceObjectToWrite = _addNonce(nonceObject, currentBatch, nonceToSend, tokenId);
    }
    const res = {
        status: resTx.status,
        txHash: resTx.data.txHash,
        currentBatch,
        nonce: nonceToSend,
        nonceObject: nonceObjectToWrite,
    };

    return res;
}

module.exports = { send };
