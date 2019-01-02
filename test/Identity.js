const web3 = require('web3');
const truffleAssert = require('truffle-assertions');

// Contract artifacts.
const KeyHolderLibrary = artifacts.require('./identity/KeyHolderLibrary.sol');
const ClaimHolderLibrary = artifacts.require('./identity/ClaimHolderLibrary.sol');
const Identity = artifacts.require('Identity');

// Contract instances.
let identity;

function asciiToTopic(ascii) {
  let topic = '';
  for (i = 0; i < ascii.length; i++) {
    let character = ascii.charCodeAt(i).toString();
    // If character takes 2 decimals, add a 0.
    if (character.length === 2) {
      character = '0' + character;
    }
    // If character takes 1 decimals, add two 0s.
    else if (character.length === 1) {
      character = '00' + character;
    }
    topic = topic + character;
  }
  // If topic has a leading zero, remove it.
  if (topic.charAt(0) === '0') {
    topic = topic.substr(1);
  }
  // Do it again if topic had two zeros.
  if (topic.charAt(0) === '0') {
    topic = topic.substr(1);
  }
  return topic;
}

function topicToAscii(topic) {
  let ascii = '';
  // If topic misses one zero, add it.
  if (topic.length % 3 === 2) {
    topic = '0' + topic;
  }
  // If topic misses two zeros, add them.
  else if (topic.length % 3 === 1) {
    topic = '00' + topic;
  }
  const length = topic.length;
  for (i = 0; i < topic.length; i += 3) {
    ascii = ascii + String.fromCharCode(
      topic.charAt(i) + topic.charAt(i + 1) + topic.charAt(i + 2)
    );
  }
  return ascii;
}

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

  it('Should convert ASCII property names to BigNumber topics', async() => {
    const result1 = asciiToTopic('givenName');
    assert.equal(result1, '103105118101110078097109101');
    const result2 = asciiToTopic('additionalName');
    assert.equal(result2, '97100100105116105111110097108078097109101');
  });

  it('Should convert BigNumber topics to ASCII property names', async() => {
    const result1 = topicToAscii('103105118101110078097109101');
    assert.equal(result1, 'givenName');
    const result2 = topicToAscii('97100100105116105111110097108078097109101');
    assert.equal(result2, 'additionalName');
  });

  // Note: to fully test ClaimHolder, we also add signatures.
  // However in the UI we won't add signatures for self-claims,
  // because signing self-claims makes no sense.
  it('User1 should add one self-claim', async() => {
    const result = await identity.addClaim(
      asciiToTopic('givenName'),
      1,
      user1,
      web3.utils.keccak256(identity.address, asciiToTopic('givenName'), profile.givenName),
      web3.utils.asciiToHex(profile.givenName),
      'https://user1.com/about',
      {from: user1}
    );
    assert(result);
    truffleAssert.eventEmitted(result, 'ClaimAdded', (ev) => {
      return ev.claimId === web3.utils.soliditySha3(user1, asciiToTopic('givenName'));
    });
  });

  it('Anyone should retrieve claim IDs by topic and claimIDs should be deterministic', async() => {
    const result = await identity.getClaimIdsByTopic(asciiToTopic('givenName'), {from: someone});
    assert.equal(result[0], web3.utils.soliditySha3(user1, asciiToTopic('givenName')));
  });

  it('Anyone should retrieve a claim by its ID', async() => {
    const claimId = web3.utils.soliditySha3(user1, asciiToTopic('givenName'));
    const result = await identity.getClaim(claimId, {from: someone});
    assert.equal(result[0].toNumber(), asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('givenName'), profile.givenName));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], 'https://user1.com/about');
  });

  it('User1 should remove a self-claim by its ID', async() => {
    const claimId = web3.utils.soliditySha3(user1, asciiToTopic('givenName'));
    const result = await identity.removeClaim(claimId, {from: user1});
    assert(result);
    truffleAssert.eventEmitted(result, 'ClaimRemoved', (ev) => {
      return ev.claimId === web3.utils.soliditySha3(user1, asciiToTopic('givenName'));
    });
  });

  it('User should not have a self-claim on this topic any more', async() => {
    const claimId = web3.utils.soliditySha3(user1, asciiToTopic('givenName'));
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
    const sigRow = web3.utils.keccak256(identity.address, asciiToTopic('givenName'), profile.givenName).substr(2);
    // Serialized sig is concatenation of sig rows + we add again 0x in the beginning.
    const sig = '0x' + sigRow;
    // For one data row we convert to hex and remove 0x
    const dataRow = web3.utils.asciiToHex(profile.givenName).substr(2);
    // Serialized data is concatenation of data rows + we add again 0x in the beginning.
    const data = '0x' + dataRow;
    const result = await identity.addClaims(
      [
        asciiToTopic('givenName')
      ],
      [
        user1
      ],
      sig,
      data,
      [
        profile.givenName.length,
      ],
      {from: user1}
    );
    assert(result);
  });

  it('Claim added with addClaims should have correct data', async() => {
    const claimId = web3.utils.soliditySha3(user1, asciiToTopic('givenName'));
    const result = await identity.getClaim(claimId);
    assert.equal(result[0].toNumber(), asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('givenName'), profile.givenName));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], '');
  });

  it('User1 should set his "Profile" with ERC 735 self-claims in 1 call', async() => {
    const result = await identity.addClaims(
      [
        asciiToTopic('givenName'),
        asciiToTopic('familyName'),
        asciiToTopic('jobTitle'),
        asciiToTopic('url'),
        asciiToTopic('email'),
        asciiToTopic('description')
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
      +  web3.utils.keccak256(identity.address, asciiToTopic('givenName'), profile.givenName).substr(2)
      +  web3.utils.keccak256(identity.address, asciiToTopic('familyName'), profile.familyName).substr(2)
      +  web3.utils.keccak256(identity.address, asciiToTopic('jobTitle'), profile.jobTitle).substr(2)
      +  web3.utils.keccak256(identity.address, asciiToTopic('url'), profile.url).substr(2)
      +  web3.utils.keccak256(identity.address, asciiToTopic('email'), profile.email).substr(2)
      +  web3.utils.keccak256(identity.address, asciiToTopic('description'), profile.description).substr(2),
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

    result = await identity.getClaim(web3.utils.soliditySha3(user1, asciiToTopic('givenName')));
    assert.equal(result[0].toNumber(), asciiToTopic('givenName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('givenName'), profile.givenName));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.givenName);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, asciiToTopic('familyName')));
    assert.equal(result[0].toNumber(), asciiToTopic('familyName'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('familyName'), profile.familyName));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.familyName);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, asciiToTopic('jobTitle')));
    assert.equal(result[0].toNumber(), asciiToTopic('jobTitle'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('jobTitle'), profile.jobTitle));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.jobTitle);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, asciiToTopic('url')));
    assert.equal(result[0].toNumber(), asciiToTopic('url'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('url'), profile.url));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.url);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, asciiToTopic('email')));
    assert.equal(result[0].toNumber(), asciiToTopic('email'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('email'), profile.email));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.email);
    assert.equal(result[5], '');

    result = await identity.getClaim(web3.utils.soliditySha3(user1, asciiToTopic('description')));
    assert.equal(result[0].toNumber(), asciiToTopic('description'));
    assert.equal(result[1].toNumber(), 1);
    assert.equal(result[2], user1);
    assert.equal(result[3], web3.utils.keccak256(identity.address, asciiToTopic('description'), profile.description));
    assert.equal(web3.utils.hexToAscii(result[4]), profile.description);
    assert.equal(result[5], '');
  });

});
