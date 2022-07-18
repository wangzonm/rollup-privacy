/* global artifacts */
/* global contract */
/* global web3 */
const poseidonUnit = require("circomlib/src/poseidon_gencontract");
const TokenRollup = artifacts.require("../contracts/test/TokenRollup");
const Verifier = artifacts.require("../contracts/test/VerifierHelper");
const RollupPoB = artifacts.require("../contracts/RollupPoB");
const Rollup = artifacts.require("../contracts/test/Rollup");
const fs = require("fs");
const path = require("path");
const ethers = require("ethers");
const Scalar = require("ffjavascript").Scalar;

const configSynchPath = path.join(__dirname, "../../config/synch-config-pob-test.json");
const configPoolPath = path.join(__dirname, "../../config/pool-config-pob-test.json");
const configWalletPath = path.join(__dirname, "../../config/wallet-pob-test.json");
const configTestPath = path.join(__dirname, "../../config/test-pob.json");

// service synchronize pool
const configSynchPoolPath = path.join(__dirname, "../../synch-pool-service/config/config-test.json");
const pathConversionTable = path.join(__dirname,"../../config/table-conversion-test.json");
const pathCustomTokens = path.join(__dirname,"../../config/custom-test.json");

function to18(e) {
    return Scalar.mul(e, Scalar.pow(10, 18));
}

contract("Operator Server", (accounts) => {
    const {
        0: owner,
        1: tokenId,
        2: callerAddress,
        3: feeTokenAddress,
        4: defaultOperator,
    } = accounts;

    const maxTx = 10;
    const maxOnChainTx = 5;
    const tokenInitialAmount = to18(100000);
    const url = "localhost";
    const burnAddress = "0x0000000000000000000000000000000000000000";

    let insPoseidonUnit;
    let insTokenRollup;
    let insRollupPoB;
    let insRollup;
    let insVerifier;

    before(async () => {
        // Deploy poseidon
        const C = new web3.eth.Contract(poseidonUnit.abi);
        insPoseidonUnit = await C.deploy({ data: poseidonUnit.createCode() })
            .send({ gas: 2500000, from: owner });

        // Deploy TokenRollup
        insTokenRollup = await TokenRollup.new(tokenId, tokenInitialAmount.toString());

        // Deploy Verifier
        insVerifier = await Verifier.new();

        // Deploy Rollup test
        insRollup = await Rollup.new(insVerifier.address, insPoseidonUnit._address,
            maxTx, maxOnChainTx, feeTokenAddress);

        // Deploy Staker manager
        insRollupPoB = await RollupPoB.new(insRollup.address, maxTx, burnAddress, defaultOperator, url);

        // load forge batch mechanism
        await insRollup.loadForgeBatchMechanism(insRollupPoB.address);

        // add token to Rollup
        await insRollup.addToken(insTokenRollup.address,
            { from: tokenId, value: web3.utils.toWei("1", "ether") });
    });

    it("Should load operator wallet with funds", async () => {
        const pass = "passTest";
        let privateKey = "0x0123456789012345678901234567890123456789012345678901234567890123";
        const walletOp = new ethers.Wallet(privateKey);
        const initBalance = 1000;
        await web3.eth.sendTransaction({to: walletOp.address, from: owner,
            value: web3.utils.toWei(initBalance.toString(), "ether")});
        const walletOpEnc = await walletOp.encrypt(pass);
        fs.writeFileSync(configWalletPath, walletOpEnc);
    });

    it("Should create rollup synch config file", async () => {
        const config = {
            rollup: {
                synchDb: undefined,
                treeDb: undefined,
                address: insRollup.address,
                abi: Rollup.abi,
                creationHash: insRollup.transactionHash,
                timeouts: { ERROR: 1000, NEXT_LOOP: 2500, LOGGER: 5000 },
            },
            rollupPoB: {
                synchDb: undefined,
                address: insRollupPoB.address,
                abi: RollupPoB.abi,
                creationHash: insRollupPoB.transactionHash,
                timeouts: { ERROR: 1000, NEXT_LOOP: 2500, LOGGER: 5000 },
            },
            ethNodeUrl:"http://localhost:8545",
            ethAddressCaller: callerAddress,
        };
        fs.writeFileSync(configSynchPath, JSON.stringify(config));
    });

    it("Should create pool config file", async () => {
        const config = {
            maxSlots: 10,
            maxDeposits: 18,               
            executableSlots: 1,      
            nonExecutableSlots: 1,      
            timeout: 1000,
            pathConversionTable,
            timeouts: { ERROR: 1000, NEXT_LOOP: 10000 },     
        };
        fs.writeFileSync(configPoolPath, JSON.stringify(config));
    });

    it("Should expose data to run server test", async () => {
        const testConfig = {
            rollupAddress: insRollup.address,
            tokenAddress: insTokenRollup.address,
            pobAddress: insRollupPoB.address,
        };
        fs.writeFileSync(configTestPath, JSON.stringify(testConfig));
    });

    it("Should create service synch pool file", async () => {
        let config = {
            pathDb: undefined,
            ethNodeUrl: "http://localhost:8545",
            ethAddress: callerAddress,
            rollupAddress: insRollup.address,
            rollupAbi: Rollup.abi,
            logLevel: "debug",
            pathConversionTable: pathConversionTable,
            pathCustomTokens: pathCustomTokens,
            timeouts: { ERROR: 5000, NEXT_LOOP: 10000 },
        };

        fs.writeFileSync(configSynchPoolPath, JSON.stringify(config));
    });

    it("Should create custom conversion table", async () => {
        // Write custom table
        const tableConversion = {};
        tableConversion[insTokenRollup.address] = {
            price: 1,
            decimals: 18,
        };
        fs.writeFileSync(pathCustomTokens, JSON.stringify(tableConversion));
    });
});
