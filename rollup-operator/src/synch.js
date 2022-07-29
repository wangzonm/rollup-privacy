const Web3 = require("web3");
const abiDecoder = require("abi-decoder");
const winston = require("winston");
const chalk = require("chalk");
const { stringifyBigInts, unstringifyBigInts } = require("ffjavascript").utils;
const Scalar = require("ffjavascript").Scalar;

const { decodeTxData, extract, decodeDepositOffChain,
    decodeDataAvailability } = require("../../js/utils");
const { timeout, purgeArray, padding256 } = require("./utils");
const Constants = require("./constants");
const GlobalConst = require("../../js/constants");

const MultiChainTxSend = require("./multichainTxSend");
const NodeRSA = require("node-rsa");

const finalIdxInput = 0;
const offChainHashInput = 4;
const feePlanCoinsInput = 7;
const feeTotals = 8;

// db keys
const batchStateKey = "batch-state";

const lastBlockKey = "last-block-synch";
const lastBatchKey = "last-state-batch";
const exitInfoKey = "exit";
const eventOnChainKey = "onChain";
const eventForgeBatchKey = "forgeBatch";
const separator = "--";
const lastPurgedEventKey = "last-purged-event";

// cache keys
const lastPurgedKey = "last-purged";
const confirmationBlocks = 24;

/**
* Synchronize Rollup core smart contract 
*/
class Synchronizer {
    /**
     * Initialize Synchronizer parameters
     * @param {Object} db - Synchronizer database
     * @param {Object} treeDb - Rollup database
     * @param {String} nodeUrl - Ethereum node url
     * @param {String} rollupAddress - Rollup core address
     * @param {Object} rollupABI - Rollup core ABI interface
     * @param {String} rollupPoSAddress - Rollup PoS address
     * @param {Object} rollupPoSABI - Rollup PoS ABI interface
     * @param {String} rollupCreationHash - Rollup core creation hash 
     * @param {String} ethAddress - Address to make pure/view calls
     * @param {String} logLevel - Logger level
     * @param {Number} mode - Synchronize performance mode
     * @param {Object} timeouts - Configure timeouts
     */
    constructor(
        db,
        treeDb,
        nodeUrl,
        rollupAddress,
        rollupABI,
        rollupPoSAddress,
        rollupPoSABI,
        rollupCreationHash,
        ethAddress,
        logLevel,
        mode,
        timeouts,
    ) {
        this.info = "";
        this.db = db;
        this.nodeUrl = nodeUrl;
        this.rollupAddress = rollupAddress;
        this.rollupPoSAddress = rollupPoSAddress;
        this.creationHash = rollupCreationHash;
        this.treeDb = treeDb;
        this.ethAddress = ethAddress;
        this.web3 = new Web3(new Web3.providers.HttpProvider(this.nodeUrl));
        this.rollupContract = new this.web3.eth.Contract(rollupABI, this.rollupAddress);
        abiDecoder.addABI(rollupABI);
        this.rollupPoSContract = new this.web3.eth.Contract(rollupPoSABI, this.rollupPoSAddress);
        abiDecoder.addABI(rollupPoSABI);
        this.forgeEventsCache = new Map();
        this.retrySameBatch = 0;
        this.cacheBatchToUpdate = 0;
        this.mode = mode;

        this._initTimeouts(timeouts);
        this._initLogger(logLevel);
    }

    /**
     * Initilaize all timeouts
     * @param {Object} timeouts 
     */
    _initTimeouts(timeouts){
        const errorDefault = 5000;
        const nextLoopDefault = 5000;
        const loggerDefault = 5000;

        let timeoutError = errorDefault;
        let timeoutNextLoop = nextLoopDefault;
        let timeoutLogger = loggerDefault;

        if (timeouts !== undefined) {
            timeoutError = timeouts.ERROR || errorDefault;
            timeoutNextLoop = timeouts.NEXT_LOOP || nextLoopDefault;
            timeoutLogger = timeouts.LOGGER || loggerDefault;
        }

        this.timeouts = {
            ERROR: timeoutError,
            NEXT_LOOP: timeoutNextLoop,
            LOGGER: timeoutLogger,
        };
    }

    /**
     * Initilaize logger
     * @param {String} logLevel 
     */
    _initLogger(logLevel) {
        // config winston
        var options = {
            console: {
                level: logLevel,
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple(),
                )
            },
        };

        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console(options.console)
            ]
        });
    }

    /**
     * Convert to string
     * normally used in order to add it to database
     * @param {Any} - any input parameter
     * @returns {String}
     */
    _toString(val) {
        return JSON.stringify(stringifyBigInts(val));
    }

    /**
     * Get from string
     * normally used ti get from database
     * @param {String} - string to parse
     * @returns {Any} 
     */
    _fromString(val) {
        return unstringifyBigInts(JSON.parse(val));
    }

    /**
     * Get public contract variables
     * Start logger
     */
    async _init(){
        // Initialize class variables
        this.creationBlock = 0;
        this.totalSynch = 0;
        this.forgeEventsCache.set(lastPurgedKey, await this.getLastBatch());
        this.blocksPerSlot = Number(await this.rollupPoSContract.methods.BLOCKS_PER_SLOT()
            .call({from: this.ethAddress}));
        this.maxTx = Number(await this.rollupPoSContract.methods.MAX_TX()
            .call({from: this.ethAddress}));
        this.maxOnChainTx = Number(await this.rollupContract.methods.MAX_ONCHAIN_TX()
            .call({from: this.ethAddress}));
        this.nLevels = Number(await this.rollupContract.methods.NLevels()
            .call({from: this.ethAddress}));
        this.feeOnChainTx = Scalar.e(await this.rollupContract.methods.feeOnchainTx()
            .call({from: this.ethAddress}));
      
        if (this.creationHash) {
            const creationTx = await this.web3.eth.getTransaction(this.creationHash);
            this.creationBlock = creationTx.blockNumber;
        }

        // Init info message
        this.info = `${chalk.blue("STATE SYNCH".padEnd(12))} | `;
        this.info += "Initializing data";

        // Start logger
        this.logInterval = setInterval(() => {
            this.logger.info(this.info);
        }, this.timeouts.LOGGER );
    }

    /**
     * Main loop
     * Synchronize Rollup core contract
     * Maintain Rollup database
     */
    async synchLoop() {
        await this._init();

        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                // get last block synched, current block, last batch synched
                let totalSynch = 0;
                let lastBatchSaved = await this.getLastBatch();
                const currentBlock = await this.web3.eth.getBlockNumber();
                const currentBatchDepth = await this.rollupContract.methods.getStateDepth()
                    .call({from: this.ethAddress}, currentBlock);

                // get last state saved
                const stateSaved = await this.getStateFromBatch(lastBatchSaved);

                // check last batch number matches. Last state saved should match state in contract
                const stateDepth = parseInt(await this.rollupContract.methods.getStateDepth()
                    .call({from: this.ethAddress}, stateSaved.blockNumber));

                if (lastBatchSaved > 0 && stateDepth !== lastBatchSaved){
                    // clear database
                    await this._clearRollback(lastBatchSaved);
                    this._infoRollback(lastBatchSaved - 1, "Contract State depth does not match last state depth saved");
                    await this._rollback(lastBatchSaved);
                    continue;
                }
                    
                // Check root matches with the one saved
                const stateRoot = Scalar.e(await this.rollupContract.methods.getStateRoot(stateDepth)
                    .call({ from: this.ethAddress }, stateSaved.blockNumber));
                    
                const stateRootHex = `0x${Scalar.e(stateRoot).toString(16)}`;

                if (lastBatchSaved > 0 && (stateRootHex !== stateSaved.root)) {
                    // clear database
                    await this._clearRollback(lastBatchSaved);
                    this._infoRollback(lastBatchSaved - 1, "Contract root does not match last root saved");
                    await this._rollback(lastBatchSaved);
                    continue;
                }

                // Check current mining onChain hash
                const stateMiningOnChainHash = Scalar.e(await this.rollupContract.methods.miningOnChainTxsHash()
                    .call({ from: this.ethAddress }, stateSaved.blockNumber));

                const stateMiningOnChainHashHex = `0x${Scalar.e(stateMiningOnChainHash).toString(16)}`;
                if (lastBatchSaved > 0 && (stateMiningOnChainHashHex !== stateSaved.miningOnChainHash)) {
                    // clear database
                    await this._clearRollback(lastBatchSaved);
                    this._infoRollback(lastBatchSaved - 1, "Contract miningOnChainHash does not match with the saved one");
                    await this._rollback(lastBatchSaved);
                    continue;
                }

                // update deposit fee
                this.feeDepOffChain = Scalar.e(await this.rollupContract.methods.depositFee()
                    .call({from: this.ethAddress}));

                // update on-chain fee
                this.feeOnChainTx = Scalar.e(await this.rollupContract.methods.feeOnchainTx()
                    .call({from: this.ethAddress}));
                  
                if (currentBatchDepth > lastBatchSaved) {
                    const targetBlockNumber = await this._getTargetBlock(lastBatchSaved + 1, stateSaved.blockNumber, currentBlock);
                    // If no event is found, tree is not updated
                    if (!targetBlockNumber) continue;
                    // get all logs from last batch
                    const logsForge = await this.rollupContract.getPastEvents("ForgeBatch", {
                        fromBlock: stateSaved.blockNumber + 1,
                        toBlock: targetBlockNumber,
                    });
                    const logsOnChain = await this.rollupContract.getPastEvents("OnChainTx", {
                        fromBlock: stateSaved.blockNumber,
                        toBlock: targetBlockNumber,
                    });
                    // update events
                    const updateFlag = await this._updateEvents([...logsForge,...logsOnChain], lastBatchSaved + 1, targetBlockNumber);
                    if (!updateFlag) continue;
                    lastBatchSaved = await this.getLastBatch();
                    this.cacheBatchToUpdate = lastBatchSaved;
                    this.retrySameBatch = 0;
                }

                totalSynch = (currentBatchDepth == 0) ? 100 : ((lastBatchSaved / currentBatchDepth) * 100);
                this.totalSynch = totalSynch.toFixed(2);

                this._fillInfo(currentBlock, stateSaved.blockNumber, currentBatchDepth, lastBatchSaved);

                if (lastBatchSaved >= currentBatchDepth) await timeout(this.timeouts.NEXT_LOOP);
            } catch (e) {
                this.logger.error(`SYNCH Message error: ${e.message}`);
                this.logger.debug(`SYNCH Message error: ${e.stack}`);
                await timeout(this.timeouts.ERROR);
            }
        }
    }

    /**
     * Sends message directly to logger
     * specifically for rollback functionality
     * @param {Number} numBatch 
     * @param {String} message 
     */
    _infoRollback(numBatch, message){
        let info = `${chalk.blue("STATE SYNCH".padEnd(12))} | `;
        info += `${chalk.bgYellow.black("rollback info")}`;
        info += ` ==> Rollback to batch ${numBatch} | `;
        info += `${message}`;
        this.logger.info(info);
    }

    /**
     * Update general synchronizer information
     * logger prints this information on logger main loop
     * @param {Number} currentBlock - current etehreum block 
     * @param {Number} lastSynchBlock - last etehreum block synchronized
     * @param {Number} currentBatchDepth - current rollup batch
     * @param {Number} lastBatchSaved - last rollup batch synchronized
     */
    _fillInfo(currentBlock, lastSynchBlock, currentBatchDepth, lastBatchSaved){
        this.info = `${chalk.blue("STATE SYNCH".padEnd(12))} | `;
        this.info += `current block number: ${currentBlock} | `;
        this.info += `last block synched: ${lastSynchBlock} | `;
        this.info += `current batch depth: ${currentBatchDepth} | `;
        this.info += `last batch synched: ${lastBatchSaved} | `;
        this.info += `Synched: ${chalk.white.bold(`${this.totalSynch} %`)}`;
    }

    /**
     * Sends message directly to logger
     * specifically for error messages
     * @param {String} message - message to print 
     */
    _logError(message){
        let info = `${chalk.blue("STATE SYNCH".padEnd(12))} | `;
        info += `${chalk.bgRed.black("error info")}`;
        info += ` ==> ${message}`;
        this.logger.info(info);
    }

    /**
     * Retrieve the ethereum block when a rollup batch has been forged
     * @param {Number} batchToSynch - rollup batch
     * @param {Number} lastSynchBlock - last ethereum block synched
     * @param {Number} currentBlock - current ethereum block
     * @returns {Number} targetBlockNumber - ethereum block
     */
    async _getTargetBlock(batchToSynch, lastSynchBlock, currentBlock){
        // beyond "confirmationBlocks" blockchain is considered secure and immutable
        if (lastSynchBlock >= currentBlock - confirmationBlocks)
            this.forgeEventsCache.clear();

        if (this.cacheBatchToUpdate == batchToSynch)
            this.retrySameBatch += 1;

        if (this.retrySameBatch > 4){
            this.forgeEventsCache.clear();
            this.retrySameBatch = 0;
        }

        let targetBlockNumber = this.forgeEventsCache.get(batchToSynch);
        if (!targetBlockNumber){
            const logsForge = await this.rollupContract.getPastEvents("ForgeBatch", {
                fromBlock: lastSynchBlock + 1,
                toBlock: "latest",
            });

            for (const log of logsForge) {
                const key = Number(log.returnValues.batchNumber);
                const value = Number(log.returnValues.blockNumber);
                this.forgeEventsCache.set(key, value);
            }
        }

        // return block number according batch forged
        return this.forgeEventsCache.get(batchToSynch);
    }

    /**
     * Clears all necessary data when a rollback has been triggered
     * @param {Number} batchNumber - rollup batch 
     */
    async _clearRollback(batchNumber) {
        // clear last batch saved
        await this.db.delete(`${batchStateKey}${separator}${batchNumber}`);
        // clear onChain events
        await this.db.delete(`${eventOnChainKey}${separator}${batchNumber-1}`);
        // clear forge events
        await this.db.delete(`${eventForgeBatchKey}${separator}${batchNumber}`);
        // clear exits batch
        await this._clearExits(batchNumber - 1);
    }

    /**
     * Clear all exit entries databse from a given batch
     * @param {Number} batchNumber - rollup batch
     */
    async _clearExits(batchNumber){
        const keysExits = await this.db.listKeys(`${exitInfoKey}${separator}`);
        for (const exitIdKey of keysExits) {
            const arrayExits = this._fromString(await this.db.get(exitIdKey));
            purgeArray(arrayExits, batchNumber);
            await this.db.insert(exitIdKey, this._toString(arrayExits));
        }
    }

    /**
     * Rollback functionality
     * It rollbacks one batch
     * Gets state to batch which is wanted to rollback
     * Reset synchronizer state to new batch
     * Reset rollup Db state to new batch
     * @param {Number} batchNumber - rollup batch 
     */
    async _rollback(batchNumber) {
        const rollbackBatch = batchNumber - 1;
        const state = await this.getStateFromBatch(rollbackBatch);
        if (state) {
            await this.treeDb.rollbackToBatch(rollbackBatch);
            await this.db.insert(lastBatchKey, this._toString(rollbackBatch));
        } else
            throw new Error("can not rollback to a non-existent state");
    }

    /**
     * Get state from rollup batch number
     * @param {Number} numBatch - rollup batch number
     * @returns {Object} state of rollup batch number 
     */
    async getStateFromBatch(numBatch) {
        const key = `${batchStateKey}${separator}${numBatch}`;
        return this._fromString(await this.db.getOrDefault(key, this._toString({root: false, blockNumber: this.creationBlock, miningOnChainHash: false})));
    }

    /**
     * Gets last synchronized ethereum block from database
     * @returns {Number} - last synchronized ethereum block
     */
    async getLastSynchBlock() {
        return this._fromString(await this.db.getOrDefault(lastBlockKey, this.creationBlock.toString()));
    }

    /**
     * Gets last synchronized rollup batch from database
     * @returns {Number} - last synchronized rollup batch
     */
    async getLastBatch(){
        return Number(this._fromString(await this.db.getOrDefault(lastBatchKey, "0")));
    }

    /**
     * Update rollup database
     * @param {Array} logs - array of ethereum events
     * @param {Number} nextBatchSynched - rollup batch number to be synched
     * @param {Number} blockNumber - ethereum block number to be synched
     * @returns {Bool} - true if updated was successful, false otherwise
     */
    async _updateEvents(logs, nextBatchSynched, blockNumber){
        try {
            // save events on database
            const numBatchesToSynch = await this._saveEvents(logs, nextBatchSynched);
            for (const batchSynch of numBatchesToSynch){
                const tmpForgeArray = await this.db.getOrDefault(`${eventForgeBatchKey}${separator}${batchSynch}`);
                const tmpOnChainArray = await this.db.getOrDefault(`${eventOnChainKey}${separator}${batchSynch-2}`);

                let eventOnChain = [];
                let eventForge = [];
                if (tmpForgeArray)
                    eventForge = this._fromString(tmpForgeArray);
                if (tmpOnChainArray)
                    eventOnChain = this._fromString(tmpOnChainArray);

                // Update rollupTree
                // Add events to rollup-tree
                if (eventForge.length > 0){
                    await this._updateTree(eventForge, eventOnChain);
                    await this._saveBatchData(batchSynch, eventForge, eventOnChain);
                    const miningOnChainHash = await this._getMiningOnChainHash(batchSynch);
                    const root = `0x${this.treeDb.getRoot().toString(16)}`;
                    const batchToSave = this.treeDb.lastBatch;
                    await this.db.insert(`${batchStateKey}${separator}${batchToSave}`, this._toString({root, blockNumber, miningOnChainHash}));
                    await this.db.insert(lastBlockKey, this._toString(blockNumber));
                    await this.db.insert(lastBatchKey, this._toString(batchSynch));
                }
            }
            // if (this.mode !== Constants.mode.archive)
            //     await this._purgeEvents(nextBatchSynched + numBatchesToSynch.length - 1);
            return true;
        } catch (error) {
            console.log(error.stack);
            console.log(error.message);
            this._logError(`error updating batch number: ${nextBatchSynched}`);
            this._logError("Events are not saved. Retry in the next synchronization loop");
            return false;
        }
    }

    /**
     * Purge unnecessary events
     * Remove events that have been alrteady synched
     * @param {Number} batchKey 
     */
    async _purgeEvents(batchKey){
        // purge all events which are already used to update account balance tree
        const lastEventPurged = Number(await this.db.getOrDefault(lastPurgedEventKey, "0"));
        // purge off-chain
        for (let i = batchKey; i > lastEventPurged; i--) {
            await this.db.delete(`${eventForgeBatchKey}${separator}${i}`);
        }
        // purge on-chain
        for (let i = (batchKey - 2); i > (lastEventPurged - 2); i--) {
            await this.db.delete(`${eventOnChainKey}${separator}${i}`);
        }
        // update last batch purged
        await this.db.insert(lastPurgedEventKey, this._toString(batchKey));
    }

    /**
     * Save events to database
     * @param {Array} logs - ethereum events
     * @param {Number} nextBatchSynched - rollup batch to synchronize 
     */
    async _saveEvents(logs, nextBatchSynched) {
        let batchesForged = [];
        const eventsOnChain = {};

        for(const event of logs){
            // Add onChain events
            if (event.event == "OnChainTx"){
                const eventOnChainData = this._getOnChainEventData(event.returnValues);
                const numBatchForged = Number(event.returnValues.batchNumber);
                if (numBatchForged >= nextBatchSynched - 1){
                    if (!eventsOnChain[numBatchForged])
                        eventsOnChain[numBatchForged] = [];
                    eventsOnChain[numBatchForged].push(eventOnChainData);
                }
            }

            // Save forge batch
            if (event.event == "ForgeBatch"){
                const eventForge = [];
                const numBatchForged = Number(event.returnValues.batchNumber);
                if (numBatchForged >= nextBatchSynched){
                    batchesForged.push(numBatchForged);
                    eventForge.push(event.transactionHash);
                    await this.db.insert(`${eventForgeBatchKey}${separator}${numBatchForged}`,
                        this._toString(eventForge));
                }
            }
        }
        // Save onChain events
        for (const batchNumber of Object.keys(eventsOnChain)){
            const arrayOnChain = eventsOnChain[batchNumber];
            await this.db.insert(`${eventOnChainKey}${separator}${batchNumber}`,
                this._toString(arrayOnChain));
        }

        // return forge events to save
        return batchesForged;
    }

    /**
     * Save all batch information
     * @param {Number} batchNum 
     */
    async _saveBatchData(batchNum, offChain, onChain){
        const batchData = {};
        
        batchData.offChainData = [];
        batchData.onChainData = [];
        batchData.depositOffChainData = [];
        
        // Save deposit off-chain data
        for (const event of offChain) {
            const dataOffChain = await this._getDepositOffChainBatchData(event);
            batchData.depositOffChainData.push(dataOffChain);
        }

        // Save off-chain events
        for (const event of offChain) {
            const dataOffChain = await this._getOffChainBatchData(event);
            batchData.offChainData.push(dataOffChain);
        }

        // Save on-chain events
        for (const event of onChain) {
            const onChainData = {
                txData: event.txData,
                loadAmount: event.loadAmount,
                fromAx: padding256(event.fromAx),
                fromAy: padding256(event.fromAy),
                fromEthAddr: event.fromEthAddr,
                toAx: padding256(event.toAx),
                toAy: padding256(event.toAy),
                toEthAddr: event.toEthAddr,
            };
            batchData.onChainData.push(onChainData);
        }

        // save to Db
        await this.db.insert(this._toString(Scalar.add(Constants.DB_SYNCH_BATCH_INFO, batchNum)),
            this._toString(batchData));
    }

    /**
     * Get timestamp from transaction hash
     * @param {String} hashTx - transaction hash
     * @returns {Scalar} the unix timestamp 
     */
    async _getTxTimestamp(hashTx){
        const txForge = await this.web3.eth.getTransaction(hashTx);
        // Get block timestamp
        const blockInfo = await this.web3.eth.getBlock(txForge.blockNumber);
        
        return Scalar.e(blockInfo.timestamp);
    }

    /**
     * Get deposit off-chain compressed data
     * @param {*} hashOffChainTx - transaction hash for batch forged
     * @returns {String} - Compressed deposits off-chain
     */
    async _getDepositOffChainBatchData(hashOffChainTx){

        const txForge = await this.web3.eth.getTransaction(hashOffChainTx);
        const decodedData = abiDecoder.decodeMethod(txForge.input);

        let depositOffChainCompressed = "0x";

        decodedData.params.forEach(elem => {
            if (elem.name == "compressedOnChainTx" && elem.value != null) {
                depositOffChainCompressed = elem.value;
            }
        });
        
        return depositOffChainCompressed;
    }

    /**
     * Get basic data from off-chain hash
     * @param {String} hashOffChainTx - transaction hash for batch forged
     * @returns {Object} Basic data forged btach 
     */
    async _getOffChainBatchData(hashOffChainTx){
        const txForge = await this.web3.eth.getTransaction(hashOffChainTx);

        // Get zkInputs of core smart contract
        const decodedData = abiDecoder.decodeMethod(txForge.input);
        let inputRetrieved;
        decodedData.params.forEach(elem => {
            if (elem.name == "input") {
                inputRetrieved = elem.value;
            }
        });

        const inputFinalIdx = inputRetrieved[finalIdxInput];
        const inputOffChainHash = inputRetrieved[offChainHashInput];
        const inputFeePlanCoins = inputRetrieved[feePlanCoinsInput];
        const inputFeeTotals = inputRetrieved[feeTotals];

        // Get data commited from forge batch mechanism
        const fromBlock = txForge.blockNumber - this.blocksPerSlot;
        const toBlock = txForge.blockNumber;
        const logs = await this.rollupPoSContract.getPastEvents("dataCommitted", {
            fromBlock: fromBlock, // previous slot
            toBlock: toBlock, // current slot
        });
        
        let txHash;
        for (const log of logs) {
            if (log.returnValues.hashOffChain == inputOffChainHash){
                txHash = log.transactionHash;
                break;
            }
        }

        // Get compressed transaction from event transaction hash
        const txDataCommitted = await this.web3.eth.getTransaction(txHash);
        const decodedData2 = abiDecoder.decodeMethod(txDataCommitted.input);
        let compressedTx;

        decodedData2.params.forEach(elem => {
            if (elem.name == "compressedTx") {
                compressedTx = elem.value;
            }
        });

        return {
            compressedTxs: compressedTx ? compressedTx: "0x",
            feePlanCoins: inputFeePlanCoins,
            feeTotals: inputFeeTotals,
            timestamp: await this._getTxTimestamp(hashOffChainTx),
            totalAccounts: inputFinalIdx,
        };
    }

    /**
     * Get miningOnChainHash
     * from current rollup database state plus onChain events that must be added
     * @param {Number} batchNumber - rollup batch number 
     */
    async _getMiningOnChainHash(batchNumber){
        const tmpOnChainArray = await this.db.getOrDefault(`${eventOnChainKey}${separator}${batchNumber-1}`);
        let eventsOnChain = [];
        if (tmpOnChainArray)
            eventsOnChain = this._fromString(tmpOnChainArray);
        const bb = await this.treeDb.buildBatch(this.maxTx, this.nLevels);
        for (const event of eventsOnChain) {
            const tx = await this._getTxOnChain(event);
            bb.addTx(tx);
        }
        await bb.build();
        return `0x${bb.getOnChainHash().toString(16)}`;
    }

    /**
     * Get necessary information from on-chain event
     * @param {Object} onChainData - on-chain event parameters
     * @returns {Object} - useful on-chain data 
     */
    _getOnChainEventData(onChainData) {
        console.log('---------------in function _getOnChainEventData----------------');
        console.log(onChainData);
        return {
            batchNumber: onChainData.batchNumber,
            txData: onChainData.txData,
            loadAmount: onChainData.loadAmount,
            fromEthAddr: onChainData.fromEthAddress,
            fromAx: onChainData.fromAx,
            fromAy: onChainData.fromAy,
            toEthAddr: onChainData.toEthAddress,
            toAx: onChainData.toAx,
            toAy: onChainData.toAy,
            encPubKey: onChainData.encPubKey
        };
    }

    /**
     * Add on-chain and off-chain events to rollup database
     * @param {Array} offChain - Off-chain events 
     * @param {Array} onChain - on-chain events 
     */
    async _updateTree(offChain, onChain) {
        console.log('-----in function _updateTree synch.js--------------------');
        const batch = await this.treeDb.buildBatch(this.maxTx, this.nLevels);
        const tmpNewAccounts = {};
        let tmpInitialIdx = batch.finalIdx;

        // events on-chain tx
        for (const event of onChain) {
            const tx = await this._getTxOnChain(event);
            console.log('-----tx here we can the tx structure transferrd from event--------');
            console.log(tx);
            batch.addTx(tx);
            // if (this.mode !== Constants.mode.light)
            if (tx.toAx == GlobalConst.exitAx && tx.toAy == GlobalConst.exitAy && Scalar.neq(tx.amount, 0)) 
                await this._addExitEntry(tx, batch.batchNumber);
            
            // add temporary new account information
            if (tx.newAccount) {
                tmpInitialIdx += 1;
                tmpNewAccounts[tmpInitialIdx] = {
                    ax: tx.fromAx,
                    ay: tx.fromAy,
                    ethAddress: tx.fromEthAddr,
                    coin: tx.coin,
                };
            }
        }

        // data availability deposits on-chain
        for (const event of offChain) {
            const txs = await this._getDepositOffChain(event);
            for (const tx of txs) {
                batch.addTx(tx);
                // Add temporary new account information
                if (tx.newAccount) {
                    tmpInitialIdx += 1;
                    tmpNewAccounts[tmpInitialIdx] = {
                        ax: tx.fromAx,
                        ay: tx.fromAy,
                        ethAddress: tx.fromEthAddr,
                        coin: tx.coin,
                    };
                }         
            }
        }

        // data availability off-chain tx 
        for (const event of offChain) {
            const offChainTxs = await this._getTxOffChain(event, tmpNewAccounts);
            await this._addFeePlanCoins(batch, offChainTxs.inputFeePlanCoin);
            for (const tx of offChainTxs.txs) {
                batch.addTx(tx);
                // if (this.mode !== Constants.mode.light){
                if (tx.toAx == GlobalConst.exitAx && tx.toAy == GlobalConst.exitAy && Scalar.neq(tx.amount, 0)) {
                    await this._addExitEntry(tx, batch.batchNumber, tmpNewAccounts);
                }
                // }

                // handle cross-chain tx
                const toIdx = GlobalConst.getMultiChainAccountIdx(tx.toAx, tx.toAy);
                if (toIdx != null && toIdx != GlobalConst.exitAccount) {
                    const chainOpUrl = GlobalConst.getMultiChainOpUrl(toIdx);

                    try {
                        const res = await MultiChainTxSend.sendTxToTargetChain(
                            chainOpUrl, 
                            GlobalConst.mainnetAx, 
                            GlobalConst.mainnetAy,
                            GlobalConst.mainnetEthAddr,
                            tx.fromAx,
                            tx.fromAy,
                            tx.fromEthAddr,
                            0,
                            tx.amount);
                    } catch (e) {
                        this.logger.error(`SYNCH Send cross-chain tx error: ${e.message}`);
                        this.logger.debug(`SYNCH Send cross-chain tx error: ${e.stack}`);
                    }
                }
            }
        }

        await batch.build();
        await this.treeDb.consolidate(batch);
        GlobalConst.increasePublicNonce();
        return true;
    }

    /**
     * Add exit batch number for a rollup identifier
     * @param {Object} tx - rollup transaction to get the rollup identifier
     * @param {Number} batchNumber - rollup batch number to add
     * @param {Object} tmpNewAccounts - new accounts created in this same batch. They are not consolidated.
     */
    async _addExitEntry(tx, batchNumber, tmpNewAccounts){
        // get fromIdx
        let fromIdx;
        const tmpFromIdx = await this.treeDb.getIdx(tx.coin, tx.fromAx, tx.fromAy);
        if (tmpFromIdx){
            fromIdx = tmpFromIdx;
        } else {
            for (let idx in Object.keys(tmpNewAccounts)){
                const state = tmpNewAccounts[idx];
                if (state.ax == tx.fromAx && state.ay == tx.fromAy && state.coin == tx.coin){
                    fromIdx = idx;
                    break; 
                }
            }
        }

        const key = `${exitInfoKey}${separator}${fromIdx}`;
        const oldExitIdArray = await this.db.getOrDefault(key, "");
    
        let newExitIdArray = [];
        if (oldExitIdArray !== "")
            newExitIdArray = [...this._fromString(oldExitIdArray)];

        newExitIdArray.push(batchNumber);

        await this.db.insert(key, this._toString(newExitIdArray));
    }

    /**
     * Reconstruct transaction from on-chain event
     * @param {Object} event - on-chain event data
     * @returns {Object} rollup transaction  
     */
    async _getTxOnChain(event) {
        console.log('-------in function _getTxOnChain here how to transfer event to tx----- ');
        console.log(event.txData);
        const txData = decodeTxData(event.txData);
        console.log(event);
        console.log('event.encPubKey');
        console.log(event.encPubkey);

        console.log('the content is :');
        console.log(event.encPubKey[0]);
        console.log(event.encPubKey[1]);
        console.log(event.encPubKey[2]);
        console.log(event.encPubKey[3]);
        console.log(event.encPubKey[4]);

        let stringBufEncPubKeya = event.encPubKey[0].slice(2);
        let stringBufEncPubKeyb = event.encPubKey[1].slice(2);
        let stringBufEncPubKeyc = event.encPubKey[2].slice(2);
        let stringBufEncPubKeyd = event.encPubKey[3].slice(2);
        let stringBufEncPubKeye = event.encPubKey[4].slice(2);

        let encPubKeyHex = stringBufEncPubKeya.concat(stringBufEncPubKeyb, stringBufEncPubKeyc, stringBufEncPubKeyd, 
            stringBufEncPubKeye).slice(0, 280);
        console.log("encPubKeyHex");
        console.log(encPubKeyHex);


        return {
            amount: Scalar.e(txData.amount),
            loadAmount: Scalar.e(event.loadAmount),
            coin: Scalar.e(txData.coin),
            fromAx: padding256(event.fromAx),
            fromAy: padding256(event.fromAy),
            fromEthAddr: event.fromEthAddr,
            toAx: padding256(event.toAx),
            toAy: padding256(event.toAy),
            toEthAddr: event.toEthAddr,
            onChain: true,
            newAccount: txData.newAccount,
            encPubKeyHex: encPubKeyHex,
        };
    }

    /**
     * Reconstruct deposits off-chain from data availability
     * @param {Object} event - forge event data
     * @returns {Array} deposits off-chain   
     */
    async _getDepositOffChain(event){
        const txForge = await this.web3.eth.getTransaction(event);
        const decodedData = abiDecoder.decodeMethod(txForge.input);

        let depositOffChainCompressed = "0x";

        decodedData.params.forEach(elem => {
            if (elem.name == "compressedOnChainTx" && elem.value != null) {
                depositOffChainCompressed = elem.value;
            }
        });
        
        return decodeDepositOffChain(Buffer.from(depositOffChainCompressed.slice(2), "hex"));
    }

    /**
     * Reconstruct transactions from off-chain event
     * @param {Object} event - off-chain event data
     * @param {Object} tmpNewAccounts - new accounts created in this same batch. They are not consolidated.
     * @returns {Object} rollup transaction and fee plan data  
     */
    async _getTxOffChain(event, tmpNewAccounts) {
        const txForge = await this.web3.eth.getTransaction(event);
        const decodedData = abiDecoder.decodeMethod(txForge.input);
        let inputRetrieved;
        decodedData.params.forEach(elem => {
            if (elem.name == "input") {
                inputRetrieved = elem.value;
            }
        });

        const inputOffChainHash = inputRetrieved[offChainHashInput];
        const inputFeePlanCoin = inputRetrieved[feePlanCoinsInput];

        const fromBlock = txForge.blockNumber - this.blocksPerSlot;
        const toBlock = txForge.blockNumber;
        const logs = await this.rollupPoSContract.getPastEvents("dataCommitted", {
            fromBlock: fromBlock, // previous slot
            toBlock: toBlock, // current slot
        });
        let txHash;
        for (const log of logs) {
            if (log.returnValues.hashOffChain == inputOffChainHash){
                txHash = log.transactionHash;
                break;
            }
        }
        const txDataCommitted = await this.web3.eth.getTransaction(txHash);
        const decodedData2 = abiDecoder.decodeMethod(txDataCommitted.input);
        let compressedTx;

        decodedData2.params.forEach(elem => {
            if (elem.name == "compressedTx") {
                compressedTx = elem.value;
            }
        });
        
        const txs = [];
        const decodeTxs = decodeDataAvailability(this.nLevels, compressedTx);
        
        for (let i = 0; i < decodeTxs.length; i++) {
            const decodeTx = decodeTxs[i];

            // get fromIdx info
            let fromState;
            const tmpFromState = await this.treeDb.getStateByIdx(decodeTx.fromIdx);
            if (tmpFromState){
                fromState = tmpFromState;
            } else {
                fromState = tmpNewAccounts[decodeTx.fromIdx];
            }

            // get toIdx info
            let toState;
            if (Scalar.neq(decodeTx.toIdx, 0) && (!GlobalConst.isMultiChainAccount(decodeTx.toIdx))){
                const tmpToState = await this.treeDb.getStateByIdx(decodeTx.toIdx);
                if (tmpToState){
                    toState = tmpToState;
                } else {
                    toState = tmpNewAccounts[decodeTx.toIdx];
                }
            } else if(Scalar.eq(decodeTx.toIdx, 0)) {
                toState = {};
                toState.ax = GlobalConst.exitAx;
                toState.ay = GlobalConst.exitAy;
                toState.ethAddress = GlobalConst.exitEthAddr;
            } else {
                toState = {};
                const {ax, ay, ethAddr} = GlobalConst.getMultiChainAccount(decodeTx.toIdx);
                toState.ax = ax;
                toState.ay = ay;
                toState.ethAddress = ethAddr;
            }

            if (fromState == undefined || fromState == null) {
                fromState = GlobalConst.getMultiChainAccountState(decodeTx.fromIdx, toState.coin);
            }

            const tx = {
                fromAx: fromState.ax,
                fromAy: fromState.ay,
                fromEthAddr: fromState.ethAddress,
                toAx: toState.ax,
                toAy: toState.ay,
                toEthAddr: toState.ethAddress,
                coin: fromState.coin,
                amount: decodeTx.amount,
                fee: decodeTx.fee,
            };
            txs.push(tx);
        }
        return {txs, inputFeePlanCoin};
    }

    /**
     * Add fee plan to batch builder
     * @param {Object} bb - batch builder
     * @param {String} feePlanCoins - fee plan coin encoded as hex string  
     */
    async _addFeePlanCoins(bb, feePlanCoins) {
        const tmpCoins = Scalar.e(feePlanCoins);
        for (let i = 0; i < 16; i++){
            const coin = extract(tmpCoins, 16*i, 16);
            await bb.addCoin(coin);
        }
    }

    /**
     * Get rollup state
     * @param {Number} id - rollup identifier
     * @returns {Object} - rollup state  
     */
    async getStateById(id) {
        return await this.treeDb.getStateByIdx(id);
    }

    /**
     * Get all rollup state
     * @param {Number} id - rollup identifier
     * @returns {Object} - rollup state  
     */
    async getStatesById(id) {
        const accountState =  await this.treeDb.getStateByIdx(id);
        console.log(accountState.ax);
        console.log(accountState.ay);
        let accountStates = await this.treeDb.getStateByAxAy(accountState.ax, accountState.ay);
        let encPubkey = await this.treeDb.getEncPubKey(accountState.ax, accountState.ay);
        let bufEncPubKey = Buffer.from(encPubkey, 'hex');

        let loadKey = new NodeRSA();
        loadKey.importKey(bufEncPubKey, 'pkcs1-public-der');
        for(const account of accountStates){
            account.ax = loadKey.encrypt(account.ax, 'base64');
            account.ay = loadKey.encrypt(account.ay, 'base64');
            account.rollupAddress = loadKey.encrypt(account.rollupAddress, 'base64');
            account.amount = loadKey.encrypt(stringifyBigInts(account.amount), 'base64');
            account.ethAddress = loadKey.encrypt(account.ethAddress, 'base64');
        }
        return accountStates;

    }

     /**
     * Get encPubkey that matches with AxAy
     * @param {String} ax - x babyjubjub coordinate encoded as hexadecimal string 
     * @param {String} ay - y babyjubjub coordinate encoded as hexadecimal string 
     * @returns {String} - encPubKey  
     */
    async getPubKeyByAxAy(ax, ay) {
        return await this.treeDb.getEncPubKey(ax, ay);
    }

    /**
     * Get rollup account state
     * @param {Number} coin - coin identifier
     * @param {String} ax - x babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @param {String} ay - y babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @returns {Object} - rollup state
     */
    async getStateByAccount(coin, ax, ay) {
        return await this.treeDb.getStateByAccount(coin, ax, ay);
    }

    /**
     * Get all rollup states that matches with AxAy
     * @param {String} ax - x babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @param {String} ay - y babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @returns {Array} - rollup states  
     */
    async getStateByAxAy(ax, ay) {
        return await this.treeDb.getStateByAxAy(ax, ay);
    }

    /**
     * Get all rollup states that matches with ethAddress
     * @param {String} ethAddress - ethereum address encoded as hexadecimal string
     * @returns {Array} - rollup states  
     */
    async getStateByEthAddr(ethAddress) {
        return await this.treeDb.getStateByEthAddr(ethAddress);
    }

    /**
     * Get all rollup transaction that matches with transaction id
     * @param {String}  transaction id - transaction ID
     *  @returnt {tx} - tx  
     */
    async getTransactionInfo(id) {
        return await this.treeDb.getTransactionById(id);
    }

    /**
     * Get necessary data to perform a withdrawal
     * @param {Number} numBatch - number of batch
     * @param {Number} coin - coin identifier
     * @param {String} ax - x babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @param {String} ay - y babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @returns {Object} - exit data  
     */
    async getExitTreeInfo(numBatch, coin, ax, ay) {
        return await this.treeDb.getExitTreeInfo(numBatch, coin, ax, ay);
    }

    /**
     * Get percentatge of synchronization
     * @returns {String} - 0.00% format
     */
    getSynchPercentage() {
        return this.totalSynch;
    }

    /**
     * Builds batch builder depending on current rollup database state
     * batch builder is ready to be computed and forged
     * @returns {Object} - batch builder
     */
    async getBatchBuilder() {
        const bb = await this.treeDb.buildBatch(this.maxTx, this.nLevels);
        const currentBlock = await this.web3.eth.getBlockNumber();
        const currentBatchDepth = await this.rollupContract.methods.getStateDepth().call({from: this.ethAddress}, currentBlock);
        // add on-chain txs
        let eventsOnChain = [];
        const tmpEventsOnChain = await this.db.getOrDefault(`${eventOnChainKey}${separator}${currentBatchDepth-1}`);
        if (tmpEventsOnChain)
            eventsOnChain = this._fromString(tmpEventsOnChain);

        for (const event of eventsOnChain) {
            bb.addTx(await this._getTxOnChain(event));
        }
        return bb;
    }

    /**
     * Get all off-chain transactions performed in a batch
     * @param {Number} numBatch - rollup batch number 
     * @returns {Array} - list of transactions
     */
    async getOffChainTxByBatch(numBatch) {
        const res = [];
        const ret = {};
        // add off-chain tx
        // if (this.mode === Constants.mode.archive){
        const bb = await this.treeDb.buildBatch(this.maxTx, this.nLevels);
        const tmpForgeArray = await this.db.getOrDefault(`${eventForgeBatchKey}${separator}${numBatch}`);
        let eventForge = [];
        if (tmpForgeArray) 
            eventForge = this._fromString(tmpForgeArray);

        for (const hashTx of eventForge) {
            const offChainTxs = await this._getTxOffChain(hashTx);
            await this._addFeePlanCoins(bb, offChainTxs.inputFeePlanCoin);
            for (const tx of offChainTxs.txs) res.push(tx);
        }
        // }
        ret['tx'] = res;
        ret['hash'] = eventForge;
        return ret;
    }


     /**
     * Get all off-chain enc transactions performed in a batch
     * @param {Number} numBatch - rollup batch number 
     * @returns {Array} - list of enc transactions
     */
    async getEncOffChainTxByBatch(numBatch) {
        const res = [];
        const ret = {};
        // add off-chain tx
        // if (this.mode === Constants.mode.archive){
        const bb = await this.treeDb.buildBatch(this.maxTx, this.nLevels);
        const tmpForgeArray = await this.db.getOrDefault(`${eventForgeBatchKey}${separator}${numBatch}`);
        let eventForge = [];
        if (tmpForgeArray) 
            eventForge = this._fromString(tmpForgeArray);

        for (const hashTx of eventForge) {
            const offChainTxs = await this._getTxOffChain(hashTx);
            await this._addFeePlanCoins(bb, offChainTxs.inputFeePlanCoin);
            for (const tx of offChainTxs.txs) {
                let encTx = {};
                let loadKey = new NodeRSA();

                let accountState = await this.treeDb.getStateByAccount(tx.coin, tx.fromAx, tx.fromAy);
                console.log(accountState);

                // get encPubKey
                let encPubKey = await this.treeDb.getEncPubKey(tx.fromAx, tx.fromAy);
                console.log('---------encPubKey------------');
                console.log(encPubKey);
                let bufEncPubKey = Buffer.from(encPubKey, 'hex');
                console.log(bufEncPubKey);
                // form RSA key
                loadKey.importKey(bufEncPubKey, 'pkcs1-public-der');
                console.log(loadKey.isPublic());

                encTx.fromIdx = accountState.idx;
                console.log(encTx.fromIdx);

                encTx.fromAx = loadKey.encrypt(tx.fromAx, 'base64');
                encTx.fromAy = loadKey.encrypt(tx.fromAy, 'base64');
                encTx.amount = loadKey.encrypt(stringifyBigInts(tx.amount), 'base64');
                encTx.coin = loadKey.encrypt(tx.coin.toString(), 'base64');
                encTx.toAx = loadKey.encrypt(tx.toAx, 'base64');
                encTx.toAy = loadKey.encrypt(tx.toAy, 'base64');
                encTx.toEthAddr = loadKey.encrypt(tx.fromEthAddr, 'base64');

                console.log(encTx);

                res.push(encTx);
            };
        }
        // }
        ret['tx'] = res;
        ret['hash'] = eventForge;

        return ret;
    }

    /**
     * Get all available exits batches for a rollup account
     * @param {Number} coin - coin identifier
     * @param {String} ax - x babyjubjub coordinate encoded as hexadecimal string (whitout '0x')
     * @param {String} ay - y babyjubjub coordinate encoded as hexadecimal string (whitout '0x') 
     * @returns {Array} - list of batches where the rollup identifier has withdrawals
     */
    async getExitsBatchById(coin, ax, ay){
        let exitsBatches = [];
        // if (this.mode !== Constants.mode.light) {
        const idx = await this.treeDb.getIdx(coin, ax, ay);
        if (!idx) return null;
        const key = `${exitInfoKey}${separator}${idx}`;
        const value = await this.db.getOrDefault(key, "");
        if (value !== "")
            exitsBatches = [...this._fromString(value)];
        // }
        return exitsBatches;
    }

    /**
     * Get all available exits batches for rollup identifier
     * @returns {Bool} - true if fully synchronized, false otherwise
     */
    async isSynched() {
        if (this.totalSynch != Number(100).toFixed(2)) return false;
        const currentBlock = await this.web3.eth.getBlockNumber();
        const currentBatch = await this.rollupContract.methods.getStateDepth().call({from: this.ethAddress}, currentBlock);
        const lastBatchSaved = await this.getLastBatch();
        if (lastBatchSaved < currentBatch) return false;
        return true;
    }

    /**
     * Get rollup core contract state root
     * @returns {String} - BigInt number encoded as string
     */
    async getCurrentStateRoot() {
        const lastBatch = await this.rollupContract.methods.getStateDepth()
            .call({from: this.ethAddress});
        return await this.rollupContract.methods.getStateRoot(lastBatch)
            .call({from: this.ethAddress});
    }

    /**
     * Get rollup core contract mining on-chain hash
     * @returns {String} - BigInt number encoded as string
     */
    async getMiningOnchainHash() {
        return await this.rollupContract.methods.miningOnChainTxsHash()
            .call({from: this.ethAddress});
    }

    /**
     * Get minimum fee required to do a deposit off-chain
     * @returns {Scalar} - Fee deposit off-chain in weis
     */
    async getFeeDepOffChain() {
        if (this.feeDepOffChain) return this.feeDepOffChain;
        return Scalar.e(await this.rollupContract.methods.depositFee()
            .call({from: this.ethAddress}));
    }

    /**
     * Get minimum fee required to do an on-chain transaction
     * @returns {Scalar} - Fee on-chain transaction in weis
     */
    async getFeeOnChainTx() {
        if (this.feeOnChainTx) return this.feeOnChainTx;
        return Scalar.e(await this.rollupContract.methods.feeOnchainTx()
            .call({from: this.ethAddress}));
    }

    /**
     * Get batch information
     * @param {Number} numBatch - batch number 
     * @returns {Object} - batch info  
     */
    async getBatchInfo(numBatch) {
        const key = this._toString(Scalar.add(Constants.DB_SYNCH_BATCH_INFO, numBatch));
        const value = await this.db.getOrDefault(key, null);
        if (value === null) return null;

        return this._fromString(value);
    }

    /**
     * Get static data 
     * @returns {Object} - static data info  
     */
    async getStaticData() {
        return {
            contractAddress: this.rollupAddress,
            maxTx: this.maxTx,
            maxOnChainTx: this.maxOnChainTx,
            nLevels: this.nLevels,
        };
    }
}

module.exports = Synchronizer;
