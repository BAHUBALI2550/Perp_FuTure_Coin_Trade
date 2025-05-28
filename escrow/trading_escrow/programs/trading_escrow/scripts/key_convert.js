const bs58 = require('bs58');
function bs58PrivateKeyToUint8Array(bs58Key) {
  // Decode the base58 key to a Buffer, then convert to Uint8Array
  return new Uint8Array(bs58.decode(bs58Key));
}
// Example usage:
const bs58PrivateKey = 'Private_key here';
const uint8arr = bs58PrivateKeyToUint8Array(bs58PrivateKey);
console.log(uint8arr)