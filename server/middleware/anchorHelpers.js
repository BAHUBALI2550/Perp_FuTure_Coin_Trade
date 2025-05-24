const anchor = require('@project-serum/anchor');
const { Connection, Keypair} = require('@solana/web3.js');
const bs58 = require('bs58').default;

const connection = new Connection("https://api.devnet.solana.com");
const secretKey = bs58.decode(process.env.BACKEND_PRIVATE_KEY);
const backendKeypair = Keypair.fromSecretKey(secretKey);
const wallet = new anchor.Wallet(backendKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: 'processed',
});

function getProvider() {
  return provider;
}

function getProgram(idl, programId) {
  return new anchor.Program(idl, programId, provider);
}

module.exports = {
  getProvider,
  getProgram
};
