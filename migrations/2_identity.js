const KeyHolderLibrary = artifacts.require('KeyHolderLibrary');
const ClaimHolderLibrary = artifacts.require('ClaimHolderLibrary');
const Identity = artifacts.require('Identity');

module.exports = function(deployer) {
   deployer.deploy(KeyHolderLibrary);
   deployer.link(KeyHolderLibrary, [ClaimHolderLibrary, Identity]);
   deployer.deploy(ClaimHolderLibrary);
   deployer.link(ClaimHolderLibrary, Identity);
   deployer.deploy(Identity);
};
