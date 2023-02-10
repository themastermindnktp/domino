const { task } = require('hardhat/config');
const { generateAccount } = require('../common/account');

task('generate-account', 'Generate account wallet addresses')
  .addOptionalParam('secret', 'Secret string for hashing')
  .setAction(async (args) => {
    const secret = args.secret || process.env.ETHEREUM_ACCOUNT_SECRET_SEED;
    const account = generateAccount(secret);
    console.log(`Address    : ${account.address}`);
    console.log(`Private key: ${account.privateKey}`);
  });
