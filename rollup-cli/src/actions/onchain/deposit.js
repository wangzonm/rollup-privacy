const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const { getGasPrice } = require('./utils');
const NodeRSA = require("node-rsa");

/**
 * deposit on-chain transaction
 * add new leaf to balance tree and initializes it with a load amount
 * @param {String} nodeEth - URL of the ethereum node
 * @param {String} addressSC - rollup address
 * @param {String} loadAmount - initial balance on balance tree
 * @param {Number} tokenId - token type identifier
 * @param {Object} walletRollup - ethAddress and babyPubKey together
 * @param {String} ethAddress - allowed address to control new balance tree leaf
 * @param {String} abi - abi of rollup contract
 * @param {Number} gasLimit - transaction gas limit
 * @param {Number} gasMultiplier - multiply gas price
 * @returns {Promise} - promise will resolve when the Tx is sent, and return the Tx itself with the Tx Hash.
*/
async function deposit(nodeEth, addressSC, loadAmount, tokenId, walletRollup,
    ethAddress, rsaPubKey, abi, gasLimit = 5000000, gasMultiplier = 1) {
    const walletBaby = walletRollup.babyjubWallet;
    const pubKeyBabyjub = [walletBaby.publicKey[0].toString(), walletBaby.publicKey[1].toString()];

    let walletEth = walletRollup.ethWallet.wallet;
    const provider = new ethers.providers.JsonRpcProvider(nodeEth);
    walletEth = walletEth.connect(provider);
    const contractWithSigner = new ethers.Contract(addressSC, abi, walletEth);

    const address = ethAddress || await walletEth.getAddress();

    const feeOnchainTx = await contractWithSigner.feeOnchainTx();
    const feeDeposit = await contractWithSigner.depositFee();

    console.log('--------in function deposit-------------');
    console.log(rsaPubKey);
    let publicDer =  Buffer.from(rsaPubKey, 'hex');

    let buffer1 = Buffer.alloc(32);
    let buffer2 = Buffer.alloc(32);
    let buffer3 = Buffer.alloc(32);
    let buffer4 = Buffer.alloc(32);
    let buffer5 = Buffer.alloc(32);

    publicDer.copy(buffer1, 0, 0, 32);
    publicDer.copy(buffer2, 0, 32, 64);
    publicDer.copy(buffer3, 0, 64, 96);
    publicDer.copy(buffer4, 0, 96, 128);
    publicDer.copy(buffer5, 0, 128, 140);

    console.log('buffer1');
    console.log(buffer1); 
    console.log('buffer2');
    console.log(buffer2); 
    console.log('buffer3');
    console.log(buffer3); 
    console.log('buffer4');
    console.log(buffer4); 
    console.log('buffer5');
    console.log(buffer5); 
    console.log('------public key der format---------');
    console.log(publicDer.toString('Hex'));


    const overrides = {
        gasLimit,
        gasPrice: await getGasPrice(gasMultiplier, provider),
        value: `0x${(Scalar.add(feeOnchainTx, feeDeposit)).toString(16)}`,
    };
    try {
        return await contractWithSigner.deposit(loadAmount, tokenId, address, pubKeyBabyjub, [buffer1, buffer2, buffer3, buffer4, buffer5], overrides);
    } catch (error) {
        throw new Error(`Message error: ${error.message}`);
    }
}

module.exports = {
    deposit,
};
