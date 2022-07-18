const poseidon = require("circomlib").poseidon;
const utils = require("ffjavascript").utils;
const Scalar = require("ffjavascript").Scalar;

function string2Int(str) {
    return utils.leBuff2int(Buffer.from(str));
}

const hash = poseidon.createHash(1, 8, 57);
const hash6 = poseidon.createHash(6, 8, 57);

module.exports.DB_Master = hash([string2Int("Rollup_DB_Master")]);
module.exports.DB_Batch = hash([string2Int("Rollup_DB_Batch")]);
module.exports.DB_Idx = hash([string2Int("Rollup_DB_Idx")]);
module.exports.DB_AxAy = hash([string2Int("Rollup_DB_AxAy")]);
module.exports.DB_EthAddr = hash([string2Int("Rollup_DB_EthAddr")]);
module.exports.DB_TxPoolSlotsMap = hash([string2Int("Rollup_DB_TxPoolSlots")]);
module.exports.DB_TxPollTx = hash([string2Int("Rollup_DB_TxPollTx")]);
module.exports.DB_TxPoolDepositTx = hash([string2Int("Rollup_DB_TxPoolDepositTx")]);
module.exports.DB_NumBatch_Idx = hash([string2Int("Rollup_DB_NumBatch_Idx")]);
module.exports.DB_NumBatch_AxAy = hash([string2Int("Rollup_DB_NumBatch_AxAy")]);
module.exports.DB_NumBatch_EthAddr = hash([string2Int("Rollup_DB_NumBatch_EthAddr")]);
module.exports.DB_InitialIdx = hash([string2Int("Rollup_DB_Initial_Idx")]);

module.exports.exitAx = "0x0000000000000000000000000000000000000000000000000000000000000000";
module.exports.exitAy = "0x0000000000000000000000000000000000000000000000000000000000000000";
module.exports.exitEthAddr = "0x0000000000000000000000000000000000000000";
module.exports.exitAccount = hash6([Scalar.fromString(this.exitAx, 16), Scalar.fromString(this.exitAy, 16)]);
module.exports.exitAccountIdx = 0;

// multi-chain account: mainnet 1
module.exports.mainnetAx = "0x0000000000000000000000000000000000000000000000000000000000000001";
module.exports.mainnetAy = "0x0000000000000000000000000000000000000000000000000000000000000001";
module.exports.mainnetEthAddr = "0x0000000000000000000000000000000000000001";
module.exports.mainnetAccount = hash6([Scalar.fromString(this.mainnetAx, 16), Scalar.fromString(this.mainnetAy, 16)]);
module.exports.mainnetAccountIdx = 1;

// multi-chain account: ropsten 2
module.exports.ropstenAx = "0x0000000000000000000000000000000000000000000000000000000000000002";
module.exports.ropstenAy = "0x0000000000000000000000000000000000000000000000000000000000000002";
module.exports.ropstenEthAddr = "0x0000000000000000000000000000000000000002";
module.exports.ropstenAccount = hash6([Scalar.fromString(this.ropstenAx, 16), Scalar.fromString(this.ropstenAy, 16)]);
module.exports.ropstenAccountIdx = 2;

// multi-chain account: kovan 3
module.exports.kovanAx = "0x0000000000000000000000000000000000000000000000000000000000000003";
module.exports.kovanAy = "0x0000000000000000000000000000000000000000000000000000000000000003";
module.exports.kovanEthAddr = "0x0000000000000000000000000000000000000003";
module.exports.kovanAccount = hash6([Scalar.fromString(this.kovanAx, 16), Scalar.fromString(this.kovanAy, 16)]);
module.exports.kovanAccountIdx = 3;

// multi-chain account: rinkeby 4
module.exports.rinkebyAx = "0x0000000000000000000000000000000000000000000000000000000000000004";
module.exports.rinkebyAy = "0x0000000000000000000000000000000000000000000000000000000000000004";
module.exports.rinkebyEthAddr = "0x0000000000000000000000000000000000000004";
module.exports.rinkebyAccount = hash6([Scalar.fromString(this.rinkebyAx, 16), Scalar.fromString(this.rinkebyAy, 16)]);
module.exports.rinkebyAccountIdx = 4;

// multi-chain account: goerli 5
module.exports.goerliAx = "0x0000000000000000000000000000000000000000000000000000000000000005";
module.exports.goerliAy = "0x0000000000000000000000000000000000000000000000000000000000000005";
module.exports.goerliEthAddr = "0x0000000000000000000000000000000000000005";
module.exports.goerliAccount = hash6([Scalar.fromString(this.goerliAx, 16), Scalar.fromString(this.goerliAy, 16)]);
module.exports.goerliAccountIdx = 5;

// multi-chain account: bsc 6
module.exports.bscAx = "0x0000000000000000000000000000000000000000000000000000000000000006";
module.exports.bscAy = "0x0000000000000000000000000000000000000000000000000000000000000006";
module.exports.bscEthAddr = "0x0000000000000000000000000000000000000006";
module.exports.bscAccount = hash6([Scalar.fromString(this.bscAx, 16), Scalar.fromString(this.bscAy, 16)]);
module.exports.bscAccountIdx = 6;

// multi-chain account: bsctest 7
module.exports.bsctestAx = "0x0000000000000000000000000000000000000000000000000000000000000007";
module.exports.bsctestAy = "0x0000000000000000000000000000000000000000000000000000000000000007";
module.exports.bsctestEthAddr = "0x0000000000000000000000000000000000000007";
module.exports.bsctestAccount = hash6([Scalar.fromString(this.bsctestAx, 16), Scalar.fromString(this.bsctestAy, 16)]);
module.exports.bsctestAccountIdx = 7;

// multi-chain account: polygon 8
module.exports.polygonAx = "0x0000000000000000000000000000000000000000000000000000000000000008";
module.exports.polygonAy = "0x0000000000000000000000000000000000000000000000000000000000000008";
module.exports.polygonEthAddr = "0x0000000000000000000000000000000000000008";
module.exports.polygonAccount = hash6([Scalar.fromString(this.polygonAx, 16), Scalar.fromString(this.polygonAy, 16)]);
module.exports.polygonAccountIdx = 8;

// multi-chain account: mumbai(polygon test) 9
module.exports.mumbaiAx = "0x0000000000000000000000000000000000000000000000000000000000000009";
module.exports.mumbaiAy = "0x0000000000000000000000000000000000000000000000000000000000000009";
module.exports.mumbaiEthAddr = "0x0000000000000000000000000000000000000009";
module.exports.mumbaiAccount = hash6([Scalar.fromString(this.mumbaiAx, 16), Scalar.fromString(this.mumbaiAy, 16)]);
module.exports.mumbaiAccountIdx = 9;

module.exports.getMultiChainAccountIdx = function(ax, ay) {
    const pkHash = hash6([Scalar.fromString(ax, 16), Scalar.fromString(ay, 16)]);
    if(Scalar.eq(pkHash, this.exitAccount)) {
        return this.exitAccountIdx;
    } else if(Scalar.eq(pkHash, this.mainnetAccount)) {
        return this.mainnetAccountIdx;
    } else if(Scalar.eq(pkHash, this.ropstenAccount)) {
        return this.ropstenAccountIdx;
    } else if(Scalar.eq(pkHash, this.kovanAccount)) {
        return this.kovanAccountIdx;
    } else if(Scalar.eq(pkHash, this.rinkebyAccount)) {
        return this.rinkebyAccountIdx;
    } else if(Scalar.eq(pkHash, this.goerliAccount)) {
        return this.goerliAccountIdx;
    } else if(Scalar.eq(pkHash, this.bscAccount)) {
        return this.bscAccountIdx;
    } else if(Scalar.eq(pkHash, this.bsctestAccount)) {
        return this.bsctestAccountIdx;
    } else if(Scalar.eq(pkHash, this.polygonAccount)) {
        return this.polygonAccountIdx;
    } else if(Scalar.eq(pkHash, this.mumbaiAccount)) {
        return this.mumbaiAccountIdx;
    }
    return null;
}

module.exports.isMultiChainAccount = function(accountIdx) {
    const arrIndex = [
        this.mainnetAccountIdx,
        this.ropstenAccountIdx,
        this.kovanAccountIdx,
        this.rinkebyAccountIdx,
        this.goerliAccountIdx,
        this.bscAccountIdx,
        this.bsctestAccountIdx,
        this.polygonAccountIdx,
        this.mumbaiAccountIdx
    ].indexOf(accountIdx);
    return (arrIndex != -1);
}

module.exports.getMultiChainAccount = function(accountIdx) {
    if (accountIdx === this.exitAccountIdx) {
        return {
            ax: this.exitAx,
            ay: this.exitAy,
            account: this.exitAccount,
            ethAddr: this.exitEthAddr,
            idx: this.exitAccountIdx
        };
    } else if (accountIdx === this.mainnetAccountIdx) {
        return {
            ax: this.mainnetAx,
            ay: this.mainnetAy,
            account: this.mainnetAccount,
            ethAddr: this.mainnetEthAddr,
            idx: this.mainnetAccountIdx
        };
    } else if (accountIdx === this.ropstenAccountIdx) {
        return {
            ax: this.ropstenAx,
            ay: this.ropstenAy,
            account: this.ropstenAccount,
            ethAddr: this.ropstenEthAddr,
            idx: this.ropstenAccountIdx
        };
    } else if (accountIdx === this.kovanAccountIdx) {
        return {
            ax: this.kovanAx,
            ay: this.kovanAy,
            account: this.kovanAccount,
            ethAddr: this.kovanEthAddr,
            idx: this.kovanAccountIdx
        };
    } else if (accountIdx === this.rinkebyAccountIdx) {
        return {
            ax: this.rinkebyAx,
            ay: this.rinkebyAy,
            account: this.rinkebyAccount,
            ethAddr: this.rinkebyEthAddr,
            idx: this.rinkebyAccountIdx
        };
    } else if (accountIdx === this.goerliAccountIdx) {
        return {
            ax: this.goerliAx,
            ay: this.goerliAy,
            account: this.goerliAccount,
            ethAddr: this.goerliEthAddr,
            idx: this.goerliAccountIdx
        };
    } else if (accountIdx === this.bscAccountIdx) {
        return {
            ax: this.bscAx,
            ay: this.bscAy,
            account: this.bscAccount,
            ethAddr: this.bscEthAddr,
            idx: this.bscAccountIdx
        };
    } else if (accountIdx === this.bsctestAccountIdx) {
        return {
            ax: this.bsctestAx,
            ay: this.bsctestAy,
            account: this.bsctestAccount,
            ethAddr: this.bsctestEthAddr,
            idx: this.bsctestAccountIdx
        };
    } else if (accountIdx === this.polygonAccountIdx) {
        return {
            ax: this.polygonAx,
            ay: this.polygonAy,
            account: this.polygonAccount,
            ethAddr: this.polygonEthAddr,
            idx: this.polygonAccountIdx
        };
    } else if (accountIdx === this.mumbaiAccountIdx) {
        return {
            ax: this.mumbaiAx,
            ay: this.mumbaiAy,
            account: this.mumbaiAccount,
            ethAddr: this.mumbaiEthAddr,
            idx: this.mumbaiAccountIdx
        };
    }
    return null;
}

let _publicNonce = 0;
module.exports.increasePublicNonce = function() {
    _publicNonce ++;
}

module.exports.getMultiChainAccountState = function(accountIdx, coin) {
    if (accountIdx === this.exitAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.exitAx,
            ay: this.exitAy,
            ethAddress: this.exitEthAddr,
            idx: this.exitAccountIdx
        };
    } else if (accountIdx === this.mainnetAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.mainnetAx,
            ay: this.mainnetAy,
            ethAddress: this.mainnetEthAddr,
            idx: this.mainnetAccountIdx
        };
    } else if (accountIdx === this.ropstenAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.ropstenAx,
            ay: this.ropstenAy,
            ethAddress: this.ropstenEthAddr,
            idx: this.ropstenAccountIdx
        };
    } else if (accountIdx === this.kovanAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.kovanAx,
            ay: this.kovanAy,
            ethAddress: this.kovanEthAddr,
            idx: this.kovanAccountIdx
        };
    } else if (accountIdx === this.rinkebyAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.rinkebyAx,
            ay: this.rinkebyAy,
            ethAddress: this.rinkebyEthAddr,
            idx: this.rinkebyAccountIdx
        };
    } else if (accountIdx === this.goerliAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.goerliAx,
            ay: this.goerliAy,
            ethAddress: this.goerliEthAddr,
            idx: this.goerliAccountIdx
        };
    } else if (accountIdx === this.bscAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.bscAx,
            ay: this.bscAy,
            ethAddress: this.bscEthAddr,
            idx: this.bscAccountIdx
        };
    } else if (accountIdx === this.bsctestAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.bsctestAx,
            ay: this.bsctestAy,
            ethAddress: this.bsctestEthAddr,
            idx: this.bsctestAccountIdx
        };
    } else if (accountIdx === this.polygonAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.polygonAx,
            ay: this.polygonAy,
            ethAddress: this.polygonEthAddr,
            idx: this.polygonAccountIdx
        };
    } else if (accountIdx === this.mumbaiAccountIdx) {
        return {
            nonce: _publicNonce,
            coin: (coin) ? coin : 0,
            ax: this.mumbaiAx,
            ay: this.mumbaiAy,
            ethAddress: this.mumbaiEthAddr,
            idx: this.mumbaiAccountIdx
        };
    }
    return null;
}

module.exports.getMultiChainOpUrl = function(accountIdx) {
    if (accountIdx === this.mainnetAccountIdx) {
        return "http://host.docker.internal:9000";
    } else if (accountIdx === this.ropstenAccountIdx) {
        return "";
    } else if (accountIdx === this.kovanAccountIdx) {
        return "";
    } else if (accountIdx === this.rinkebyAccountIdx) {
        return "";
    } else if (accountIdx === this.goerliAccountIdx) {
        return "";
    } else if (accountIdx === this.bscAccountIdx) {
        return "http://host.docker.internal:9006";
    } else if (accountIdx === this.bsctestAccountIdx) {
        return "";
    } else if (accountIdx === this.polygonAccountIdx) {
        return "";
    } else if (accountIdx === this.mumbaiAccountIdx) {
        return "";
    }
    return null;
}

module.exports.fee = {
    "0%" :      0,
    "0.001%" :  1,
    "0.002%":   2,
    "0.005%":   3,
    "0.01%":    4,
    "0.02%":    5,
    "0.05%":    6,
    "0.1%":     7,
    "0.2%":     8,
    "0.5%":     9,
    "1%":       10,
    "2%":       11,
    "5%":       12,
    "10%":      13,
    "20%":      14,
    "50%" :     15,
};

module.exports.tableAdjustedFee = [ 
    0,
    42949,
    85899,
    214748,
    429496,
    858993,
    2147483,
    4294967,
    8589934,
    21474836,
    42949672,
    85899345,
    214748364,
    429496729,
    858993459,
    2147483648,
];
