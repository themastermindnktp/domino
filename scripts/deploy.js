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
    console.log('Cash is deployed to address:             \t', cash.address);

    for (let account of accounts) {
      await cash.connect(admin).mintFor(account.address, '1000000000000000000');
    }

    cashAddress = cash.address;
  } else {
    cashAddress = hardhat.network.config.cashAddress;
  }

  const Random = await ethers.getContractFactory('Random');
  const random = await Random.connect(admin).deploy();
  await random.deployTransaction.wait();
  console.log('Random is deployed to address:           \t', random.address);

  const Domino = await ethers.getContractFactory('Domino');
  const domino = await Domino.connect(admin).deploy(cashAddress, random.address);
  await domino.deployTransaction.wait();
  console.log('Domino is deployed to address:           \t', domino.address);

  const Auction = await ethers.getContractFactory('Auction');
  const auction = await Auction.connect(admin).deploy(cashAddress, domino.address);
  await auction.deployTransaction.wait();
  console.log('Auction is deployed to address:          \t', auction.address);

  const contractAddresses = {
    'Cash': cashAddress,
    'Random': random.address,
    'Domino': domino.address,
    'Auction': auction.address,
  };
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
