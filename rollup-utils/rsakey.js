const cryptoLib = require("crypto");
const walletUtils = require("./babyjub-wallet-utils");
const NodeRSA = require('node-rsa');


class RsaKey {
    constructor(){
        let key = new NodeRSA();
        key.generateKeyPair(1024);
        this.privateKey = key.exportKey('pkcs1-private-der');
        this.publickey = key.exportKey('pkcs1-public-der');
    }

    getPubKey(){
        return this.publickey;
    }

    getPrivateKey(){
        return this.privateKey;
    }
     /**
     * Initilize rsa private key from json wallet
     * @param {Object} json - json rsakey json format 
     * @param {String} pass - passphrase to encryot private key
     * @returns {BabyJubWallet} - rsakey 
     */
    static fromEncryptedJson(json, pass) {
        const jsonObject = JSON.parse(json);
        const { crypto } = jsonObject;
        const { ciphertext } = jsonObject;
        const { kdfparams } = jsonObject;
        const { mac } = jsonObject;

        const keyStr = walletUtils.passToKey(pass, kdfparams.salt,
            kdfparams.i, kdfparams.dklen, kdfparams.digest);
        walletUtils.checkPass(keyStr, ciphertext, mac);
        const keyBuff = Buffer.from(keyStr, "base64");
        const ivBuff = Buffer.from(crypto.cipherparams.iv, "base64");
        const privKeyStr = walletUtils.decrypt(keyBuff, ciphertext, crypto.cipher, ivBuff);
        const privKeyBuf = Buffer.from(privKeyStr, "base64");
        return privKeyBuf;
    }

    /**
     * Json rsakey
     * @param {String} pass - Password to encrypt private key 
     * @param {Number} dklen - key length
     * @param {String} digest - hash to use 
     * @param {Number} iterations - number of iterations
     * @param {String} salt - 16 bytes encoded as base64 string
     * @param {String} algo - algorithm used
     * @param {String} iv - initilaization vector
     * @returns {Object} - json object wallet babyjubjub
     */
    toEncryptedJson(pass, dklen = 24, digest = "sha256",
        iterations = 256, salt = null, algo = "aes-192-cbc", iv = null) {
        if (salt === null) {
            salt = cryptoLib.randomBytes(16).toString("base64");
        }

        if (iv === null) {
            iv = cryptoLib.randomBytes(16);
        } else if (iv.constructor === String) {
            iv = Buffer.from(iv, "base64");
        }

        // calculate the key to enc by pass
        const keyStr = walletUtils.passToKey(pass, salt, iterations, dklen, digest);
        const keyBuff = Buffer.from(keyStr, "base64");
        const privKeyStr = this.privateKey.toString("base64");
        const encryptDataStr = walletUtils.encrypt(keyBuff, privKeyStr, algo, iv);
        const macCalc = walletUtils.getMac(keyBuff, Buffer.from(encryptDataStr, "base64"));

        const obj = {
            public: this.publickey.toString('hex'),
            crypto: {
                cipher: algo,
                cipherparams: {
                    iv: iv.toString("base64"),
                },
            },
            ciphertext: encryptDataStr,
            kdfparams: {
                dklen,
                digest,
                i: iterations,
                salt,
            },
            mac: macCalc,
        };
        return JSON.stringify(obj);
    }


}
module.exports = {
    RsaKey,
};