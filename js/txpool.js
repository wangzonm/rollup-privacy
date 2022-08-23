const Scalar = require("ffjavascript").Scalar;

const utils = require("./utils");
const Constants = require("./constants");
const fs = require("fs");
const TmpState = require("./tmpstate");
const txIDFile = "txIdFile.dat";

class TXPool {

    /*
        cfg = {
            maxSlots,               // Absolute maximum number of TXs in the pool
            executableSlots,        // Max num of Executable TX in the pool
            nonExecutableSlots      // Max num of Non Executable TX in the pool
            timeout                 // seconds to keep a tx
            feeDeposit              // Fee deposit off-chain in Eth
        }
     */

    constructor(rollupDB, conversion, cfg) {
        this.MASK256 =  Scalar.sub(Scalar.shl(1, 256), 1);
        cfg = cfg || {};
        this.maxSlots = cfg.maxSlots || 64;
        this.executableSlots = cfg.executableSlots || 16;
        this.nonExecutableSlots = cfg.nonExecutableSlots || 16;
        this.timeout = cfg.timeout || 3*3600;

        this.rollupDB = rollupDB;
        this.txs = [];
        this.slotsMap = Array(Math.floor((this.maxSlots-1)/256) + 1).fill(Scalar.e(0));
        this.conversion = conversion || {};
        this.MaxCoins = 15; // We don't use the last slot to avoid problems.

        this._updateSlots = this._genUpdateSlots();
        this.purge = this._genPurge();

        this.feeDeposit = cfg.feeDeposit  || null;
        this.ethPrice = cfg.ethPrice || null;
        this.maxDeposits = cfg.maxDeposits || 18;
    }

    /**
     * Load the pool from the rollupDB
     */
    async _load() {
        let slots = await this.rollupDB.db.get(Constants.DB_TxPoolSlotsMap);
        if (slots) {
            this.slotsMap = slots.map( s => Scalar.e(s) );
        } else {
            this.slotsMap = Array( Math.floor((this.maxSlots-1)/256) +1).fill(Scalar.e(0));
        }
        const slotKeys = [];
        for (let i = 0; i<this.slotsMap.length; i++) {
            if (Scalar.isZero(this.slotsMap[i])) continue;
            for (let j=0; j<256; j++) {
                if (!Scalar.isZero(Scalar.band(this.slotsMap[i], Scalar.shl(1, j)))) {    
                    if (i*256+j < this.maxSlots) {
                        slotKeys.push(Scalar.add(Constants.DB_TxPollTx, i*256+j));
                    }
                }
            }
        }
        const encodedTxs = await this.rollupDB.db.multiGet(slotKeys);
        for (const encodeTx of encodedTxs){
            const tx = this._array2Tx(encodeTx);
            this.txs.push(tx);
        }

        await this.purge();
    }

    /**
     * Set the conversion parameter
     * @param {Object} conversion - Object containing tokens and his value in USD
     */
    setConversion(conversion) {
        this.conversion = conversion || {};
    }

    /**
     * Set the feeDeposit parameter
     * @param {Number} feeDeposit - Actual fee for creating a new leaf in the rollup
     */
    setFeeDeposit(feeDeposit) {
        this.feeDeposit = feeDeposit  || null;
    }

    /**
     * Set the ethPrice parameter
     * @param {Number} ethPrice - Actual ethreum price in USD
     */
    setEthPrice(ethPrice) {
        this.ethPrice = ethPrice || null;
    }

    /**
     * Encode tx Data
     * @param {String} tx - Transaction object
     * @returns {Scalar} Encoded TxData
     */
    _buildTxDataPool(tx){
        // deposit Tx
        tx.toIdx = tx.toIdx ? tx.toIdx : 0;
        let res = Scalar.e(0);

        res = Scalar.add(res, tx.fromIdx);
        res = Scalar.add(res, Scalar.shl(tx.toIdx, 64));
        res = Scalar.add(res, Scalar.shl(utils.fix2float(tx.amount), 128));
        res = Scalar.add(res, Scalar.shl(tx.coin, 144));
        res = Scalar.add(res, Scalar.shl(tx.nonce, 176));
        res = Scalar.add(res, Scalar.shl(utils.fix2float(tx.fee), 224));
        res = Scalar.add(res, Scalar.shl(tx.rqOffset || 0, 228));
        res = Scalar.add(res, Scalar.shl(tx.onChain ? 1 : 0, 231));
        res = Scalar.add(res, Scalar.shl(tx.newAccount ? 1 : 0, 232));

        return res;
    }

    /**
     * Encode a transaction object into an array
     * @param {Object} tx - Transaction object
     * @returns {Array} Resulting array
     */
    _tx2Array(tx) {   
        return [
            this._buildTxDataPool(tx),
            Scalar.e(tx.rqTxData || 0),
            Scalar.add(Scalar.shl(tx.timestamp, 33), Scalar.add(Scalar.shl(tx.slot, 1), tx.isDeposit ? 1 : 0)),
            Scalar.fromString(tx.fromAx, 16),
            Scalar.fromString(tx.fromAy, 16),
            Scalar.fromString(tx.toAx, 16),
            Scalar.fromString(tx.toAy, 16),
            Scalar.fromString(tx.toEthAddr, 16),
        ];
    }

    /**
     * Parse encoded array into a transaction object 
     * @param {Array} arr - Encoded array
     * @returns {Object} Transaction object
     */
    _array2Tx(arr) {
        const tx = {};
        const d0 = Scalar.e(arr[0]);
        tx.fromIdx = Scalar.toNumber(utils.extract(d0, 0, 64));
        tx.toIdx = Scalar.toNumber(utils.extract(d0, 64, 64));
        tx.amount = utils.float2fix(Scalar.toNumber(utils.extract(d0, 128, 16)));
        tx.coin = Scalar.toNumber(utils.extract(d0, 144, 16));
        tx.nonce = Scalar.toNumber(utils.extract(d0, 176, 16));
        tx.fee = utils.float2fix(Scalar.toNumber(utils.extract(d0, 224, 4)));
        tx.rqOffset = Scalar.toNumber(utils.extract(d0, 228, 3));
        tx.onChain = Scalar.toNumber(utils.extract(d0, 231, 1));
        tx.newAccount = Scalar.toNumber(utils.extract(d0, 232, 1));

        tx.rqTxData = Scalar.e(arr[1]);

        const d2 = Scalar.e(arr[2]);
        tx.isDeposit = utils.extract(d2, 0, 1);
        tx.slot = Scalar.toNumber(utils.extract(d2, 1, 32));
        tx.timestamp = Scalar.toNumber((utils.extract(d2, 33, 64)));
        tx.fromAx = Scalar.e(arr[3]).toString(16);
        tx.fromAy = Scalar.e(arr[4]).toString(16);

        tx.toAx = Scalar.e(arr[5]).toString(16);
        tx.toAy = Scalar.e(arr[6]).toString(16);
        tx.toEthAddr = "0x" + utils.padZeros(Scalar.e(arr[7]).toString(16), 40);

        return tx;
    }

    /**
     * Get the on-chain transaction from the off-chain deposit transaction
     * @param {Object} tx - Deposit off-chain transaction
     * @returns {Object} Deposit transaction
     */
    _getOnChainTx(tx){
        return {
            loadAmount: 0,
            coin: tx.coin,
            fromAx: tx.toAx,
            fromAy: tx.toAy,
            fromEthAddr: tx.toEthAddr,
            toAx: Constants.exitAx,
            toAy: Constants.exitAy,
            toEthAddr: Constants.exitEthAddr,
            onChain: true,
        };
    }

    /**
     * Verify that transaction can be processed and add it to the pool.
     * @param {Object} tx - Transaction object
     * @returns {Booleans} True if the transaction can be processed, false otherwise
     */
    async addTx(_tx) {
        let fromIdx = Constants.getMultiChainAccountIdx(_tx.fromAx, _tx.fromAy);
        if (fromIdx == null) {
            fromIdx = await this.rollupDB.getIdx(_tx.coin, _tx.fromAx, _tx.fromAy);
        }
        if (!fromIdx) {
            console.log("Invalid Account Sender");
            return false;
        }
        // 构造tx
        let tx;
        let toIdx = Constants.getMultiChainAccountIdx(_tx.toAx, _tx.toAy);

        if (toIdx === null) {
            toIdx = await this.rollupDB.getIdx(_tx.coin, _tx.toAx, _tx.toAy);
        }
        
        if (toIdx === null) {
            tx = Object.assign({ fromIdx: fromIdx, isDeposit: true}, _tx);
        }
        else{
            tx = Object.assign({ fromIdx: fromIdx }, { toIdx: toIdx }, _tx);
        }

        // Round amounts
        utils.txRoundValues(tx);

        tx.timestamp = (new Date()).getTime();
        const tmpState = new TmpState(this.rollupDB, this.feeDeposit, this.ethPrice, this.conversion);

        const canProcessRes = await tmpState.canProcess(tx);
        if (canProcessRes == "NO") {
            console.log("Invalid TX");
            return false;
        }

        if ((!Constants.isMultiChainAccount(tx.fromIdx)) && (!utils.verifyTxSig(tx))) { 
            console.log("Invalid Signature");
            return false;
        }

        tx.slot = this._allocateFreeSlot();
        if (tx.slot == -1) {
            await this.purge();
            tx.slot = this._allocateFreeSlot();
            if (tx.slot == -1) {
                console.log("TX Pool Full");
                return false;  // If all slots are full, just ignore the TX.
            }
        }
        this.txs.push(tx);
                
        await this.rollupDB.db.multiIns([
            [Scalar.add(Constants.DB_TxPollTx, tx.slot), this._tx2Array(tx)]
        ]);
        const txid = Scalar.add(Constants.DB_TxPollTx, tx.slot).toString();

        console.log("new tx has been added");
        console.log("tx ID:");
        console.log(txid);

        fs.writeFile(txIDFile, txid+"\n", {flag: 'a'}, err =>{
            if(!err){
                console.log("sync to file");
            }else {
                console.log(err);
            }
        });

        await this._updateSlots();
        const encodeBuffer = utils.calEncodeTxData(tx);
        const strTxhash = utils.calHashTx(encodeBuffer);

        let res = {};
        res.isAdded = true;
        res.txHash = strTxhash;
        console.log("new tx hash");
        console.log(strTxhash);
        // return true;
        return res;
    }

    /**
     * Allocate a free slot in the pool 
     * @returns {Number} Index of the slot, -1 if not slots available
     */
    _allocateFreeSlot() {
        let i = 0;
        for (i=0; i<this.slotsMap.length; i++) {
            if (!Scalar.eq(this.slotsMap[i], this.MASK256)) {
                let r = 0;
                let s = this.slotsMap[i];
                while (! Scalar.isZero(Scalar.band(s, 1))) {
                    s = Scalar.shr(s, 1);
                    r ++;
                }
                this.slotsMap[i] = Scalar.add(this.slotsMap[i], Scalar.shl(1, r));
                if ((i*256+r) < this.maxSlots) {
                    return i*256+r;
                } else {
                    return -1;
                }
            }
        }
        return -1;
    }

    /**
     * Check if a slot is full
     * @param {Number} s - Index of the slot
     * @returns {Boolean} Returns true if the slot is full, false if it's emtpy
     */
    _isSlotAllocated(s) {
        return !Scalar.isZero(Scalar.band(this.slotsMap[Math.floor(s/256)], Scalar.shl(1, s%256)));
    }

    /**
     * Empty a slot
     * @param {Number} s - Index of the slot
     */
    _freeSlot(s) {
        if (this._isSlotAllocated(s)) {
            this.slotsMap[Math.floor(s/256)] = Scalar.sub(this.slotsMap[Math.floor(s/256)], Scalar.shl(1, s%256));
        }
    }

    /**
     * Update the rollupDB slots with the pool slots
     */
    _genUpdateSlots()  {
        let pCurrent = null, pNext = null;

        const doUpdateSlots = async () => {
            await this.rollupDB.db.multiIns([
                [Constants.DB_TxPoolSlotsMap, [...this.slotsMap]]
            ]);
            pCurrent = pNext;
            pNext = null;
        };
        return () => {
            if (!pCurrent) {
                pCurrent = doUpdateSlots();
                return pCurrent;
            }
            if (!pNext) {
                pNext = pCurrent.then( doUpdateSlots );
                return pNext;
            }
            return pNext;
        };
    }

    /**
     * Purge removed transactions from the pool
     */
    _genPurge()  {
        let pCurrent = null;
        // eslint-disable-next-line no-unused-vars
        let nPurge = 0;

        const doPurge = async () => {
            // console.log("Start purge ", nPurge);
            await this._classifyTxs();

            for (let i=this.txs.length-1; i>=0; i--) {
                if (this.txs[i].removed) {
                    this._freeSlot(this.txs[i].slot);
                    this.txs.splice(i, 1);
                }
            }

            await this._updateSlots();
            pCurrent = null;
            // console.log("End puge ", nPurge);
            nPurge++;
        };
        return () => {
            if (!pCurrent) {
                pCurrent = doPurge();
            }
            return pCurrent;
        };
    }

    /**
     * Classify transactions, tag the transactions that can't be processed and classify the rest in available or not available
     * Finally remove the transactions that exceed the pool limit
     * @param {Object} tmpStates - Object with states of the leafs that are updated this batch with the on-chain transactions
     */
    async _classifyTxs(tmpStates) {

        this._calculateNormalizedFees();

        const tmpState = new TmpState(this.rollupDB, this.feeDeposit, this.ethPrice, this.conversion, Object.assign({}, tmpStates));
        const now = (new Date()).getTime();
        // Arrange the TX by Index and by Nonce
        const byIdx = {};
        for (let i=0; i<this.txs.length; i++) {
            const tx = this.txs[i];
            if (tx.removed) continue;
            if (tx.timestamp < now - this.timeout*1000) {
                tx.removed = true;
                continue;
            }
            const canBeProcessed = await tmpState.canProcess(tx);
            if (canBeProcessed === "NO") {
                tx.removed = true;
                continue;
            }
            tx.adjustedFee = tx.normalizedFee;
            byIdx[tx.fromIdx] = byIdx[tx.fromIdx] || {};
            byIdx[tx.fromIdx][tx.nonce] = byIdx[tx.fromIdx][tx.nonce] || [];
            byIdx[tx.fromIdx][tx.nonce].push(tx);
        }

        // Split the TXs between indexes and Nonces
        let notAvTxs ={};
        let avTxs = {};
        let nAv=0;
        let nNotAv=0;
        for (let i in byIdx) {
            tmpState.reset();
            let st = await tmpState.getState(i);
            if (st == null) {
                st = Constants.getMultiChainAccountState(Number(i), 0);
            }
            const nonces = Object.keys(byIdx[i]);
            nonces.sort((a,b) => (a-b)) ;
            let curNonce = st.nonce;
            const firstNonce = curNonce;
            let brokenSequence = false;
            for (let n of nonces) {
                if ((curNonce == n)&&(!brokenSequence)) {
                    const possibleTxs = [];
                    for (let t in byIdx[i][n]) {
                        const tx = byIdx[i][n][t];
                        const res = await tmpState.canProcess(tx);
                        if (res == "YES") {
                            possibleTxs.push(tx);
                        } else if (res == "NOT_NOW") {
                            notAvTxs[i] = notAvTxs[i] || [];
                            notAvTxs[i][n] = notAvTxs[i][n] || [];
                            tx.queue = "NAV";
                            nNotAv ++;
                            notAvTxs[i][n].push(tx);
                        } else { 
                            console.log("Unreachable code: tranction should be rejected before");
                            tx.removed = true;
                        }
                    }
                    if (possibleTxs.length>0) {
                        possibleTxs.sort( (a,b) => (a.normalizedFee - b.normalizedFee));
                        avTxs[i] = avTxs[i] || [];  
                        avTxs[i][n]=possibleTxs.pop();
                        avTxs[i][n].queue = "AV";
                        nAv++;
                        // Pick the best ones and remove the others.
                        for (let t in possibleTxs) possibleTxs[t].removed=true;
                        // Remove not available txs with lower fee
                        if ((typeof notAvTxs[i] != "undefined")&&(typeof notAvTxs[i][n] != "undefined")) {
                            for (let t in notAvTxs[i][n]) {
                                if (notAvTxs[i][n][t].normalizedFee <= avTxs[i][n].normalizedFee) {
                                    notAvTxs[i][n][t].removed = true;
                                    nNotAv --;
                                }
                            }
                        }
                        await tmpState.process(avTxs[i][n]);

                        // Readjust the Fees for tx with lower nonce and low fee
                        const af = avTxs[i][n].adjustedFee / (n - firstNonce +1); 
                        for (let n2 = firstNonce; n2<n; n2++) {
                            if (avTxs[i][n2].adjustedFee < af) {
                                avTxs[i][n2].adjustedFee = af;
                                avTxs[i][n2].normalizedFee = 0;
                            }
                        }
                        curNonce ++;
                    } else {
                        brokenSequence = true;
                    }
                } else {
                    // If Broken sequence then all TX are not available.
                    for (let t in byIdx[i][n]) {
                        const tx = byIdx[i][n][t];
                        notAvTxs[i] = notAvTxs[i] || [];
                        notAvTxs[i][n] = notAvTxs[i][n] || [];
                        tx.queue = "NAV";
                        notAvTxs[i][n].push(tx);
                        nNotAv ++;
                    }
                    brokenSequence = true;
                }
            }
        }

        // console.log("Available: "+nAv);
        // console.log("Not Available: "+nNotAv);

        if (nAv>this.executableSlots) {
            for (let idx in avTxs) {
                avTxs[idx] = [].concat(Object.values(avTxs[idx]));
            }
            avTxs = [].concat(...Object.values(avTxs));
            avTxs.sort( (a,b) => {
                if ((b.adjustedFee - a.adjustedFee == 0) && a.fromIdx == b.fromIdx){
                    return a.nonce - b.nonce;
                }
                else{
                    return b.adjustedFee - a.adjustedFee;
                }
            });
            for (let i=0; i<nAv-this.executableSlots; i++) {
                avTxs[avTxs.length -i-1].removed = true;
            }

        }

        if (nNotAv>this.nonExecutableSlots) {
            for (let idx in notAvTxs) {
                notAvTxs[idx] = [].concat(...Object.values(notAvTxs[idx]));
                notAvTxs[idx].sort( (a,b) => (b.adjustedFee - a.adjustedFee));
                for (let i=0; i<notAvTxs[idx].length; i++) notAvTxs[idx][i].pos = i;
            }
            notAvTxs = [].concat(...Object.values(notAvTxs));
            notAvTxs.sort( (a,b) => {
                if (a.pos > b.pos) return 1;
                if (a.pos < b.pos) return -1;
                return b.adjustedFee - a.adjustedFee;
            });
            for (let i=0; i<nNotAv-this.nonExecutableSlots; i++) {
                notAvTxs[notAvTxs.length -i-1].removed = true;
            }
        }

    }

    /**
     * Normalize the fees of the transactions, calculating all the fees in USD to estimate the operator profit/tx
     */
    _calculateNormalizedFees() {
        for (let i=0; i<this.txs.length; i++) {
            const tx = this.txs[i];
            const convRate = this.conversion[tx.coin];

            if (convRate) {

                const feeTx =  utils.computeFee(tx.amount, tx.fee);
                const num = Scalar.mul(feeTx, Math.floor(convRate.price * 2**64));
                const den = Scalar.pow(10, convRate.decimals);

                tx.normalizedFee = Number(Scalar.div(num, den)) / 2**64;

                // 2 transactions are added when forged offchain deposit, and also some fee is burned.
                if (tx.isDeposit){
                    tx.normalizedFee =  (tx.normalizedFee - this.feeDeposit * this.ethPrice) / 2;
                }
                
            } else {
                tx.normalizedFee = 0;
            }
        }
    }

    /* Example of conversion
    {
        0: {   // Coin 1
            token: "ETH"
            price: 210.21
            decimals: 18
        },
        1: {
            token: "DAI"
            price: 1
            decimals: 18
        }

    }
    */

    /**
     * Fill the batchbuilder with the most profitable transactions of the pool.
     * @param {Object} bb - Batchbuilder object
     * @param {Object} tmpStates - Object with states of the leafs that are updated this batch with the on-chain transactions
     */
    async fillBatch(bb, tmpStates) {
        const futureTxs = {};
        const txsByCoin = {};

        let NSlots = bb.maxNTx - bb.onChainTxs.length;

        // Order tx
        await this._classifyTxs(tmpStates); 

        const availableTxs = [];
        for (let i=0; i<this.txs.length; i++) {
            if (!this.txs[i].removed) {
                availableTxs.push(this.txs[i]);
            }
        }

        const fnSort = (a,b) => {
            if ((b.adjustedFee - a.adjustedFee == 0) && a.fromIdx == b.fromIdx){
                return b.nonce - a.nonce;
            }
            else{
                return a.adjustedFee - b.adjustedFee;
            } 
        };

        // Sort the TXs reverse normalized Fee (First is the most profitable)
        availableTxs.sort(fnSort);

        const tmpState = new TmpState(this.rollupDB, this.feeDeposit, this.ethPrice, this.conversion, Object.assign({}, tmpStates)); 
        let currentDeposits = 0;
        console.log("---------- fillBatch -------, available tx pool length is: " + availableTxs.length);
        while (availableTxs.length>0) {
            const tx = availableTxs.pop();
            const res = await tmpState.canProcess(tx);

            if (res == "YES") {

                if (tx.isDeposit) {
                    if (currentDeposits >= this.maxDeposits) {
                        console.log("MAX deposit offchain Reach");
                        continue;
                    } else {
                        currentDeposits++;
                    }
                }
                await tmpState.process(tx);
                if (!txsByCoin[tx.coin]) txsByCoin[tx.coin] = [];
                txsByCoin[tx.coin].push(tx);

                // Once the transaction is processed, other "NOT NOW" Tx could be available now, due the nonce or the amount changes.
                const ftxFrom = popFuture(tx.fromIdx, tx.nonce+1);
                let sort = false;
                if ((ftxFrom.length>0)) {
                    availableTxs.push(...ftxFrom);
                    sort = true;
                }
                if (tx.toIdx && (!Constants.isMultiChainAccount(tx.toIdx))) { 
                    const stTo = await tmpState.getState(tx.toIdx);
                    const ftxTo = popFuture(tx.toIdx, stTo.nonce);
                    if ((ftxTo.length>0)) {
                        availableTxs.push(...ftxTo);
                        sort = true;
                    }
                }
                if (sort) {
                    availableTxs.sort(fnSort);
                }

            } else if (res == "NOT_NOW") {
                pushFuture(tx);
            } else {
                tx.removed = true;
            }
        }

        // For every coin, make transactions groups, in order to mine together atomic transactions for example
        const incTable = {};
        for (let coin in txsByCoin) {
            incTable[coin] = [];

            // Accumulated values
            let accValue = 0;
            let nTx = 0;

            // Best values
            let bestAccValue = 0;
            let bestNTx = 0;
            let depositCount = 0;

            for (let i=0; i<txsByCoin[coin].length; i++) {
                const tx = txsByCoin[coin][i];
                nTx++;
                accValue += tx.normalizedFee;

                if (tx.isDeposit) {
                    depositCount++;
                }
                if (accValue > bestAccValue) {
                    incTable[coin].push({
                        nTx: nTx,
                        incTx: nTx - bestNTx + depositCount,
                        accValue: accValue,
                        marginalFeeValue: (accValue) / (nTx - bestNTx + depositCount),
                    });
                    bestAccValue = accValue;
                    bestNTx = nTx; 
                    accValue = 0;
                    depositCount = 0;
                }
                else if (accValue == bestAccValue && bestAccValue != 0) {
                    incTable[coin].push({
                        nTx: nTx,
                        incTx: nTx - bestNTx + depositCount,
                        accValue: accValue,
                        marginalFeeValue: (accValue) / (nTx - bestNTx + depositCount),
                    });
                    bestNTx = nTx; 
                    accValue = 0;
                    depositCount = 0;
                }
                else if (i + 1 == txsByCoin[coin].length) { // Put the rest of the transactions
                    incTable[coin].push({
                        nTx: nTx,
                        incTx: nTx - bestNTx + depositCount,
                        accValue: accValue,
                        marginalFeeValue: (accValue) / (nTx - bestNTx + depositCount),
                    });
                }
            }
        }
        let forgedTxs = [];
        const PTable = {};

        fillTx(forgedTxs, NSlots, incTable, PTable, this._getOnChainTx);

        // Max coin should be 24 - 32 bits, max safe integer in js is 2^53, 
        const usedCoins = Object.keys(PTable).map(coinStr => Number(coinStr));

        usedCoins.sort((a,b) => {
            return incTable[b][ PTable[b] ].accValue -
                   incTable[a][ PTable[a] ].accValue;
        });
        const removedCoins = [];
        while (usedCoins.length>this.MaxCoins) {
            const coin = usedCoins.pop();
            removedCoins.push(coin);
            delete incTable[coin];
        }

        removeTxsOfCoins(forgedTxs, removedCoins);

        fillTx(forgedTxs, NSlots-forgedTxs.length, incTable, PTable, this._getOnChainTx);

        for (let c of usedCoins) {
            bb.addCoin(c);
        }

        for (let i=0; i<forgedTxs.length; i++) {
            bb.addTx(Object.assign({}, forgedTxs[i])); // Clone forged Tx, cause batchbuilder could modify them
            if (forgedTxs[i].onChain){
                bb.addDepositOffChain(forgedTxs[i]);
            }
        }

        await bb.build();

        /**
         * Fill the forgedTxs with the most profitable transactions of the pool.
         * @param {Array} forgedTxs - Array that will be filled with the most profitable transactions
         * @param {Object} n - Number of transactions that fit in the batch
         * @param {Object} incTable - Object that contains arrays, indexed by coins, of groups of transactions sorted by fee.
         * @param {Object} PTable - Pointers indexed by coins, to the last group of the incTable that was added to the forgedTxs
         * @param {Function} getOnChainTx Function that returns the on-chain transaction for the deposit off-chain
         */
        function fillTx(forgedTxs, n, incTable, PTable, getOnChainTx) {

            let totalTx =0;
            let end = false;
            while (!end) {
                let bestCoin = -1;
                let bestMarginalFeeValue = 0;
                for (let coin in incTable) {
                    const p = (typeof PTable[coin] == "undefined") ? 0 : PTable[coin]+1;
                    if (p >= incTable[coin].length) continue;  // End of the table
                    if ((incTable[coin][p].marginalFeeValue > bestMarginalFeeValue)&&
                        (incTable[coin][p].incTx + totalTx <=  n))
                    {
                        bestCoin = coin;
                        bestMarginalFeeValue = incTable[coin][p].marginalFeeValue;
                    }
                }
                if (bestCoin >= 0) {
                    const firstT = (typeof PTable[bestCoin] == "undefined") ? 0 : incTable[bestCoin][PTable[bestCoin]].nTx;
                    PTable[bestCoin] = (typeof PTable[bestCoin] == "undefined") ? 0 : PTable[bestCoin]+1;
                    const lastT = incTable[bestCoin][PTable[bestCoin]].nTx;
                    totalTx += incTable[bestCoin][PTable[bestCoin]].incTx;
                    for (let i=firstT; i<lastT; i++) {
                        forgedTxs.push(txsByCoin[bestCoin][i]);
                        if (txsByCoin[bestCoin][i].isDeposit){
                            forgedTxs.push(getOnChainTx(txsByCoin[bestCoin][i])); 
                        }
                    }
                } else {
                    end = true;
                }
            }
            return totalTx;
        }

        /**
         * Remove all the transactions of the array txs wich contains certain coins
         * @param {Array} txs - Array of transactions objects
         * @param {Array} coins - Array of coins identifiers
         */
        function removeTxsOfCoins(txs, coins) {
            for (let i=txs.length-1; i>=0; i--) {
                if (coins.indexOf(txs[i].coin) >= 0) {
                    txs.splice(i, 1);
                }
            }
        }

        /**
         * Add the transaction to the futureTxs table
         * @param {Object} tx - Transactions object
         */
        function pushFuture(tx) {
            futureTxs[tx.fromIdx] = futureTxs[tx.fromIdx] || [];
            futureTxs[tx.fromIdx][tx.nonce] = futureTxs[tx.fromIdx][tx.nonce] || [];
            futureTxs[tx.fromIdx][tx.nonce].push(tx);
        }

        /**
         * Pop the next transactions with certain idx and nonce
         * @param {Scalar} idx - Identifier of the merkle tree leaf
         * @param {Scalar} nonce - Nonce of the leaf
         * @returns {Object} Transaction object
         */
        function popFuture(idx, nonce) {
            if (typeof futureTxs[idx] == "undefined") return [];
            if (typeof futureTxs[idx][nonce] == "undefined") return [];
            const res = futureTxs[idx][nonce];
            delete futureTxs[idx][nonce];
            return res;
        }
    }

    /**
     * Returns the most profitable transactions of the pool.
     * @param {Object} maxSlots - Number of transactions that will be returned
     * @param {Object} tmpStates - Object with states of the leafs that are updated this batch with the on-chain transactions
     * @return {Array} Array of most profitable transactions
     */
    async getForgedTx(maxSlots, tmpStates) {
        const futureTxs = {};
        const txsByCoin = {};
    
        let NSlots = maxSlots;
    
        // Order tx
        await this._classifyTxs(); 
    
        const availableTxs = [];
        for (let i=0; i<this.txs.length; i++) {
            if (!this.txs[i].removed) {
                availableTxs.push(this.txs[i]);
            }
        }
    
        const fnSort = (a,b) => {
            if ((b.adjustedFee - a.adjustedFee == 0) && a.fromIdx == b.fromIdx){
                return b.nonce - a.nonce;
            }
            else{
                return a.adjustedFee - b.adjustedFee;
            } 
        };
    
        // Sort the TXs reverse normalized Fee (First is the most profitable)
        availableTxs.sort(fnSort);
    
        const tmpState = new TmpState(this.rollupDB, this.feeDeposit, this.ethPrice, this.conversion, Object.assign({}, tmpStates));
        while (availableTxs.length>0) {
            const tx = availableTxs.pop();
            const res = await tmpState.canProcess(tx);
    
            if (res == "YES") {
    
                await tmpState.process(tx);
                if (!txsByCoin[tx.coin]) txsByCoin[tx.coin] = [];
                txsByCoin[tx.coin].push(tx);

                // Once the transaction is processed, other "NOT NOW" Tx could be available now, due the nonce or the amount changes.
                const ftxFrom = popFuture(tx.fromIdx, tx.nonce+1);
                let sort = false;
                if ((ftxFrom.length>0)) {
                    availableTxs.push(...ftxFrom);
                    sort = true;
                }
                if (tx.toIdx) { 
                    const stTo = await tmpState.getState(tx.toIdx);
                    const ftxTo = popFuture(tx.toIdx, stTo.nonce);
                    if ((ftxTo.length>0)) {
                        availableTxs.push(...ftxTo);
                        sort = true;
                    }
                }
                if (sort) {
                    availableTxs.sort(fnSort);
                }
            } else if (res == "NOT_NOW") {
                pushFuture(tx);
            } else {
                tx.removed = true;
            }
        }

        // For every coin, make transactions groups, in order to mine together atomic transactions for example
        const incTable = {};
        for (let coin in txsByCoin) {
            incTable[coin] = [];
    
            // Accumulated values
            let accValue = 0;
            let nTx = 0;
    
            // Best values
            let bestAccValue = 0;
            let bestNTx = 0;
            let depositCount = 0;
    
            for (let i=0; i<txsByCoin[coin].length; i++) {
                const tx = txsByCoin[coin][i];
                nTx++;
                accValue += tx.normalizedFee;
    
                if (tx.isDeposit) {
                    depositCount++;
                }
                if (accValue > bestAccValue) {
                    incTable[coin].push({
                        nTx: nTx,
                        incTx: nTx - bestNTx + depositCount,
                        accValue: accValue,
                        marginalFeeValue: (accValue) / (nTx - bestNTx + depositCount),
                    });
                    bestAccValue = accValue;
                    bestNTx = nTx; 
                    accValue = 0;
                    depositCount = 0;
                }
                else if (accValue == bestAccValue && bestAccValue != 0) {
                    incTable[coin].push({
                        nTx: nTx,
                        incTx: nTx - bestNTx + depositCount,
                        accValue: accValue,
                        marginalFeeValue: (accValue) / (nTx - bestNTx + depositCount),
                    });
                    bestNTx = nTx; 
                    accValue = 0;
                    depositCount = 0;
                }
                else if (i + 1 == txsByCoin[coin].length) { // Put the rest of the transactions
                    incTable[coin].push({
                        nTx: nTx,
                        incTx: nTx - bestNTx + depositCount,
                        accValue: accValue,
                        marginalFeeValue: (accValue) / (nTx - bestNTx + depositCount),
                    });
                }
            }
        }
        let forgedTxs = [];
        const PTable = {};
    
        fillTx(forgedTxs, NSlots, incTable, PTable, this._getOnChainTx);
    
        // Max coin should be 24 - 32 bits, max safe integer in js is 2^53, 
        const usedCoins = Object.keys(PTable).map(coinStr => Number(coinStr));
    
        usedCoins.sort((a,b) => {
            return incTable[b][ PTable[b] ].accValue -
                       incTable[a][ PTable[a] ].accValue;
        });
        const removedCoins = [];
        while (usedCoins.length>this.MaxCoins) {
            const coin = usedCoins.pop();
            removedCoins.push(coin);
            delete incTable[coin];
        }
    
        removeTxsOfCoins(forgedTxs, removedCoins);
    
        fillTx(forgedTxs, NSlots-forgedTxs.length, incTable, PTable, this._getOnChainTx);
    
        return forgedTxs;
    
        /**
         * Fill the forgedTxs with the most profitable transactions of the pool.
         * @param {Array} forgedTxs - Array that will be filled with the most profitable transactions
         * @param {Object} n - Number of transactions that fit in the batch
         * @param {Object} incTable - Object that contains arrays, indexed by coins, of groups of transactions sorted by fee.
         * @param {Object} PTable - Pointers indexed by coins, to the last group of the incTable that was added to the forgedTxs
         * @param {Function} getOnChainTx - Function that returns the on-chain transaction for the deposit off-chain
         */
        function fillTx(forgedTxs, n, incTable, PTable, getOnChainTx) {
    
            let totalTx =0;
            let end = false;
            while (!end) {
                let bestCoin = -1;
                let bestMarginalFeeValue = 0;
                for (let coin in incTable) {
                    const p = (typeof PTable[coin] == "undefined") ? 0 : PTable[coin]+1;
                    if (p >= incTable[coin].length) continue;  // End of the table
                    if ((incTable[coin][p].marginalFeeValue > bestMarginalFeeValue)&&
                            (incTable[coin][p].incTx + totalTx <=  n))
                    {
                        bestCoin = coin;
                        bestMarginalFeeValue = incTable[coin][p].marginalFeeValue;
                    }
                }
                if (bestCoin >= 0) {
                    const firstT = (typeof PTable[bestCoin] == "undefined") ? 0 : incTable[bestCoin][PTable[bestCoin]].nTx;
                    PTable[bestCoin] = (typeof PTable[bestCoin] == "undefined") ? 0 : PTable[bestCoin]+1;
                    const lastT = incTable[bestCoin][PTable[bestCoin]].nTx;
                    totalTx += incTable[bestCoin][PTable[bestCoin]].incTx;
                    for (let i=firstT; i<lastT; i++) {
                        forgedTxs.push(txsByCoin[bestCoin][i]);
                        if (txsByCoin[bestCoin][i].isDeposit){
                            forgedTxs.push(getOnChainTx(txsByCoin[bestCoin][i])); 
                        }
                    }
                } else {
                    end = true;
                }
            }
            return totalTx;
        }

        /**
         * Remove all the transactions of the array txs wich contains certain coins
         * @param {Array} txs - Array of transactions objects
         * @param {Array} coins - Array of coins identifiers
         */
        function removeTxsOfCoins(txs, coins) {
            for (let i=txs.length-1; i>=0; i--) {
                if (coins.indexOf(txs[i].coin) >= 0) {
                    txs.splice(i, 1);
                }
            }
        }

        /**
         * Add the transaction to the futureTxs table
         * @param {Object} tx - Transactions object
         */
        function pushFuture(tx) {
            futureTxs[tx.fromIdx] = futureTxs[tx.fromIdx] || [];
            futureTxs[tx.fromIdx][tx.nonce] = futureTxs[tx.fromIdx][tx.nonce] || [];
            futureTxs[tx.fromIdx][tx.nonce].push(tx);
        }
    
        /**
         * Pop the next transactions with certain idx and nonce
         * @param {Scalar} idx - Identifier of the merkle tree leaf
         * @param {Scalar} nonce - Nonce of the leaf
         * @returns {Object} Transaction object
         */
        function popFuture(idx, nonce) {
            if (typeof futureTxs[idx] == "undefined") return [];
            if (typeof futureTxs[idx][nonce] == "undefined") return [];
            const res = futureTxs[idx][nonce];
            delete futureTxs[idx][nonce];
            return res;
        }

    }
}


module.exports = async function InstantiateTxPool(rollupDB, conversion, cfg) {
    const txPool = new TXPool(rollupDB, conversion, cfg);
    await txPool._load();
    return txPool;
};
