const hardhat = require('hardhat');
const fs = require('fs');

const ethers = hardhat.ethers;

async function deploy() {
  const accounts = await ethers.getSigners();

  console.log('=====================================================================================');
  console.log('ACCOUNTS:');
  console.log('=====================================================================================');
  if (process.env.TESTING === 'true') {
    const privateKeys = hardhat.config.networks.hardhat.accounts;
    for (let i = 0; i < accounts.length; i++) {
      console.log(` Account ${i}:`);
      console.log(`   Address:     ${accounts[i].address}`);
      console.log(`   Private Key: ${privateKeys[i].privateKey}`);
    }
  } else {
    for (let i = 0; i < accounts.length; i++) {
      console.log(` Account ${i}: ${accounts[i].address}`);
    }
  }

  const provider = new ethers.providers.JsonRpcProvider(hardhat.network.config.url);
  const admin = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

  console.log('=====================================================================================');
  console.log(`DEPLOYED ACCOUNT:    \t${admin.address}`);
  console.log(`DEPLOYED CONTRACT TO:\t${hardhat.network.name}`);
  console.log('=====================================================================================');

  let cashAddress;
  if (process.env.TESTING === 'true') {
    const Cash = await ethers.getContractFactory('MockCash');
    const cash = await Cash.connect(admin).deploy();
    await cash.deployTransaction.wait();
    console.log('Cash is deployed to address:                 \t', cash.address);

    for (let account of accounts) {
      await cash.connect(admin).mintFor(account.address, '1000000000000000000');
    }

    cashAddress = cash.address;
  } else {
    cashAddress = hardhat.network.config.cashAddress;
  }

  const RandomAlgorithm = await ethers.getContractFactory('RandomAlgorithm');
  const randomAlgorithm = await RandomAlgorithm.connect(admin).deploy();
  await randomAlgorithm.deployTransaction.wait();
  console.log('Random Algorithm is deployed to address:     \t', randomAlgorithm.address);

  const DominoManager = await ethers.getContractFactory('DominoManager');
  const dominoManager = await DominoManager.connect(admin).deploy(cashAddress, randomAlgorithm.address);
  await dominoManager.deployTransaction.wait();
  console.log('Domino Manager is deployed to address:       \t', dominoManager.address);

  const AuctionManager = await ethers.getContractFactory('AuctionManager');
  const auctionManager = await AuctionManager.connect(admin).deploy(cashAddress, dominoManager.address);
  await auctionManager.deployTransaction.wait();
  console.log('Auction Manager is deployed to address:      \t', auctionManager.address);

  const contractAddresses = {
    'Cash': cashAddress,
    'RandomAlgorithm': randomAlgorithm.address,
    'DominoManager': dominoManager.address,
    'AuctionManager': auctionManager.address,
  };
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
