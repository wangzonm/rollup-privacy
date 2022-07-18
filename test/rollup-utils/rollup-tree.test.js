const chai = require("chai");
const util = require("util");
const exec = util.promisify( require("child_process").exec);
const RollupTree = require("../../rollup-utils/rollup-tree");
const Scalar = require("ffjavascript").Scalar;

const { expect } = chai;

describe("Rollup tree memory", () => {
    let balanceTree;

    const id = Scalar.e(1);
    const amountDeposit = Scalar.e(2);
    const tokenId = Scalar.e(3);
    const Ax = Scalar.e(30890499764467592830739030727222305800976141688008169211302);
    const Ay = Scalar.e(19826930437678088398923647454327426275321075228766562806246);
    const ethAddress = Scalar.e("0xe0fbce58cfaa72812103f003adce3f284fe5fc7c");
    const nonce = Scalar.e(4);

    it("Create Balance tree and insert a deposit", async () => {
        balanceTree = await RollupTree.newMemRollupTree();
        const resAddId = await balanceTree.addId(id, amountDeposit, tokenId, Ax, Ay, ethAddress, nonce);

        const hashValue = "1fe3084d286a7b1f787435623b7b8b45f19a0e3ceb2e805c34633d37c8378e60";
        expect(resAddId.hashValue.toString("16")).to.be.equal(hashValue);
    });

    it("Find key exist", async () => {
        const idToFind = Scalar.e(1);
        const resFind = await balanceTree.getIdInfo(idToFind);
        const leafValue = resFind.foundObject;

        expect(leafValue.balance.toString()).to.be.equal(amountDeposit.toString());
        expect(leafValue.tokenId.toString()).to.be.equal(tokenId.toString());
        expect(leafValue.Ax.toString()).to.be.equal(Ax.toString());
        expect(leafValue.Ay.toString()).to.be.equal(Ay.toString());
        expect(leafValue.ethAddress.toString()).to.be.equal(ethAddress.toString());
        expect(leafValue.nonce.toString()).to.be.equal(nonce.toString());
    });

    it("Find key non-exist", async () => {
        const idToFind = Scalar.e(2);
        const resFind = await balanceTree.getIdInfo(idToFind);
        // eslint-disable-next-line no-prototype-builtins
        const flagObject = resFind.hasOwnProperty("foundObject");

        expect(flagObject).to.be.equal(false);
        expect(resFind.found).to.be.equal(false);
    });

    it("Update leaf", async () => {
        const newBalance = Scalar.e(5);
        await balanceTree.updateId(id, newBalance);

        const idToFind = Scalar.e(1);
        const resFind = await balanceTree.getIdInfo(idToFind);
        const leafValue = resFind.foundObject;

        expect(leafValue.balance.toString()).to.be.equal(newBalance.toString());
        expect(leafValue.nonce.toString()).to.be.equal((nonce + Scalar.e(1)).toString());
    });
});

describe("Rollup tree level db", () => {
    let balanceTree;
    const pathDb = `${__dirname}/tmp`;
    const id = Scalar.e(1);
    const amountDeposit = Scalar.e(2);
    const tokenId = Scalar.e(3);
    const Ax = Scalar.e(30890499764467592830739030727222305800976141688008169211302);
    const Ay = Scalar.e(19826930437678088398923647454327426275321075228766562806246);
    const ethAddress = Scalar.fromString("0xe0fbce58cfaa72812103f003adce3f284fe5fc7c", 16);
    const nonce = Scalar.e(4);

    after(async () => {
        await exec(`rm -rf ${pathDb}-leafs`);
        await exec(`rm -rf ${pathDb}-tree`);
    });

    it("Create Balance tree and insert a deposit", async () => {
        balanceTree = await RollupTree.newLevelDbRollupTree(pathDb);
        const resAddId = await balanceTree.addId(id, amountDeposit, tokenId, Ax, Ay, ethAddress, nonce);

        const hashValue = "1fe3084d286a7b1f787435623b7b8b45f19a0e3ceb2e805c34633d37c8378e60";
        expect(resAddId.hashValue.toString("16")).to.be.equal(hashValue);
    });

    it("Find key exist", async () => {
        const idToFind = Scalar.e(1);
        const resFind = await balanceTree.getIdInfo(idToFind);
        const leafValue = resFind.foundObject;

        expect(leafValue.balance.toString()).to.be.equal(amountDeposit.toString());
        expect(leafValue.tokenId.toString()).to.be.equal(tokenId.toString());
        expect(leafValue.Ax.toString()).to.be.equal(Ax.toString());
        expect(leafValue.Ay.toString()).to.be.equal(Ay.toString());
        expect(leafValue.ethAddress.toString()).to.be.equal(ethAddress.toString());
        expect(leafValue.nonce.toString()).to.be.equal(nonce.toString());
    });

    it("Find key non-exist", async () => {
        const idToFind = Scalar.e(2);
        const resFind = await balanceTree.getIdInfo(idToFind);
        // eslint-disable-next-line no-prototype-builtins
        const flagObject = resFind.hasOwnProperty("foundObject");

        expect(flagObject).to.be.equal(false);
        expect(resFind.found).to.be.equal(false);
    });

    it("Update leaf", async () => {
        const newBalance = Scalar.e(5);
        await balanceTree.updateId(id, newBalance);

        const idToFind = Scalar.e(1);
        const resFind = await balanceTree.getIdInfo(idToFind);
        const leafValue = resFind.foundObject;

        expect(leafValue.balance.toString()).to.be.equal(newBalance.toString());
        expect(leafValue.nonce.toString()).to.be.equal((nonce + Scalar.e(1)).toString());
    });
});
