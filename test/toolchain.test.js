import { expect } from "chai";
import { network } from "hardhat";

describe("Hardhat toolchain", function () {
  it("compiles and runs a local Solidity contract", async function () {
    const { ethers } = await network.getOrCreate();
    const check = await ethers.deployContract("ToolchainCheck");

    expect(await check.answer()).to.equal(42n);
  });
});
