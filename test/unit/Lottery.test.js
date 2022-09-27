const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { int } = require("hardhat/internal/core/params/argumentTypes")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Unit Tests", function () {
      let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval
      const chainId = network.config.chainId

      beforeEach(async function () {
        accounts = await ethers.getSigners()
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        lottery = await ethers.getContract("Lottery", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        lotteryEntranceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
      })

      describe("constructor", function () {
        it("initializes the lottery correctly", async function () {
          const lotteryState = await lottery.getLotteryState()
          const entranceFee = await lottery.getEntranceFee()
          assert.equal(lotteryState.toString(), "0")
          assert.equal(interval, networkConfig[chainId]["interval"])
          assert.equal(entranceFee.toString(), networkConfig[chainId]["entranceFee"])
        })
      })
      describe("enterLottery", function () {
        it("reverts when you dont pay enough", async function () {
          await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__NotEnoughETHEntered")
        })
        it("records players when they enter", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          const playerFromContract = await lottery.getPlayer(0)
          assert.equal(playerFromContract, deployer)
        })
        it("emits event on enter", async function () {
          await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.emit(
            lottery,
            "LoterryEntered"
          )
        })
        it("doesnt allow entrance when lotteryState is CALCULATING", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.send("evm_mine", [])
          //We pretend to be a Chainlink Keeper
          await lottery.performUpkeep([])
          await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.revertedWith(
            "Lottery__NotOpen"
          )
        })
      })
      describe("chechUpkeep", function () {
        it("returns false if people havent entered lottery", async function () {
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.send("evm_mine", [])
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
          assert(!upkeepNeeded)
        })
        it("returns false if lottery is not open", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.send("evm_mine", [])
          await lottery.performUpkeep([])
          const lotteryState = await lottery.getLotteryState()
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
          assert.equal(lotteryState.toString(), "1")
          assert.equal(upkeepNeeded, false)
        })
        it("returns false if enough time hasn't passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x")
          assert(!upkeepNeeded)
        })
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x")
          assert(upkeepNeeded)
        })
      })
      describe("performUpkeep", function () {
        it("can only run if checkUpkeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.send("evm_mine", [])
          const tx = await lottery.performUpkeep([])
          assert(tx)
        })
        it("reverts when checkUpkeep is false", async function () {
          await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded")
        })
        it("updates the raffle state, emits an event and calls the crfCoordinator", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.send("evm_mine", [])
          const txResponse = await lottery.performUpkeep([])
          const txReceipt = await txResponse.wait(1)
          const requestId = txReceipt.events[1].args.requestId
          const lotteryState = await lottery.getLotteryState()
          assert(requestId.toNumber() > 0)
          assert(lotteryState.toString() == "1")
        })
      })
      describe("fulfillRandomWords", function () {
        beforeEach(async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
          await network.provider.send("evm_mine", [])
        })
        it("can only be called after performUpkeep", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request")
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith("nonexistent request")
        })
        it("picks a winner, restes the lottery and sends money", async function () {
          const additionalEntrants = 3
          const startingAccountIndex = 1
          const accounts = await ethers.getSigners()

          for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
            const accountConnectedLottery = lottery.connect(accounts[i])
            await accountConnectedLottery.enterLottery({ value: lotteryEntranceFee })
          }
          const startingTimeStamp = await lottery.getLatestTimeStamp()

          //perform upkeep(mock beeing link keepeer)
          //fulfillRandomWords(mock beeing the link vrf)
          // On testnet we will have to wait for the fulfillRandWords to be called(no need on hardhat)
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("Found the event!")
              try {
                const recentWinner = await lottery.getRecentWinner()
                // console.log(accounts[0].address)
                // console.log(accounts[1].address)
                // console.log(accounts[2].address)
                // console.log(accounts[3].address)
                // console.log(recentWinner)
                const lotteryState = await lottery.getLotteryState()
                const endingTimeStamp = await lottery.getLatestTimeStamp()
                const numPlayers = await lottery.getNumberOfPlayers()
                assert.equal(lotteryState.toString(), "0")
                assert(endingTimeStamp > startingTimeStamp)
                assert.equal(numPlayers.toString(), "0")
              } catch (e) {
                reject(e)
              }
              resolve()
            })
            // Setting up the listener (Promise)
            //below, we will fire the event, and the listener will pick it up and resolve
            const tx = await lottery.performUpkeep([])
            const txReceipt = await tx.wait(1)
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              lottery.address
            )
          })
        })
      })
    })
