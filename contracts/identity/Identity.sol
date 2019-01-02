pragma solidity ^0.4.24;

import "./ClaimHolder.sol";

contract Identity is ClaimHolder {

  function getBytes(bytes _str, uint256 _offset, uint256 _length)
      public
      pure
      returns (bytes)
  {
      bytes memory sig = new bytes(_length);
      uint256 j = 0;
      for (uint256 k = _offset; k < _offset + _length; k++) {
          sig[j] = _str[k];
          j++;
      }
      return sig;
  }
}
