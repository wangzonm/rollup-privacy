const Scalar = require("ffjavascript").Scalar;

const utils = require("./utils");
const Constants = require("./constants");

class TmpState {

    constructor(rollupDB, feeDeposit, ethPrice, conversion, tmpStates) {
        this.rollupDB = rollupDB;
        this.tmpStates = tmpStates || {};
        this.feeDeposit = feeDeposit;
        this.ethPrice = ethPrice;
        this.conversion = conversion;
    }

    /**
     * Get the state object from the Id OF the merkle tree
     * @param {Scalar} idx - Leaf identifier
     * @returns {Object} - State Object
     */
    async getState(idx) {
        if (typeof(this.tmpStates[idx]) == "undefined" ) {
            this.tmpStates[idx] = await this.rollupDB.getStateByIdx(idx);
        }
        return this.tmpStates[idx];
    }

    /**
     * Check if the transaction can be processed in the actual state
     * @param {Object} tx - Transaction object
     * @returns {String} - Return "NO", "NOT NOW" or "YES"
     */
    async canProcess(tx) {
        if (Constants.isMultiChainAccount(tx.fromIdx)) {
            const fromState = Constants.getMultiChainAccountState(tx.fromIdx, tx.coin);
            if (tx.nonce < fromState.nonce){
                return "NO";
            } else {
                return "YES";
            }
        }

        const stFrom = await this.getState(tx.fromIdx);
        if (!stFrom || stFrom.ax != tx.fromAx || stFrom.ay != tx.fromAy) return "NO";

        // Check nonce
        if (tx.nonce < stFrom.nonce) return "NO";

        // Check there is enough funds
        const amount = utils.float2fix(utils.fix2float(tx.amount));
        const fee = utils.computeFee(tx.amount, tx.fee);

        // Check onChain flag
        if (tx.onChain) return "NO";

        if (!tx.isDeposit) {
            let stTo;
            if (tx.toIdx && (!Constants.isMultiChainAccount(tx.toIdx))) {
                stTo = await this.getState(tx.toIdx);
                if (!stTo) return "NO";
                // Check coins match
                if (stTo.coin != stFrom.coin || stFrom.coin != tx.coin) return "NO";
            }
        } else {
            if (tx.toIdx) {
                return "NO";
            }
            if (!this._checkFeeDeposit(tx)){
                console.log("Deposit off-chain discarded due to low fee");
                return "NO";
            }
            // check leaf don't exist yet
            const hashIdx = utils.hashIdx(tx.coin, tx.toAx, tx.toAy);
            if (typeof(this.tmpStates[hashIdx]) != "undefined") {
                return "NO";
            }
        }

        // NOT_NOW"
        if (tx.nonce > stFrom.nonce) return "NOT_NOW";
        if (!Scalar.geq(stFrom.amount, Scalar.add(fee, amount))) return "NOT_NOW";

        return "YES";
    }

    /**
     * Process the transaction in the TmpState
     * @param {Object} tx - Transaction object
     * @returns {Boolean} Return true if the transaction is correctly processed, false otherwise
     */
    async process(tx) { 
        // Check onChain flag
        if (tx.onChain){
            return false;
        }

        const amount = utils.float2fix(utils.fix2float(tx.amount));
        const fee = utils.computeFee(tx.amount, tx.fee);
        let stFrom;

        if (Constants.isMultiChainAccount(tx.fromIdx)) {
            stFrom = {
                coin: tx.coin
            }
        } else {
            stFrom = await this.getState(tx.fromIdx);
            if (!stFrom || stFrom.ax != tx.fromAx || stFrom.ay != tx.fromAy) return false;

            // Check nonce
            if (tx.nonce != stFrom.nonce){
                return false;
            }

            // Check there is enough funds
            if (!Scalar.geq(stFrom.amount, Scalar.add(fee, amount))){
                return false;
            }

            stFrom.nonce++;
            stFrom.amount = Scalar.sub(stFrom.amount, amount);
            stFrom.amount = Scalar.sub(stFrom.amount, fee);
        }
        

        if (!tx.isDeposit) {
            let stTo;
            if (tx.toIdx && (!Constants.isMultiChainAccount(tx.toIdx))) {
                stTo = await this.getState(tx.toIdx);
                if (!stTo){
                    return false;
                }
                // Check coins match
                if (stTo.coin != stFrom.coin || stFrom.coin != tx.coin){
                    return false;
                }
                stTo.amount = Scalar.add(stTo.amount, amount);
            }
        } else {
            if (tx.toIdx) {
                return false;
            }
            if (!this._checkFeeDeposit(tx)){
                return false;
            }
            // Check leaf don't exist yet
            const hashIdx = utils.hashIdx(tx.coin, tx.toAx, tx.toAy);
            if (typeof(this.tmpStates[hashIdx]) == "undefined") {
                this.tmpStates[hashIdx] = { 
                    ax: tx.toAx,
                    ay: tx.toAy,
                    coin: tx.coin,
                    nonce: 0,
                    amount: tx.amount,
                };
            } else {
                return false;
            }
        }

        return true;
    }

    /**
     * Reset all the tmpStates
     */
    reset() {
        this.tmpStates = {};
    }

    /**
     * Add states to the object tmpStates
     * @param {Object} state - Object containing states
     */
    addStates(states) {
        for (let idx of Object.keys(states))
            this.tmpStates[idx] = states[idx];
    }

    /**
     * Check if the fee of the transaction is enough to cover the deposit off-chain fee
     * @param {Object} tx - Transaction object
     * @returns {Boolean} Return true if the fee is enough, false otherwise
     */
    _checkFeeDeposit(tx){
        if (this.feeDeposit === null || this.ethPrice === null) 
            return false;

        const feeTx =  utils.computeFee(tx.amount, tx.fee);
        const convRate = this.conversion[tx.coin];
        
        if (convRate) {
            const num = Scalar.mul(feeTx, Math.floor(convRate.price * 2**64));
            const den = Scalar.pow(10, convRate.decimals);

            const normalizeFeeTx = Number(Scalar.div(num, den)) / 2**64;

            if (normalizeFeeTx > (this.feeDeposit * this.ethPrice)){
                return true; 
            }
        }
        return false;
    }

}

module.exports = TmpState;
