const web3 = require('web3');
const truffleAssert = require('truffle-assertions');

// Contract artifacts.
const KeyHolderLibrary = artifacts.require('./identity/KeyHolderLibrary.sol');
const ClaimHolderLibrary = artifacts.require('./identity/ClaimHolderLibrary.sol');
const Identity = artifacts.require('Identity');

// Contract instances.
let identity;

// "Profile" as ERC 735 self-claims.
// See https://github.com/ethereum/EIPs/issues/735#issuecomment-450647097
const topics = {
  givenName: {
    topic: '103105118101110078097109101',
    data: "John",
  },
  familyName: {
    topic: '102097109105108121078097109101',
    data: "Doe",
  },
  jobTitle: {
    topic: '106111098084105116108101',
    data: "Solidity developer",
  },
  url: {
    topic: '117114108',
    data: "https://johndoe.com",
  },
  email: {
    topic: '101109097105108',
    data: 'john@doe.com',
  },
  description: {
    topic: '100101115099114105112116105111110',
    data: "I love building dApps",
  }
}

// Tests.
contract('Identity', async (accounts) => {
  const defaultUser = accounts[0];
  const user1 = accounts[1];
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

  // Note: to fully test ClaimHolder, we also add signatures.
  // However in the UI we won't add signatures for self-claims,
  // because signing self-claims makes no sense.
  it('User1 should add one self-claim', async() => {
    const result = await identity.addClaim(
      topics.givenName.topic,
      1,
      user1,
      web3.utils.keccak256(identity.address, topics.givenName.topic, topics.givenName.data),
      web3.utils.asciiToHex(topics.givenName.data),
      'https://user1.com/about',
      {from: user1}
    );
    assert(result);
    truffleAssert.eventEmitted(result, 'ClaimAdded', (ev) => {
      return ev.claimId === web3.utils.soliditySha3(user1, topics.givenName.topic);
    });
  });

  it('Anyone should retrieve claim IDs by topic and claimIDs should be deterministic', async() => {
    const result = await identity.getClaimIdsByTopic(topics.givenName.topic, {from: someone});
    assert.equal(result[0], web3.utils.soliditySha3(user1, topics.givenName.topic));
  });

  it('Anyone should retrieve a claim by its ID', async() => {
    const claimId = web3.utils.soliditySha3(user1, topics.givenName.topic);
    const result = await identity.getClaim(claimId, {from: someone});
    assert.equal(result[0].toNumber(), topics.givenName.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.givenName.topic, topics.givenName.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.givenName.data);
    assert.equal(result[5], 'https://user1.com/about');
  });

  it('User1 should remove a self-claim by its ID', async() => {
    const claimId = web3.utils.soliditySha3(user1, topics.givenName.topic);
    const result = await identity.removeClaim(claimId, {from: user1});
    assert(result);
    truffleAssert.eventEmitted(result, 'ClaimRemoved', (ev) => {
      return ev.claimId === web3.utils.soliditySha3(user1, topics.givenName.topic);
    });
  });

  it('User should not have a self-claim on this topic any more', async() => {
    const claimId = web3.utils.soliditySha3(user1, topics.givenName.topic);
    const result = await identity.getClaim(claimId, {from: someone});
    assert.equal(result[0].toNumber(), 0);
    assert.equal(result[1].toNumber(), 0);
    assert.equal(result[2], '0x0000000000000000000000000000000000000000');
    assert.equal(result[3], '0x');
    assert.equal(result[4], '0x');
    assert.equal(result[5], '');
  });

  // Note: to fully test ClaimHolder, we also add signatures.
  // However in the UI we won't add signatures for self-claims,
  // because signing self-claims makes no sense.
  it('User1 should add self-claim with the addClaims function', async() => {
    // For one sig row we convert to hex and remove 0x
    const sigRow = web3.utils.keccak256(identity.address, topics.givenName.topic, topics.givenName.data).substr(2);
    // Serialized sig is concatenation of sig rows + we add again 0x in the beginning.
    const sig = '0x' + sigRow;
    // For one data row we convert to hex and remove 0x
    const dataRow = web3.utils.asciiToHex(topics.givenName.data).substr(2);
    // Serialized data is concatenation of data rows + we add again 0x in the beginning.
    const data = '0x' + dataRow;
    const result = await identity.addClaims(
      [
        topics.givenName.topic
      ],
      [
        user1
      ],
      sig,
      data,
      [
        topics.givenName.data.length,
      ],
      {from: user1}
    );
    assert(result);
  });

  it('Claim added with addClaims should have correct data', async() => {
    const claimId = web3.utils.soliditySha3(user1, topics.givenName.topic);
    const result = await identity.getClaim(claimId);
    assert.equal(result[0].toNumber(), topics.givenName.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.givenName.topic, topics.givenName.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.givenName.data);
    assert.equal(result[5], '');
  });

  it('User1 should set his "Profile" with ERC 735 self-claims in 1 call', async() => {
    // TODO picture
    const result = await identity.addClaims(
      [
        topics.givenName.topic,
        topics.familyName.topic,
        topics.jobTitle.topic,
        topics.url.topic,
        topics.email.topic,
        topics.description.topic
      ],
      [
        user1,
        user1,
        user1,
        user1,
        user1,
        user1
      ],
      '0x'
      +  web3.utils.keccak256(identity.address, topics.givenName.topic, topics.givenName.data).substr(2)
      +  web3.utils.keccak256(identity.address, topics.familyName.topic, topics.familyName.data).substr(2)
      +  web3.utils.keccak256(identity.address, topics.jobTitle.topic, topics.jobTitle.data).substr(2)
      +  web3.utils.keccak256(identity.address, topics.url.topic, topics.url.data).substr(2)
      +  web3.utils.keccak256(identity.address, topics.email.topic, topics.email.data).substr(2)
      +  web3.utils.keccak256(identity.address, topics.description.topic, topics.description.data).substr(2),
      '0x'
      + web3.utils.asciiToHex(topics.givenName.data).substr(2)
      + web3.utils.asciiToHex(topics.familyName.data).substr(2)
      + web3.utils.asciiToHex(topics.jobTitle.data).substr(2)
      + web3.utils.asciiToHex(topics.url.data).substr(2)
      + web3.utils.asciiToHex(topics.email.data).substr(2)
      + web3.utils.asciiToHex(topics.description.data).substr(2),
      [
        topics.givenName.data.length,
        topics.familyName.data.length,
        topics.jobTitle.data.length,
        topics.url.data.length,
        topics.email.data.length,
        topics.description.data.length
      ],
      {from: user1}
    );
    assert(result);
  });

  it('User1 self claims for his "Profile" should exist and have correct data', async() => {
    let result;

    result = await identity.getClaim(web3.utils.soliditySha3(user1, topics.givenName.topic));
    assert.equal(result[0].toNumber(), topics.givenName.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.givenName.topic, topics.givenName.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.givenName.data);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, topics.familyName.topic));
    assert.equal(result[0].toNumber(), topics.familyName.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.familyName.topic, topics.familyName.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.familyName.data);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, topics.jobTitle.topic));
    assert.equal(result[0].toNumber(), topics.jobTitle.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.jobTitle.topic, topics.jobTitle.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.jobTitle.data);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, topics.url.topic));
    assert.equal(result[0].toNumber(), topics.url.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.url.topic, topics.url.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.url.data);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, topics.email.topic));
    assert.equal(result[0].toNumber(), topics.email.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.email.topic, topics.email.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.email.data);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, topics.description.topic));
    assert.equal(result[0].toNumber(), topics.description.topic);
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, topics.description.topic, topics.description.data));
    assert.equal(web3.utils.hexToAscii(result[4]), topics.description.data);
    assert.equal(result[5], '');
  });

});
