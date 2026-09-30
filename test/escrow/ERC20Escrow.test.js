import { expect } from "chai";
import { network } from "hardhat";

describe("ERC20Escrow", function () {
  const amount = 1_000n;
  let ethers;
  let buyer;
  let seller;
  let other;
  let token;
  let escrow;

  async function createEscrow(options = {}) {
    const escrowToken = options.token ?? token;
    const escrowAmount = options.amount ?? amount;
    const escrowSeller = options.seller ?? seller;
    const id = await escrow.nextEscrowId();
    await escrow
      .connect(buyer)
      .createEscrow(escrowSeller.address, await escrowToken.getAddress(), escrowAmount);
    return id;
  }

  async function fundEscrow(id, escrowToken = token) {
    await escrowToken.connect(buyer).approve(await escrow.getAddress(), amount);
    return escrow.connect(buyer).fund(id);
  }

  beforeEach(async function () {
    ({ ethers } = await network.create());
    [buyer, seller, other] = await ethers.getSigners();
    token = await ethers.deployContract("MockERC20", ["Mock USD Coin", "mUSDC", 0]);
    escrow = await ethers.deployContract("ERC20Escrow");
    await token.mint(buyer.address, amount * 20n);
  });

  it("creates an escrow for the buyer, seller, token, and amount", async function () {
    const id = await escrow.nextEscrowId();
    const tx = escrow
      .connect(buyer)
      .createEscrow(seller.address, await token.getAddress(), amount);
    await expect(tx).to.emit(escrow, "EscrowCreated").withArgs(
      id,
      buyer.address,
      seller.address,
      await token.getAddress(),
      amount,
    );

    const created = await escrow.escrows(id);
    expect(created.buyer).to.equal(buyer.address);
    expect(created.seller).to.equal(seller.address);
    expect(created.token).to.equal(await token.getAddress());
    expect(created.amount).to.equal(amount);
    expect(created.status).to.equal(0);
  });

  it("funds the escrow with the exact token amount", async function () {
    const id = await createEscrow();
    await token.connect(buyer).approve(await escrow.getAddress(), amount);

    await expect(escrow.connect(buyer).fund(id))
      .to.emit(escrow, "EscrowFunded")
      .withArgs(id, buyer.address, await token.getAddress(), amount);

    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
    expect((await escrow.escrows(id)).status).to.equal(1);
  });

  it("releases the escrowed tokens to the seller", async function () {
    const id = await createEscrow();
    await fundEscrow(id);

    await expect(escrow.connect(buyer).release(id))
      .to.emit(escrow, "EscrowReleased")
      .withArgs(id, buyer.address, seller.address, await token.getAddress(), amount);

    expect(await token.balanceOf(seller.address)).to.equal(amount);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
    expect((await escrow.escrows(id)).status).to.equal(2);
  });

  it("refunds the escrowed tokens to the buyer", async function () {
    const id = await createEscrow();
    await fundEscrow(id);
    const buyerBalanceBefore = await token.balanceOf(buyer.address);

    await expect(escrow.connect(buyer).refund(id))
      .to.emit(escrow, "EscrowRefunded")
      .withArgs(id, buyer.address, await token.getAddress(), amount);

    expect(await token.balanceOf(buyer.address)).to.equal(buyerBalanceBefore + amount);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
    expect((await escrow.escrows(id)).status).to.equal(3);
  });

  it("prevents the seller from releasing or refunding", async function () {
    const id = await createEscrow();
    await fundEscrow(id);

    await expect(escrow.connect(seller).release(id))
      .to.be.revertedWithCustomError(escrow, "UnauthorizedBuyer")
      .withArgs(seller.address);
    await expect(escrow.connect(seller).refund(id))
      .to.be.revertedWithCustomError(escrow, "UnauthorizedBuyer")
      .withArgs(seller.address);
  });

  it("prevents an unrelated address from releasing or refunding", async function () {
    const id = await createEscrow();
    await fundEscrow(id);

    await expect(escrow.connect(other).release(id))
      .to.be.revertedWithCustomError(escrow, "UnauthorizedBuyer")
      .withArgs(other.address);
    await expect(escrow.connect(other).refund(id))
      .to.be.revertedWithCustomError(escrow, "UnauthorizedBuyer")
      .withArgs(other.address);
  });

  it("rejects release and refund before funding", async function () {
    const id = await createEscrow();

    await expect(escrow.connect(buyer).release(id))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(0);
    await expect(escrow.connect(buyer).refund(id))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(0);
  });

  it("rejects release after refund and refund after release", async function () {
    const refundedId = await createEscrow();
    await fundEscrow(refundedId);
    await escrow.connect(buyer).refund(refundedId);
    await expect(escrow.connect(buyer).release(refundedId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(3);
    await expect(escrow.connect(buyer).refund(refundedId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(3);

    const releasedId = await createEscrow();
    await fundEscrow(releasedId);
    await escrow.connect(buyer).release(releasedId);
    await expect(escrow.connect(buyer).refund(releasedId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(2);
    await expect(escrow.connect(buyer).release(releasedId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(2);
  });

  it("rejects funding when the buyer balance is insufficient", async function () {
    const tooMuch = amount * 100n;
    const id = await createEscrow({ amount: tooMuch });
    await token.connect(buyer).approve(await escrow.getAddress(), tooMuch);

    await expect(escrow.connect(buyer).fund(id)).to.be.revert(ethers);
    expect((await escrow.escrows(id)).status).to.equal(0);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
  });

  it("rejects fee-on-transfer funding that delivers less than the agreed amount", async function () {
    const feeToken = await ethers.deployContract("MockERC20", ["Fee Token", "FEE", 100]);
    const feeTokenAmount = 10_000n;
    const id = await createEscrow({ token: feeToken, amount: feeTokenAmount });
    await feeToken.mint(buyer.address, feeTokenAmount);
    await feeToken.connect(buyer).approve(await escrow.getAddress(), feeTokenAmount);

    await expect(escrow.connect(buyer).fund(id))
      .to.be.revertedWithCustomError(escrow, "IncorrectFundingAmount")
      .withArgs(feeTokenAmount, 9_900n);
    expect((await escrow.escrows(id)).status).to.equal(0);
    expect(await feeToken.balanceOf(await escrow.getAddress())).to.equal(0n);
  });

  it("rejects settlement when the recipient would receive less than the agreed amount", async function () {
    const id = await createEscrow();
    await fundEscrow(id);
    await token.setFeeBps(100);

    await expect(escrow.connect(buyer).release(id))
      .to.be.revertedWithCustomError(escrow, "IncorrectTransferAmount")
      .withArgs(amount, 990n);
    expect((await escrow.escrows(id)).status).to.equal(1);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);

    await token.setFeeBps(0);
    await escrow.connect(buyer).refund(id);
    expect(await token.balanceOf(buyer.address)).to.equal(amount * 20n);
  });

  it("emits create, fund, release, and refund events", async function () {
    const releasedId = await createEscrow();
    await expect(fundEscrow(releasedId)).to.emit(escrow, "EscrowFunded");
    await expect(escrow.connect(buyer).release(releasedId)).to.emit(escrow, "EscrowReleased");

    const refundedId = await createEscrow();
    await expect(fundEscrow(refundedId)).to.emit(escrow, "EscrowFunded");
    await expect(escrow.connect(buyer).refund(refundedId)).to.emit(escrow, "EscrowRefunded");
  });

  it("keeps multiple escrow balances independent", async function () {
    const secondSeller = other;
    const secondToken = await ethers.deployContract("MockERC20", ["Second Token", "SEC", 0]);
    const secondAmount = 2_500n;
    const firstId = await createEscrow();
    const secondId = await createEscrow({
      token: secondToken,
      amount: secondAmount,
      seller: secondSeller,
    });

    await secondToken.mint(buyer.address, secondAmount);
    await token.connect(buyer).approve(await escrow.getAddress(), amount);
    await secondToken.connect(buyer).approve(await escrow.getAddress(), secondAmount);
    await escrow.connect(buyer).fund(firstId);
    await escrow.connect(buyer).fund(secondId);
    await escrow.connect(buyer).release(firstId);
    await escrow.connect(buyer).refund(secondId);

    expect(await token.balanceOf(seller.address)).to.equal(amount);
    expect(await token.balanceOf(secondSeller.address)).to.equal(0n);
    expect(await secondToken.balanceOf(buyer.address)).to.equal(secondAmount);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
    expect(await secondToken.balanceOf(await escrow.getAddress())).to.equal(0n);
    expect((await escrow.escrows(firstId)).status).to.equal(2);
    expect((await escrow.escrows(secondId)).status).to.equal(3);
  });

  it("rejects direct native currency", async function () {
    await expect(
      buyer.sendTransaction({ to: await escrow.getAddress(), value: 1n }),
    ).to.be.revertedWithCustomError(escrow, "NativeCurrencyNotAccepted");
  });
});
