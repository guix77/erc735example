const web3 = require('web3');
const truffleAssert = require('truffle-assertions');
const erc735js = require('erc735js');

// Contract artifacts.
const KeyHolderLibrary = artifacts.require('./identity/KeyHolderLibrary.sol');
const ClaimHolderLibrary = artifacts.require('./identity/ClaimHolderLibrary.sol');
const Identity = artifacts.require('Identity');

// Contract instances.
let identity;

// "Profile" as ERC 735 self-claims.
// See https://github.com/ethereum/EIPs/issues/735#issuecomment-450647097
const profile = {
  givenName: "John",
  familyName: "Doe",
  jobTitle: "Solidity developer",
  url: "https://johndoe.com",
  email: "john@doe.com",
  description: "I love building dApps"
}

// Tests.
contract('Identity', async (accounts) => {
  const defaultUser = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const someone = accounts[9];

  // Init.
  before(async () => {
    // 1. Deploy & link librairies.
    keyHolderLibrary = await KeyHolderLibrary.new();
    await ClaimHolderLibrary.link(KeyHolderLibrary, keyHolderLibrary.address);
    claimHolderLibrary = await ClaimHolderLibrary.new();
    await Identity.link(KeyHolderLibrary, keyHolderLibrary.address);
    await Identity.link(ClaimHolderLibrary, claimHolderLibrary.address);
  });

  it('Deploy Identity contract', async() => {
    identity = await Identity.new({from: user1});
    assert(identity);
  });

  it('User1 should add one self-claim', async() => {
    const result = await identity.addClaim(
      erc735js.asciiToTopic('givenName'),
      1,
      user1,
      '',
      web3.utils.asciiToHex(profile.givenName),
      'https://user1.com/about',
      {from: user1}
    );
    assert(result);
    truffleAssert.eventEmitted(result, 'ClaimAdded', (ev) => {
      return ev.claimId === web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName'));
    });
  });

  it('Anyone should retrieve claim IDs by topic and claimIDs should be deterministic', async() => {
    const result = await identity.getClaimIdsByTopic(erc735js.asciiToTopic('givenName'), {from: someone});
    assert.equal(result[0], web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName')));
  });

  it('Anyone should retrieve a claim by its ID', async() => {
    const claimId = web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName'));
    const result = await identity.getClaim(claimId, {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], 'https://user1.com/about');
  });

  it('User1 should remove a self-claim by its ID', async() => {
    const claimId = web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName'));
    const result = await identity.removeClaim(claimId, {from: user1});
    assert(result);
    truffleAssert.eventEmitted(result, 'ClaimRemoved', (ev) => {
      return ev.claimId === web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName'));
    });
  });

  it('User should not have a self-claim on this topic any more', async() => {
    const claimId = web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName'));
    const result = await identity.getClaim(claimId, {from: someone});
    assert.equal(result[0].toNumber(), 0);
    assert.equal(result[1].toNumber(), 0);
    assert.equal(result[2], '0x0000000000000000000000000000000000000000');
    assert.equal(result[3], '0x');
    assert.equal(result[4], '0x');
    assert.equal(result[5], '');
  });

  it('User1 should add one self-claim with addClaims', async() => {
    // For one data row we convert to hex and remove 0x
    const dataRow = web3.utils.asciiToHex(profile.givenName).substr(2);
    // Serialized data is concatenation of data rows + we add again 0x in the beginning.
    const data = '0x' + dataRow;
    const result = await identity.addClaims(
      [
        erc735js.asciiToTopic('givenName')
      ],
      [
        user1
      ],
      '',
      data,
      [
        profile.givenName.length,
      ],
      {from: user1}
    );
    assert(result);
  });

  it('Claim added with addClaims should have correct data', async() => {
    const claimId = web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName'));
    const result = await identity.getClaim(claimId, {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], '');
  });

  it('User1 should set his "Profile" with ERC 735 self-claims in 1 call', async() => {
    const result = await identity.addClaims(
      [
        erc735js.asciiToTopic('givenName'),
        erc735js.asciiToTopic('familyName'),
        erc735js.asciiToTopic('jobTitle'),
        erc735js.asciiToTopic('url'),
        erc735js.asciiToTopic('email'),
        erc735js.asciiToTopic('description')
      ],
      [
        user1,
        user1,
        user1,
        user1,
        user1,
        user1
      ],
      '',
      '0x'
      + web3.utils.asciiToHex(profile.givenName).substr(2)
      + web3.utils.asciiToHex(profile.familyName).substr(2)
      + web3.utils.asciiToHex(profile.jobTitle).substr(2)
      + web3.utils.asciiToHex(profile.url).substr(2)
      + web3.utils.asciiToHex(profile.email).substr(2)
      + web3.utils.asciiToHex(profile.description).substr(2),
      [
        profile.givenName.length,
        profile.familyName.length,
        profile.jobTitle.length,
        profile.url.length,
        profile.email.length,
        profile.description.length
      ],
      {from: user1}
    );
    assert(result);
  });

  it('User1 self claims for his "Profile" should exist and have correct data', async() => {
    let result;

    result = await identity.getClaim(web3.utils.soliditySha3(user1, erc735js.asciiToTopic('givenName')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, erc735js.asciiToTopic('familyName')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('familyName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.familyName);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, erc735js.asciiToTopic('jobTitle')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('jobTitle'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.jobTitle);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, erc735js.asciiToTopic('url')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('url'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.url);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, erc735js.asciiToTopic('email')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('email'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.email);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, erc735js.asciiToTopic('description')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('description'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], '0x');
    assert.equal(web3.utils.hexToAscii(result[4]), profile.description);
    assert.equal(result[5], '');
  });

  it('User1 should add an ERC 725 key Claim key and User2 should add multiple claims in one call', async() => {
    await identity.addKey(web3.utils.keccak256(user2), 3, 1, {from: user1});
    const result = await identity.addClaims(
      [
        erc735js.asciiToTopic('givenName'),
        erc735js.asciiToTopic('familyName'),
        erc735js.asciiToTopic('jobTitle'),
        erc735js.asciiToTopic('url'),
        erc735js.asciiToTopic('email'),
        erc735js.asciiToTopic('description')
      ],
      [
        user2,
        user2,
        user2,
        user2,
        user2,
        user2
      ],
      '0x'
      +  web3.utils.keccak256(identity.address, erc735js.asciiToTopic('givenName'), profile.givenName).substr(2)
      +  web3.utils.keccak256(identity.address, erc735js.asciiToTopic('familyName'), profile.familyName).substr(2)
      +  web3.utils.keccak256(identity.address, erc735js.asciiToTopic('jobTitle'), profile.jobTitle).substr(2)
      +  web3.utils.keccak256(identity.address, erc735js.asciiToTopic('url'), profile.url).substr(2)
      +  web3.utils.keccak256(identity.address, erc735js.asciiToTopic('email'), profile.email).substr(2)
      +  web3.utils.keccak256(identity.address, erc735js.asciiToTopic('description'), profile.description).substr(2),
      '0x'
      + web3.utils.asciiToHex(profile.givenName).substr(2)
      + web3.utils.asciiToHex(profile.familyName).substr(2)
      + web3.utils.asciiToHex(profile.jobTitle).substr(2)
      + web3.utils.asciiToHex(profile.url).substr(2)
      + web3.utils.asciiToHex(profile.email).substr(2)
      + web3.utils.asciiToHex(profile.description).substr(2),
      [
        profile.givenName.length,
        profile.familyName.length,
        profile.jobTitle.length,
        profile.url.length,
        profile.email.length,
        profile.description.length
      ],
      {from: user2}
    );
    assert(result);
  });

  it('User1 claims made by User2 should exist and have correct data', async() => {
    let result;

    result = await identity.getClaim(web3.utils.soliditySha3(user2, erc735js.asciiToTopic('givenName')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user2);
    assert.equal(result[3], web3.utils.keccak256(identity.address, erc735js.asciiToTopic('givenName'), profile.givenName));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user2, erc735js.asciiToTopic('familyName')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('familyName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user2);
    assert.equal(result[3], web3.utils.keccak256(identity.address, erc735js.asciiToTopic('familyName'), profile.familyName));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.familyName);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user2, erc735js.asciiToTopic('jobTitle')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('jobTitle'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user2);
    assert.equal(result[3], web3.utils.keccak256(identity.address, erc735js.asciiToTopic('jobTitle'), profile.jobTitle));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.jobTitle);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user2, erc735js.asciiToTopic('url')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('url'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user2);
    assert.equal(result[3], web3.utils.keccak256(identity.address, erc735js.asciiToTopic('url'), profile.url));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.url);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user2, erc735js.asciiToTopic('email')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('email'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user2);
    assert.equal(result[3], web3.utils.keccak256(identity.address, erc735js.asciiToTopic('email'), profile.email));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.email);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user2, erc735js.asciiToTopic('description')), {from: someone});
    assert.equal(result[0].toNumber(), erc735js.asciiToTopic('description'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user2);
    assert.equal(result[3], web3.utils.keccak256(identity.address, erc735js.asciiToTopic('description'), profile.description));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.description);
    assert.equal(result[5], '');
  });

});
