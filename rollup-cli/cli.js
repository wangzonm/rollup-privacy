/* eslint-disable no-console */
/* eslint-disable no-use-before-define */
/* eslint-disable no-shadow */
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');

const { Writable } = require('stream');

const feeTable = require('../js/constants').fee;
const { Wallet } = require('./src/utils/wallet');
const {
    depositTx, sendTx, depositOnTopTx, withdrawTx, forceWithdrawTx,
    showAccounts, transferTx, depositAndTransferTx, showExitsBatch, approveTx,
    showStateAccount, withdrawOffChainTx, crossChainTx,
} = require('./src/utils/cli-utils');
const { error } = require('./helpers/list-errors');

const walletPathDefault = './wallet.json';
const configPathDefault = './config.json';
const noncePathDefault = './nonceJson.json';
const { version } = require('./package');

const { argv } = require('yargs') // eslint-disable-line
    .version(version)
    .usage(`
rollup-cli <command> <options>

createkeys command
=============
    rollup-cli createkeys <options>
        create new rollup wallet
    -w or --walletpath <path> (optional)
        Path to store wallet
        Default: [wallet.json]
    -m or --mnemonic <mnemonic>
        Mnemonic 12 words

printkeys command
=============
    rollup-cli printkeys <options>
        Print public keys
    You can choose:
        -w or --walletpath <path>
            Path of your wallet
        -c or --configpath <path>
            Path of your configuration file with wallet path
            Default: config.json

setparam command
=============
    rollup-cli setparam
        Set configuration file parameters
    --pm or --param <parameter>
        Parameter to set
    -v or --value <value of parameter>
        Value of the parameter
    -c or --configpath <parameter file> (optional)
        Path of your configuration file
        Default: config.json

offchainTx command
=============
    rollup-cli offchaintx <options>
    -t or --type [send | withdrawOffChain | depositOffChain | crosschain]
        Defines which transaction should be done
    -ci or --chainidx <chain account idx>
    -a or --amount <amount>
        Amount to send
    --tk or --tokenid <token ID>
    -r or --recipient <recipient babyJub compressed publick key>
    -e or --fee <% fee>
    --ethaddr or --ethereumaddress <ethereum address>
        only used in deposit offchain transaction
    --no or --nonce <nonce TX> (optional)
    -c or --configpath <parameter file> (optional)
        Path of your configuration file
        Default: config.json

onchainTx command
=============
    rollup-cli onchaintx <options>
    --type or -t [deposit | depositontop | withdraw | forcewithdraw | transfer | depositandtransfer | approve]
        Defines which transaction should be done
    -l or --loadamount <amount>
        Amount to deposit within the rollup
    -a or --amount <amount>
        Amount to move inside rollup
    --tk or --tokenid <token ID>
    -n or --numexitbatch <num exit batch>
    -r or --recipient <recipient babyJub Compressed publick key>
    -c or --configpath <parameter file> (optional)
        Path of your configuration file
        Default: config.json
    --gaslimit or --gl <number>
        Gas limit at the time to send a transaction
    --gasmultiplier or --gm <number>
        GasPrice used = default gas price * gasmultiplier

info command
=============
    rollup-cli info <options>
    -t or --type [accounts | exits]
        get accounts information
        get batches where an account has been done an exit transaction 
    -f or --filter [babyjubjub | ethereum | tokenid]
        only used on account information
    --tk or --tokenid <token ID>
        filters by token id
    -c or --configpath <parameter file> (optional)
        Path of your configuration file
        Default: config.json
      `)
    .help('h')
    .alias('h', 'help')
    .alias('p', 'passphrase')
    .alias('w', 'walletpath')
    .alias('c', 'configpath')
    .alias('m', 'mnemonic')
    .alias('pm', 'param')
    .alias('v', 'value')
    .alias('t', 'type')
    .alias('r', 'recipient')
    .alias('e', 'fee')
    .alias('f', 'filter')
    .alias('a', 'amount')
    .alias('l', 'loadamount')
    .alias('tk', 'tokenid')
    .alias('ethaddr', 'ethereumaddress')
    .alias('n', 'numexitbatch')
    .alias('no', 'nonce')
    .alias('gl', 'gaslimit')
    .alias('gm', 'gasmultiplier')
    .epilogue('Rollup client cli tool');

let walletpath = (argv.walletpath) ? argv.walletpath : 'nowalletpath';
const mnemonic = (argv.mnemonic) ? argv.mnemonic : 'nomnemonic';

const param = (argv.param) ? argv.param : 'noparam';
const value = (argv.value) ? argv.value : 'novalue';
const configPath = (argv.configpath) ? argv.configpath : configPathDefault;

const type = (argv.type) ? argv.type : 'notype';
const recipient = (argv.recipient) ? argv.recipient : 'norecipient';
const amount = (argv.amount) ? argv.amount.toString() : -1;
const loadamount = (argv.loadamount) ? argv.loadamount.toString() : -1;
const tokenId = (argv.tokenid || argv.tokenid === 0) ? argv.tokenid : 'notokenid';
const ethAddr = (argv.ethereumaddress || argv.ethereumaddress === 0) ? argv.ethereumaddress : 'noethaddr';
const fee = argv.fee ? argv.fee.toString() : 'nofee';
const numExitBatch = argv.numexitbatch ? argv.numexitbatch.toString() : 'nonumexitbatch';
const filter = argv.filter ? argv.filter : 'nofilter';
const nonce = (argv.nonce || argv.nonce === 0) ? argv.nonce.toString() : undefined;
const gasLimit = (argv.gaslimit) ? argv.gaslimit : 5000000;
const gasMultiplier = (argv.gasmultiplier) ? argv.gasmultiplier : 1;
const chainidx = (argv.chainidx) ? argv.chainidx : 'nochainidx';

(async () => {
    try {
        let actualConfig = {};
        if (argv._[0].toUpperCase() === 'CREATEKEYS') {
            let encWallet;
            let wallet;
            const passphrase = await getPassword();
            console.log('repeat your password please');
            const passphrase2 = await getPassword();
            if (passphrase !== passphrase2) {
                throw new Error(error.PASSWORD_NOT_MATCH);
            }
            if (walletpath === 'nowalletpath') {
                walletpath = walletPathDefault;
            }
            if (mnemonic !== 'nomnemonic') {
                if (mnemonic.split(' ').length !== 12) {
                    console.log('Invalid Mnemonic, enter the mnemonic between "" \n');
                    throw new Error(error.INVALID_MNEMONIC);
                } else {
                    console.log('creating rollup wallet from mnemonic...\n');
                    wallet = await Wallet.fromMnemonic(mnemonic);
                    encWallet = await wallet.toEncryptedJson(passphrase);
                    printKeys(encWallet);
                }
            } else {
                console.log('creating new rollup wallet...\n');
                wallet = await Wallet.createRandom();
                encWallet = await wallet.toEncryptedJson(passphrase);
                printKeys(encWallet);
            }
            fs.writeFileSync(walletpath, JSON.stringify(encWallet, null, 1), 'utf-8');
            process.exit(0);
        } else if (argv._[0].toUpperCase() === 'SETPARAM') {
            if (fs.existsSync(configPath)) {
                actualConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
            if (param.toUpperCase() === 'PATHWALLET' && value !== 'novalue') {
                actualConfig.wallet = value;
            } else if (param.toUpperCase() === 'ABIROLLUPPATH' && value !== 'novalue') {
                actualConfig.abiRollupPath = value;
            } else if (param.toUpperCase() === 'URLOPERATOR' && value !== 'novalue') {
                actualConfig.urlOperator = value;
            } else if (param.toUpperCase() === 'NODEETH' && value !== 'novalue') {
                actualConfig.nodeEth = value;
            } else if (param.toUpperCase() === 'ADDRESSROLLUP' && value !== 'novalue') {
                actualConfig.addressRollup = value;
            } else if (param.toUpperCase() === 'CONTROLLERADDRESS' && value !== 'novalue') {
                actualConfig.controllerAddress = value;
            } else if (param.toUpperCase() === 'ADDRESSTOKENS' && value !== 'novalue') {
                actualConfig.addressTokens = value;
            } else if (param.toUpperCase() === 'ABIERC20PATH' && value !== 'novalue') {
                actualConfig.abiTokensPath = value;
            } else if (param === 'noparam') {
                console.log('Please provide a param\n');
                throw new Error(error.NO_PARAM);
            } else if (value === 'novalue') {
                console.log('Please provide a value\n\n');
                throw new Error(error.NO_VALUE);
            } else {
                console.log('Invalid param\n');
                throw new Error(error.INVALID_PARAM);
            }
            fs.writeFileSync(configPath, JSON.stringify(actualConfig, null, 1), 'utf-8');
            process.exit(0);
        } else if (argv._[0].toUpperCase() === 'PRINTKEYS') {
            if (walletpath === 'nowalletpath') {
                if (fs.existsSync(configPath)) {
                    actualConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    if (actualConfig.wallet !== undefined) {
                        walletpath = actualConfig.wallet;
                    }
                }
            }
            if (walletpath === 'nowalletpath') {
                walletpath = walletPathDefault;
            }
            if (!fs.existsSync(walletpath)) {
                console.log('Please provide a valid path\n');
                throw new Error(error.INVALID_PATH);
            }
            const readWallet = JSON.parse(fs.readFileSync(walletpath, 'utf-8'));
            printKeys(readWallet);
            process.exit(0);
        } else if (argv._[0].toUpperCase() === 'OFFCHAINTX') {
            if (type === 'notype') {
                console.log('It is necessary to specify the type of action\n');
                throw new Error(error.NO_TYPE);
            } else {
                const passphrase = await getPassword();
                if (fs.existsSync(configPath)) {
                    actualConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                } else {
                    console.log('No params file was submitted\n');
                    throw new Error(error.NO_PARAMS_FILE);
                }
                checkparamsOffchain(type, actualConfig);
                const wallet = JSON.parse(fs.readFileSync(actualConfig.wallet, 'utf-8'));
                const { urlOperator } = actualConfig;
                let { noncePath } = actualConfig;
                if (noncePath === undefined) {
                    noncePath = noncePathDefault;
                }
                let actualNonce;
                if (fs.existsSync(noncePath)) {
                    actualNonce = JSON.parse(fs.readFileSync(noncePath, 'utf8'));
                }
                if (type.toUpperCase() === 'SEND') {
                    const res = await sendTx(urlOperator, recipient, amount, wallet, passphrase, tokenId,
                        feeTable[fee], nonce, actualNonce);
                    console.log(`Status: ${res.status}, Nonce: ${res.nonce}`);
                    if (res.status.toString() === '200') {
                        fs.writeFileSync(noncePath, JSON.stringify(res.nonceObject, null, 1), 'utf-8');
                    }
                } else if (type.toUpperCase() === 'WITHDRAWOFFCHAIN') {
                    const res = await withdrawOffChainTx(urlOperator, amount, wallet, passphrase, tokenId, feeTable[fee],
                        nonce, actualNonce);
                    console.log(`Status: ${res.status}, Nonce: ${res.nonce}`);
                    if (res.status.toString() === '200') {
                        fs.writeFileSync(noncePath, JSON.stringify(res.nonceObject, null, 1), 'utf-8');
                    }
                } else if (type.toUpperCase() === 'DEPOSITOFFCHAIN') {
                    checkparam(ethAddr, 'noethaddr', 'Ethereum address');
                    const res = await sendTx(urlOperator, recipient, amount, wallet, passphrase, tokenId, feeTable[fee],
                        nonce, actualNonce, ethAddr);
                    console.log(`Status: ${res.status}, Nonce: ${res.nonce}`);
                    if (res.status.toString() === '200') {
                        fs.writeFileSync(noncePath, JSON.stringify(res.nonceObject, null, 1), 'utf-8');
                    }
                } else if (type.toUpperCase() === 'CROSSCHAIN'){
                    const res = await crossChainTx(urlOperator, chainidx, amount, wallet, passphrase, tokenId, feeTable[fee],
                        nonce, actualNonce);
                    console.log(`Status: ${res.status}, Nonce: ${res.nonce}`);
                    if (res.status.toString() === '200') {
                        fs.writeFileSync(noncePath, JSON.stringify(res.nonceObject, null, 1), 'utf-8');
                    }
                } else {
                    throw new Error(error.INVALID_TYPE);
                }
            }
            process.exit(0);
        } else if (argv._[0].toUpperCase() === 'ONCHAINTX') {
            if (type !== 'notype' && type.toUpperCase() !== 'DEPOSIT' && type.toUpperCase() !== 'DEPOSITONTOP' && type.toUpperCase() !== 'WITHDRAW'
            && type.toUpperCase() !== 'FORCEWITHDRAW' && type.toUpperCase() !== 'TRANSFER' && type.toUpperCase() !== 'DEPOSITANDTRANSFER'
            && type.toUpperCase() !== 'APPROVE') {
                throw new Error(error.INVALID_KEY_TYPE);
            } else if (type === 'notype') {
                console.log('It is necessary to specify the type of action\n');
                throw new Error(error.NO_TYPE);
            } else {
                const passphrase = await getPassword();
                if (fs.existsSync(configPath)) {
                    actualConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                } else {
                    console.log('No params file was submitted\n');
                    throw new Error(error.NO_PARAMS_FILE);
                }
                checkparamsOnchain(type, actualConfig);
                const abi = JSON.parse(fs.readFileSync(actualConfig.abiRollupPath, 'utf-8'));
                const wallet = JSON.parse(fs.readFileSync(actualConfig.wallet, 'utf-8'));

                if (type.toUpperCase() === 'DEPOSIT') {
                    const Tx = await depositTx(actualConfig.nodeEth, actualConfig.addressRollup, loadamount,
                        tokenId, wallet, passphrase, actualConfig.controllerAddress, abi, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else if (type.toUpperCase() === 'DEPOSITONTOP') {
                    const Tx = await depositOnTopTx(actualConfig.nodeEth, actualConfig.addressRollup, loadamount,
                        tokenId, recipient, wallet, passphrase, abi, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else if (type.toUpperCase() === 'FORCEWITHDRAW') {
                    const Tx = await forceWithdrawTx(actualConfig.nodeEth, actualConfig.addressRollup, tokenId, amount,
                        wallet, passphrase, abi, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else if (type.toUpperCase() === 'WITHDRAW') {
                    const Tx = await withdrawTx(actualConfig.nodeEth, actualConfig.addressRollup, tokenId, wallet,
                        passphrase, abi, actualConfig.urlOperator, numExitBatch, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else if (type.toUpperCase() === 'TRANSFER') {
                    const Tx = await transferTx(actualConfig.nodeEth, actualConfig.addressRollup, amount,
                        tokenId, recipient, wallet, passphrase, abi, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else if (type.toUpperCase() === 'DEPOSITANDTRANSFER') {
                    const Tx = await depositAndTransferTx(actualConfig.nodeEth, actualConfig.addressRollup, loadamount, amount,
                        tokenId, recipient, wallet, passphrase, actualConfig.controllerAddress, abi, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else if (type.toUpperCase() === 'APPROVE') {
                    const abiTokens = JSON.parse(fs.readFileSync(actualConfig.abiTokensPath, 'utf-8'));
                    const Tx = await approveTx(actualConfig.nodeEth, actualConfig.addressTokens, amount, actualConfig.addressRollup,
                        wallet, passphrase, abiTokens, gasLimit, gasMultiplier);
                    console.log(JSON.stringify({ 'Transaction Hash': Tx.hash }));
                } else {
                    throw new Error(error.INVALID_TYPE);
                }
            }
            process.exit(0);
        } else if (argv._[0].toUpperCase() === 'INFO') {
            if (type === 'notype') {
                console.log('It is necessary to specify the type of information to print\n');
                throw new Error(error.NO_TYPE);
            } else {
                if (fs.existsSync(configPath)) {
                    actualConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                } else {
                    console.log('No params file was submitted\n');
                    throw new Error(error.NO_PARAMS_FILE);
                }
                checkParamsInfo(type, actualConfig);
                if (type.toUpperCase() === 'ACCOUNTS') {
                    const wallet = JSON.parse(fs.readFileSync(actualConfig.wallet, 'utf-8'));
                    const filters = {};
                    if (filter.toUpperCase() === 'BABYJUBJUB') {
                        filters.ax = wallet.babyjubWallet.public.ax;
                        filters.ay = wallet.babyjubWallet.public.ay;
                        const res = await showAccounts(actualConfig.urlOperator, filters);
                        console.log(`Accounts found: \n ${JSON.stringify(res.data, null, 1)}`);
                    } else if (filter.toUpperCase() === 'ETHEREUM') {
                        if (wallet.ethWallet.address.startsWith('0x')) {
                            filters.ethAddr = wallet.ethWallet.address;
                        } else {
                            filters.ethAddr = `0x${wallet.ethWallet.address}`;
                        }
                        const res = await showAccounts(actualConfig.urlOperator, filters);
                        console.log(`Accounts found: \n ${JSON.stringify(res.data, null, 1)}`);
                    } else if (filter.toUpperCase() === 'TOKENID') {
                        checkparam(tokenId, 'notokenid', 'token ID');
                        const { ax } = wallet.babyjubWallet.public;
                        const { ay } = wallet.babyjubWallet.public;
                        const res = await showStateAccount(actualConfig.urlOperator, tokenId, ax, ay);
                        console.log(`Accounts found: \n ${JSON.stringify(res.data, null, 1)}`);
                    } else {
                        throw new Error(error.INVALID_FILTER);
                    }
                } else if (type.toUpperCase() === 'EXITS') {
                    const wallet = JSON.parse(fs.readFileSync(actualConfig.wallet, 'utf-8'));
                    const { ax } = wallet.babyjubWallet.public;
                    const { ay } = wallet.babyjubWallet.public;
                    const res = await showExitsBatch(actualConfig.urlOperator, tokenId, ax, ay);
                    console.log(`${chalk.yellow('Number exits batch found: ')}\n${res.data}`);
                }
            }
            process.exit(0);
        } else {
            throw new Error(error.INVALID_COMMAND);
        }
    } catch (err) {
        console.error(`${chalk.red('Error information: ')}`);
        console.log(err.message);
        const cliError = Object.keys(error)[err.message];
        if (cliError) console.log(Object.keys(error)[err.message]);
        process.exit(err.message);
    }
})();

function checkparamsOnchain(type, actualConfig) {
    switch (type.toUpperCase()) {
    case 'DEPOSIT':
        checkparam(loadamount, -1, 'loadamount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiRollupPath, undefined, 'abi path (with setparam command)');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        break;
    case 'DEPOSITONTOP':
        checkparam(loadamount, -1, 'loadamount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiRollupPath, undefined, 'abi path (with setparam command)');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(recipient, 'norecipient', 'recipient');
        break;
    case 'WITHDRAW':
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiRollupPath, undefined, 'abi path (with setparam command)');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        checkparam(numExitBatch, 'nonumexitbatch', 'num exit batch');
        checkparam(tokenId, 'notokenid', 'token ID');
        break;
    case 'FORCEWITHDRAW':
        checkparam(amount, -1, 'amount');
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiRollupPath, undefined, 'abi path (with setparam command)');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(tokenId, 'notokenid', 'token ID');
        break;
    case 'TRANSFER':
        checkparam(amount, -1, 'amount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiRollupPath, undefined, 'abi path (with setparam command)');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(recipient, 'norecipient', 'recipient');
        break;
    case 'DEPOSITANDTRANSFER':
        checkparam(amount, -1, 'amount');
        checkparam(loadamount, -1, 'loadamount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiRollupPath, undefined, 'abi path (with setparam command)');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(recipient, 'norecipient', 'recipient');
        break;
    case 'APPROVE':
        checkparam(amount, -1, 'amount');
        checkparam(actualConfig.nodeEth, undefined, 'node (with setparam command)');
        checkparam(actualConfig.addressRollup, undefined, 'contract address (with setparam command)');
        checkparam(actualConfig.abiTokensPath, undefined, 'abi tokens path in config.json');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        break;
    default:
        throw new Error(error.INVALID_TYPE);
    }
}

function checkparamsOffchain(type, actualConfig) {
    switch (type.toUpperCase()) {
    case 'SEND':
        checkparam(amount, -1, 'amount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(recipient, 'norecipient', 'recipient');
        checkparam(fee, 'nofee', 'fee');
        checkFees(fee);
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        break;
    case 'WITHDRAWOFFCHAIN':
        checkparam(amount, -1, 'amount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(fee, 'nofee', 'fee');
        checkFees(fee);
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        break;
    case 'DEPOSITOFFCHAIN':
        checkparam(amount, -1, 'amount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(fee, 'nofee', 'fee');
        checkFees(fee);
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        checkparam(ethAddr, 'noethaddr', 'Ethereum address');
        break;
    case 'CROSSCHAIN':
        checkparam(amount, -1, 'amount');
        checkparam(tokenId, 'notokenid', 'token ID');
        checkparam(chainidx, 'nochainidx', 'chainidx');
        checkparam(fee, 'nofee', 'fee');
        checkFees(fee);
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        break;
    default:
        throw new Error(error.INVALID_TYPE);
    }
}

function checkParamsInfo(type, actualConfig) {
    switch (type.toUpperCase()) {
    case 'ACCOUNTS':
        checkparam(filter, 'nofilter', 'babyjubjub or ethereum or tokenid');
        checkparam(actualConfig.wallet, undefined, 'wallet path (with setparam command)');
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        break;
    case 'EXITS':
        checkparam(actualConfig.urlOperator, undefined, 'operator (with setparam command)');
        checkparam(tokenId, 'notokenid', 'token ID');
        break;
    default:
        throw new Error(error.INVALID_TYPE);
    }
}

function checkparam(param, def, name) {
    if (param === def) {
        console.log(`It is necessary to specify ${name}\n`);
        throw new Error(error.NO_PARAM);
    }
}

function checkFees(fee) {
    if (feeTable[fee] === undefined) {
        console.log(`Fee selected ${fee} is not valid`);
        console.log('Please, select a valid fee amoung among the next values:');
        console.log(feeTable);
        throw new Error(error.INVALID_FEE);
    }
}


function getPassword() {
    return new Promise((resolve) => {
        const mutableStdout = new Writable({
            write(chunk, encoding, callback) {
                if (!this.muted) { process.stdout.write(chunk, encoding); }
                callback();
            },
        });
        const rl = readline.createInterface({
            input: process.stdin,
            output: mutableStdout,
            terminal: true,
        });
        rl.question('Password: ', (password) => {
            rl.close();
            console.log('');
            resolve(password);
        });
        mutableStdout.muted = true;
    });
}

function printKeys(wallet) {
    console.log(`${chalk.yellow('Ethereum public key:')}`);
    console.log(`  Address: ${chalk.blue(`0x${wallet.ethWallet.address}`)}\n`);
    console.log(`${chalk.yellow('Rollup public key:')}`);
    console.log(`  Rollup address: ${chalk.blue(`0x${wallet.babyjubWallet.publicCompressed}`)}`);
    console.log('  Babyjubjub points: ');
    console.log(`    Ax: ${chalk.blue(`0x${wallet.babyjubWallet.public.ax}`)}`);
    console.log(`    Ay: ${chalk.blue(`0x${wallet.babyjubWallet.public.ay}`)}`);
}
