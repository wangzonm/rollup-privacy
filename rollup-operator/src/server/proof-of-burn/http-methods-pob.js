const { stringifyBigInts } = require("ffjavascript").utils;
const { babyJub } = require("circomlib");

const utils = require("../utils");
const eddsaBabyJub = require('../../../../rollup-utils/eddsa-babyjub');
const ruutils = require("../../../../rollup-utils/utils");

const Constants = require("../../../../js/constants");

const privateKey = eddsaBabyJub.PrivateKey.newRandom();
/**
 * Expose http methods to retrieve rollup data
 */
class HttpMethods {

    /**
     * Initialize modules required to start api http methods
     * @param {Object} serverApp - operator server instance
     * @param {Object} rollupSynch - core rollup synchronizer
     * @param {Object} pobSynch - PoS rollup synchronizer
     * @param {Object} tokensSynch - token synchronizer
     * @param {Object} encKey - operator encKey
     * @param {Object} logger - logger instance
     */
    constructor(
        serverApp,
        rollupSynch,
        pobSynch,
        tokensSynch,
        encKey,
        logger
    ){
        this.app = serverApp;
        this.rollupSynch = rollupSynch;
        this.pobSynch = pobSynch;
        this.tokensSynch = tokensSynch;
        this.encKey = encKey;
        this.logger = logger;
    }

    /**
     * Initilize http methods to get general rollup data
     */
    async initStateApi(){
        this.app.get("/batchTransactions/:batchNum", async (req, res) => { //+ add
            const batchNum = req.params.batchNum;

            try {
                const infoTxs= await this.rollupSynch.getBatchTxs(batchNum);
                if(infoTxs == null)
                    res.status(404).send("Batch not found");
                else
                    res.status(200).json(stringifyBigInts(infoTxs));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting batch transactions information");
            }
        });

        this.app.get("/state", async (req, res) => {
            try {
                const generalInfo = await utils.getGeneralInfoPob(this.rollupSynch, this.pobSynch); 
                res.status(200).json(generalInfo);
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting general information");
            }
        });
    }

    async initChainStateApi(){
        this.app.get("/chainState/:numbatch", async (req, res) => {
            let numBatch = req.params.numbatch;
            try {
                const chainState = await this.rollupSynch.getStateFromBatch(numBatch); 
                if(chainState == null)
                    res.status(404).send("Batch not found");
                else
                    res.status(200).json(stringifyBigInts(chainState));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting chain state information");
            }
        });
    }

    /**
     * Initilize http methods to get list of available operators
     */
    async initOperarorsApi(){
        this.app.get("/operators", async (req, res) => {
            try {
                const operatorList = await this.pobSynch.getOperatorsWinners();
                res.status(200).json(stringifyBigInts(operatorList));
            } catch (error) {
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting operators list");
            }
        });

        this.app.get("/operatorencpubkey", async (req, res) => {
            try {
                let encPubKeyDer = await this.encKey.exportKey('pkcs1-public-der');
                let encPubKeyDerHex = encPubKeyDer.toString('hex');
                res.status(200).json(stringifyBigInts(encPubKeyDerHex));
            } catch (error) {
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting operators encrypto public key");
            }
        });

        /**
         * @api {get} /encoperators 
         * @apiSampleRequest http://106.3.133.180:9000/encoperators
         * @apiVersion 0.0.1
         * @apiGroup operators
         * @apiDescription get available operators
         * 
         * **/
        this.app.get("/encoperators", async (req, res) => {
            try {
                const operatorList = await this.pobSynch.getOperatorsWinners();
                let soperatorList = stringifyBigInts(operatorList);
                soperatorList.map(e => {
                        const messBuff = Buffer.from(e.amount);
                        const messHash = ruutils.hashBuffer(messBuff);
                        let sign = privateKey.signPoseidon(messHash).toString();
                        e.amount = '0x' + sign;
                    });
                res.status(200).json(soperatorList);
            } catch (error) {
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting operators list");
            }
        });
    }

    /**
     * Initilize http methods to get data regarding tokens
     */
    async initTokensApi(){
        this.app.get("/tokens", async (req, res) => {
            try {
                const infoTokens = await this.tokensSynch.getTokensList();
                if (Object.keys(infoTokens).length === 0)
                    res.status(404).send("Tokens not found");
                else   
                    res.status(200).json(stringifyBigInts(infoTokens));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting token list information");
            }
        });

        this.app.get("/feetokens", async (req, res) => {
            try {
                const feetokens = await this.tokensSynch.getCurrentFee();
                res.status(200).json(stringifyBigInts(feetokens));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting fee token information");
            }
        });
    }

    /**
     * Initilize http methods to get data regarding individual batches
     */
    async initBatchApi(){
        this.app.get("/batch/:numbatch", async (req, res) => {
            const numBatch = req.params.numbatch;
            try {
                const infoTx = await this.rollupSynch.getBatchInfo(numBatch);
                if (infoTx === null)
                    res.status(404).send("Batch not found");
                else   
                    res.status(200).json(stringifyBigInts(infoTx));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting batch information");
            }
        });

        /**
         * @api {get} /batchTx/:numbatch 
         * @apiSampleRequest http://106.3.133.180:9000/batchTx/154 
         * @apiVersion 0.0.1
         * @apiGroup batch operation
         * @apiDescription get offchain Tx in a batch
         * @apiParam {number} numbatch batch's number
         * 
         * **/
        this.app.get("/batchTx/:numbatch", async (req, res) => {
            const numBatch = req.params.numbatch;
            try {
                const infoTx = await this.rollupSynch.getOffChainTxByBatch(numBatch);
                if (infoTx === null)
                    res.status(404).send("Batch not found");
                else   
                    res.status(200).json(stringifyBigInts(infoTx));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting batch information");
            }
        });

         /**
         * @api {get} /pushTxHash/:numbatch 
         * @apiSampleRequest http://106.3.133.180:9000/pushTxHash/154 
         * @apiVersion 0.0.1
         * @apiGroup batch operation
         * @apiDescription get push tx hash in a batch
         * @apiParam {number} numbatch batch's number
         * 
         * **/

        this.app.get("/pushTxHash/:numbatch", async (req, res) => {
            const numBatch = req.params.numbatch;
            try {
                const infoTx = await this.rollupSynch.getPushTxHashByBatch(numBatch);
                if (infoTx === null)
                    res.status(404).send("Batch not found");
                else   
                    res.status(200).json(stringifyBigInts(infoTx));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting batch information");
            }
        });

         /**
         * @api {get} /encbatchTx/:numbatch 
         * @apiSampleRequest http://106.3.133.180:9000/encbatchTx/154 
         * @apiVersion 0.0.1
         * @apiGroup batch operation
         * @apiDescription get offchain Tx in which the amount is encrypted in a batch
         * @apiParam {number} numbatch batch's number
         * 
         * **/
        this.app.get("/encbatchTx/:numbatch", async (req, res) => {
            const numBatch = req.params.numbatch;
            try {
                const infoTx = await this.rollupSynch.getOffChainTxByBatch(numBatch);
                if (infoTx === null)
                    res.status(404).send("Batch not found");
                else {
                    let sinfoTX = stringifyBigInts(infoTx);
                    sinfoTX.tx.map(e => {
                        const fromEthAddrBuff = Buffer.from(e.fromEthAddr);
                        const fromEthAddrHash = ruutils.hashBuffer(fromEthAddrBuff);
                        let fromEthAddrsign = privateKey.signPoseidon(fromEthAddrHash).toString();
                        e.fromEthAddr = '0x' + fromEthAddrsign;
                        
                        const messBuff = Buffer.from(e.amount);
                        const messHash = ruutils.hashBuffer(messBuff);
                        let sign = privateKey.signPoseidon(messHash).toString();
                        e.amount = '0x' + sign;

                        const fromAxBuff = Buffer.from(e.fromAx);
                        const fromAxHash = ruutils.hashBuffer(fromAxBuff);
                        let fromAxsign = privateKey.signPoseidon(fromAxHash).toString();
                        e.fromAx = '0x' + fromAxsign;
                        const fromAyBuff = Buffer.from(e.fromAy);
                        const fromAyHash = ruutils.hashBuffer(fromAyBuff);
                        let fromAysign = privateKey.signPoseidon(fromAyHash).toString();
                        e.fromAy = '0x' + fromAysign;

                        const toAxBuff = Buffer.from(e.toAx);
                        const toAxHash = ruutils.hashBuffer(toAxBuff);
                        let toAxsign = privateKey.signPoseidon(toAxHash).toString();
                        e.toAx = '0x' + toAxsign;
                        const toAyBuff = Buffer.from(e.toAy);
                        const toAyHash = ruutils.hashBuffer(toAyBuff);
                        let toAysign = privateKey.signPoseidon(toAyHash).toString();
                        e.toAy = '0x' + toAysign;

                        const toEthAddrBuff = Buffer.from(e.toEthAddr);
                        const toEthAddrHash = ruutils.hashBuffer(toEthAddrBuff);
                        let toEthAddrsign = privateKey.signPoseidon(toEthAddrHash).toString();
                        e.toEthAddr = '0x' + toEthAddrsign;

                    });
                    res.status(200).json(sinfoTX);
                }
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting batch information");
            }
        });

        this.app.get("/rencbatchTx/:numbatch", async (req, res) => {
            const numBatch = req.params.numbatch;
            try {
                const infoTx = await this.rollupSynch.getEncOffChainTxByBatch(numBatch);
                if (infoTx === null)
                    res.status(404).send("Batch not found");
                else {
                    console.log('----------in rencbatchTx function-----------');
                    console.log(infoTx);
                    let sinfoTX = stringifyBigInts(infoTx);
                    res.status(200).json(sinfoTX);
                }
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting batch information");
            }
        });
    }

    
    /**
     * Initilize http methods to get data regarding individual batches
     */
    async initTransactionApi(){
        this.app.get("/transaction/:num", async (req, res) => {
            const numTransaction = req.params.num;
            try {
                const infoTx = await this.rollupSynch.getTransactionInfo(numTransaction);
                if (infoTx === null)
                    res.status(404).send("transaction not found");
                else   
                    res.status(200).json(stringifyBigInts(infoTx));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting transaction information");
            }
        });

        this.app.get("/enctransaction/:num", async (req, res) => {
            const numTransaction = req.params.num;
            try {
                const infoTx = await this.rollupSynch.getTransactionInfo(numTransaction);
                if (infoTx === null)
                    res.status(404).send("transaction not found");
                else {
                    let sinfoTX = stringifyBigInts(infoTx);

                    const fromIdxBuff = Buffer.from(sinfoTX.fromIdx.toString());
                    const fromIdxHash = ruutils.hashBuffer(fromIdxBuff);
                    let fromIdxsign = privateKey.signPoseidon(fromIdxHash).toString();
                    sinfoTX.fromIdx = '0x' + fromIdxsign;

                    const toIdxBuff = Buffer.from(sinfoTX.toIdx.toString());
                    const toIdxHash = ruutils.hashBuffer(toIdxBuff);
                    let toIdxsign = privateKey.signPoseidon(toIdxHash).toString();
                    sinfoTX.toIdx = '0x' + toIdxsign;

                    const messBuff = Buffer.from(sinfoTX.amount);
                    const messHash = ruutils.hashBuffer(messBuff);
                    let sign = privateKey.signPoseidon(messHash).toString();
                    sinfoTX.amount = '0x' + sign;

                    const fromAxBuff = Buffer.from(sinfoTX.fromAx);
                    const fromAxHash = ruutils.hashBuffer(fromAxBuff);
                    let fromAxsign = privateKey.signPoseidon(fromAxHash).toString();
                    sinfoTX.fromAx = '0x' + fromAxsign;
                    const fromAyBuff = Buffer.from(sinfoTX.fromAy);
                    const fromAyHash = ruutils.hashBuffer(fromAyBuff);
                    let fromAysign = privateKey.signPoseidon(fromAyHash).toString();
                    sinfoTX.fromAy = '0x' + fromAysign;

                    const toAxBuff = Buffer.from(sinfoTX.toAx);
                    const toAxHash = ruutils.hashBuffer(toAxBuff);
                    let toAxsign = privateKey.signPoseidon(toAxHash).toString();
                    sinfoTX.toAx = '0x' + toAxsign;
                    const toAyBuff = Buffer.from(sinfoTX.toAy);
                    const toAyHash = ruutils.hashBuffer(toAyBuff);
                    let toAysign = privateKey.signPoseidon(toAyHash).toString();
                    sinfoTX.toAy = '0x' + toAysign;

                    const toEthAddrBuff = Buffer.from(sinfoTX.toEthAddr);
                    const toEthAddrHash = ruutils.hashBuffer(toEthAddrBuff);
                    let toEthAddrsign = privateKey.signPoseidon(toEthAddrHash).toString();
                    sinfoTX.toEthAddr = '0x' + toEthAddrsign;

                    res.status(200).json(sinfoTX);

                }  
                    
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting transaction information");
            }

        });
        
    }


    /**
     * Initilize http methods to get data regarding exits information
     */
    async initExitsApi(){
        this.app.get("/exits/:ax/:ay/:coin/:numbatch", async (req, res) => {
            const numBatch = req.params.numbatch;
            const ax = req.params.ax;
            const ay = req.params.ay;
            const coin = req.params.coin;

            try {
                const resFind = await this.rollupSynch.getExitTreeInfo(numBatch, coin, ax, ay);
                if (resFind === null)
                    res.status(404).send("No information was found");    
                else 
                    res.status(200).json(stringifyBigInts(resFind));
                    
            } catch (error) {
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting exit tree information");
            }
        });

        this.app.get("/exits/:ax/:ay/:coin", async (req, res) => {
            const ax = req.params.ax;
            const ay = req.params.ay;
            const coin = req.params.coin;

            try {
                const resFind = await this.rollupSynch.getExitsBatchById(coin, ax, ay);
                if (resFind === null || resFind.length === 0)
                    res.status(404).send("No exits batch found");
                else
                    res.status(200).json(stringifyBigInts(resFind));
            } catch (error) {
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting exit batches");
            }
        });
    }

    /**
     * Initilize http methods to get data regarding rollup accounts
     */
    async initAccountsApi(){
        this.app.get("/accounts/:ax/:ay/:coin", async (req, res) => {
            const ax = req.params.ax;
            const ay = req.params.ay;
            const coin = req.params.coin;
            try {
                let info = await this.rollupSynch.getStateByAccount(coin, ax, ay);
                if (info === null) {
                    const idx = Constants.getMultiChainAccountIdx(ax, ay);
                    if (idx != null) {
                        info = Constants.getMultiChainAccountState(idx, coin);
                    }
                }
                if (info === null)
                    res.status(404).send("Account not found");
                else   
                    res.status(200).json(stringifyBigInts(info));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts information");
            }
        });

        this.app.get("/accounts/:address", async (req, res) => {
            const rollupAddress = req.params.address;
            
            let compressHex;
            if (rollupAddress.startsWith("0x")) compressHex = rollupAddress.slice(2);
            else compressHex = rollupAddress;

            const buf = Buffer.from(compressHex, "hex"); 
            const point = babyJub.unpackPoint(buf);
            
            // check point is decompressed correctly
            if (!point){
                res.status(404).send("Account not found");
                return;
            }

            const ax = point[0].toString(16);
            const ay = point[1].toString(16);
            
            try {
                const info = await this.rollupSynch.getStateByAxAy(ax, ay);
                if (info === null || info.length === 0)
                    res.status(404).send("Account not found");
                else   
                    res.status(200).json(stringifyBigInts(info));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts information");
            }
        });
        /**
         * getIdxs get all idx by rollup address
         */

        this.app.get("/getIdxs/:address", async (req, res) => {
            const rollupAddress = req.params.address;
            
            let compressHex;
            if (rollupAddress.startsWith("0x")) compressHex = rollupAddress.slice(2);
            else compressHex = rollupAddress;

            const buf = Buffer.from(compressHex, "hex"); 
            const point = babyJub.unpackPoint(buf);
            
            // check point is decompressed correctly
            if (!point){
                res.status(404).send("Account not found");
                return;
            }

            const ax = point[0].toString(16);
            const ay = point[1].toString(16);
            
            try {
                const info = await this.rollupSynch.getIdxsByAxAy(ax, ay);
                if (info === null || info.length === 0)
                    res.status(404).send("Account not found");
                else   
                    res.status(200).json(stringifyBigInts(info));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts information");
            }
        });


        this.app.get("/encaccountsIdx/:idx", async (req, res) => {
            const idx = req.params.idx;
            
            try {
                const info = await this.rollupSynch.getStatesById(idx);
                if (info === null || info.length === 0)
                    res.status(404).send("Account not found");
                else   
                    res.status(200).json(stringifyBigInts(info));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts information");
            }
        });


        this.app.get("/accountencPubKey/:address", async (req, res) => {
            const rollupAddress = req.params.address;
            
            let compressHex;
            if (rollupAddress.startsWith("0x")) compressHex = rollupAddress.slice(2);
            else compressHex = rollupAddress;

            const buf = Buffer.from(compressHex, "hex"); 
            const point = babyJub.unpackPoint(buf);
            
            // check point is decompressed correctly
            if (!point){
                res.status(404).send("Account not found");
                return;
            }

            const ax = point[0].toString(16);
            const ay = point[1].toString(16);
            console.log('------Ax-----------');
            console.log(ax);
            console.log('--------Ay----------');
            console.log(ay);
            
            try {
                const info = await this.rollupSynch.getPubKeyByAxAy(ax, ay);
                if (info === null || info.length === 0)
                    res.status(404).send("Account not found");
                else   
                    res.status(200).json(stringifyBigInts(info));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts encPubKey information");
            }
        });

        this.app.get("/accounts/:address/:coin", async (req, res) => {
            const rollupAddress = req.params.address;
            const coin = req.params.coin;
            
            let compressHex;
            if (rollupAddress.startsWith("0x")) compressHex = rollupAddress.slice(2);
            else compressHex = rollupAddress;

            const buf = Buffer.from(compressHex, "hex"); 
            const point = babyJub.unpackPoint(buf);
            
            // check point is decompressed correctly
            if (!point){
                res.status(404).send("Account not found");
                return;
            }

            const ax = point[0].toString(16);
            const ay = point[1].toString(16);
            
            try {
                const info = await this.rollupSynch.getStateByAccount(coin, ax, ay);
                if (info === null)
                    res.status(404).send("Account not found");
                else   
                    res.status(200).json(stringifyBigInts(info));
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts information");
            }
        });
 
        this.app.get("/accounts", async (req, res) => {
            const ax = req.query.ax;
            const ay = req.query.ay;
            const ethAddr = req.query.ethAddr; 

            let accounts;

            if (ax === undefined && ay === undefined && ethAddr === undefined ){
                res.status(400).send("No filters has been submitted");
                return;
            }
                

            // Filter first by AxAy or/and ethAddress
            if ((ax !== undefined && ay === undefined) || (ax === undefined && ay !== undefined)){
                res.status(400).send("Babyjub key is not completed. Please provide both Ax and Ay");
            } else {
                try {
                    if (ax !== undefined && ay !== undefined) {
                        accounts = await this.rollupSynch.getStateByAxAy(ax, ay);
                        if (ethAddr !== undefined && accounts !== null){
                            accounts = accounts.filter(account => {
                                if (account.ethAddress.toLowerCase() == ethAddr.toLowerCase())
                                    return account;
                            });
                        }
                    } else 
                        accounts = await this.rollupSynch.getStateByEthAddr(ethAddr);
            
                    if (accounts === null || accounts.length === 0)
                        res.status(404).send("Accounts not found");    
                    else
                        res.status(200).json(stringifyBigInts(accounts));
                        

                } catch (error) {
                    this.logger.error(`Message error: ${error.message}`);
                    this.logger.debug(`Message error: ${error.stack}`);
                    res.status(400).send("Error getting accounts information");
                }
            }
        });

        /**
         * @api {get} /encruaccounts/:address
         * @apiSampleRequest http://106.3.133.180:9000/encruaccounts/0x85a14464a960d110d157d46ee18348b07f6c8ffb50e1f736701a3e6845c94998 
         * @apiVersion 0.0.1
         * @apiGroup accounts retrieve
         * @apiDescription get account info in which the amount is encrypted by rollup address
         * @apiParam {string} address the account 's rollupaddress
         * 
         * **/
        this.app.get("/encruaccounts/:address", async (req, res) => {
            const rollupAddress = req.params.address;
            
            let compressHex;
            if (rollupAddress.startsWith("0x")) compressHex = rollupAddress.slice(2);
            else compressHex = rollupAddress;

            const buf = Buffer.from(compressHex, "hex"); 
            const point = babyJub.unpackPoint(buf);
            
            // check point is decompressed correctly
            if (!point){
                res.status(404).send("Account not found");
                return;
            }

            const ax = point[0].toString(16);
            const ay = point[1].toString(16);
            
            try {
                const info = await this.rollupSynch.getStateByAxAy(ax, ay);
                if (info === null || info.length === 0)
                    res.status(404).send("Account not found");
                else {
                    let saccounts = stringifyBigInts(info);
                    saccounts.map(e => {
                        const axBuff = Buffer.from(e.ax);
                        const axHash = ruutils.hashBuffer(axBuff);
                        let axsign = privateKey.signPoseidon(axHash).toString();
                        e.ax = '0x' + axsign;
                        const ayBuff = Buffer.from(e.ay);
                        const ayHash = ruutils.hashBuffer(ayBuff);
                        let aysign = privateKey.signPoseidon(ayHash).toString();
                        e.ay = '0x' + aysign;

                        const ethAddressBuff = Buffer.from(e.ethAddress);
                        const ethAddressHash = ruutils.hashBuffer(ethAddressBuff);
                        let ethAddresssign = privateKey.signPoseidon(ethAddressHash).toString();
                        e.ethAddress = '0x' + ethAddresssign;

                        const messBuff = Buffer.from(e.amount);
                        const messHash = ruutils.hashBuffer(messBuff);
                        let sign = privateKey.signPoseidon(messHash).toString();
                        e.amount = '0x' + sign;

                        const idx = Buffer.from(e.idx.toString());
                        const idxHash = ruutils.hashBuffer(idx);
                        let idxsign = privateKey.signPoseidon(idxHash).toString();
                        e.idx = '0x' + idxsign;

                        const rollupAddress = Buffer.from(e.rollupAddress);
                        const rollupAddressHash = ruutils.hashBuffer(rollupAddress);
                        let rollupAddresssign = privateKey.signPoseidon(rollupAddressHash).toString();
                        e.rollupAddress = '0x' + rollupAddresssign;
                    });
                        res.status(200).json(saccounts);
                }                   
            } catch (error){
                this.logger.error(`Message error: ${error.message}`);
                this.logger.debug(`Message error: ${error.stack}`);
                res.status(400).send("Error getting accounts information");
            }
        });

        /**
         * @api {get} /encaccounts
         * @apiSampleRequest http://106.3.133.180:9000/encaccounts?ethAddr=0x9664042cdd20440f160655c5c5f9335cfdc8d1b4 
         * @apiVersion 0.0.1
         * @apiGroup accounts retrieve
         * @apiDescription get account info in which the amount is encrypted by ethaddress or (ax, ay)
         * @apiParam {string} ethaddress accounts' ethaddress
         * 
         * **/
        this.app.get("/encaccounts", async (req, res) => {
            const ax = req.query.ax;
            const ay = req.query.ay;
            const ethAddr = req.query.ethAddr; 

            let accounts;

            if (ax === undefined && ay === undefined && ethAddr === undefined ){
                res.status(400).send("No filters has been submitted");
                return;
            }
                

            // Filter first by AxAy or/and ethAddress
            if ((ax !== undefined && ay === undefined) || (ax === undefined && ay !== undefined)){
                res.status(400).send("Babyjub key is not completed. Please provide both Ax and Ay");
            } else {
                try {
                    if (ax !== undefined && ay !== undefined) {
                        accounts = await this.rollupSynch.getStateByAxAy(ax, ay);
                        if (ethAddr !== undefined && accounts !== null){
                            accounts = accounts.filter(account => {
                                if (account.ethAddress.toLowerCase() == ethAddr.toLowerCase())
                                    return account;
                            });
                        }
                    } else 
                        accounts = await this.rollupSynch.getStateByEthAddr(ethAddr);
            
                    if (accounts === null || accounts.length === 0)
                        res.status(404).send("Accounts not found");    
                    else {
                        let saccounts = stringifyBigInts(accounts);
                        saccounts.map(e => {
                            const axBuff = Buffer.from(e.ax);
                            const axHash = ruutils.hashBuffer(axBuff);
                            let axsign = privateKey.signPoseidon(axHash).toString();
                            e.ax = '0x' + axsign;
                            const ayBuff = Buffer.from(e.ay);
                            const ayHash = ruutils.hashBuffer(ayBuff);
                            let aysign = privateKey.signPoseidon(ayHash).toString();
                            e.ay = '0x' + aysign;

                            const ethAddressBuff = Buffer.from(e.ethAddress);
                            const ethAddressHash = ruutils.hashBuffer(ethAddressBuff);
                            let ethAddresssign = privateKey.signPoseidon(ethAddressHash).toString();
                            e.ethAddress = '0x' + ethAddresssign;

                            const messBuff = Buffer.from(e.amount);
                            const messHash = ruutils.hashBuffer(messBuff);
                            let sign = privateKey.signPoseidon(messHash).toString();
                            e.amount = '0x' + sign;

                            const idx = Buffer.from(e.idx.toString());
                            const idxHash = ruutils.hashBuffer(idx);
                            let idxsign = privateKey.signPoseidon(idxHash).toString();
                            e.idx = '0x' + idxsign;

                            const rollupAddress = Buffer.from(e.rollupAddress);
                            const rollupAddressHash = ruutils.hashBuffer(rollupAddress);
                            let rollupAddresssign = privateKey.signPoseidon(rollupAddressHash).toString();
                            e.rollupAddress = '0x' + rollupAddresssign;
                        });
                        // console.log(saccounts);
                        res.status(200).json(saccounts);
                    }                        
                } catch (error) {
                    this.logger.error(`Message error: ${error.message}`);
                    this.logger.debug(`Message error: ${error.stack}`);
                    res.status(400).send("Error getting accounts information");
                }
            }
        });



    }
}

module.exports = {
    HttpMethods,
};