import * as anchor from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import { Connection, Keypair, PublicKey, clusterApiUrl, Transaction, SystemProgram } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet.js'; 
import idl from "../../../target/idl/trading_escrow.json" with { type: "json" };
const { BN } = anchor.default; 

function loadKeypairFromFile(filename) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(filename)));
    return Keypair.fromSecretKey(secret);
}

// Load wallets
const user = loadKeypairFromFile('user.json'); // Load the deployer keypair
const vault = loadKeypairFromFile('vault_keypair.json'); // Load the vault

// Initialize Provider
const connection = new Connection(clusterApiUrl("devnet"), {
    commitment: "processed"
});

const wallet = new NodeWallet.default(user);
const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "processed",
});
anchor.setProvider(provider);

// Your program ID
const programId = new PublicKey("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");
const program = new anchor.Program(idl, programId);

// Define the deposit amount (1 SOL = 1,000,000,000 lamports)
const depositAmount = new BN(1_000_000_000); // 1 SOL in lamports

// Generate PDA for user account
// const [userAccountPDA] = await anchor.web3.PublicKey.findProgramAddress(
//   [Buffer.from("user-acct"), user.publicKey.toBuffer()], // Use deployer's public key
//   programId
// );
const [userAccountPDA, userAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
  [Buffer.from("user-acct"), user.publicKey.toBuffer()],
  programId
);

// let userAccount = await program.account.userAccount.fetchNullable(userAccountPDA);

// Generate PDA for vault_state (assuming you already defined this in the previous code)
const vaultStatePDA = await PublicKey.findProgramAddress(
  [Buffer.from("vault-state")],
  programId
);

// Generate PDA for sol_vault (assuming you already defined this in the previous code)
const [solVaultPDA] = await anchor.web3.PublicKey.findProgramAddress(
  [Buffer.from("sol-vault")],
  programId
);

if (user) {
  console.log("User account not initialized. Initializing now...");
  const initializeInstruction = await program.methods.initializeUserAccount()
    .accounts({
      user: user.publicKey,
      userAccount: userAccountPDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();
    const transaction1 = new Transaction().add(initializeInstruction);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction1.recentBlockhash = blockhash; // Set the blockhash
  transaction1.feePayer = user.publicKey; // Set fee payer

  // Sign the transaction
  await transaction1.sign(user); // Sign with the deployer's keypair

  // Send and confirm the transaction
  const signature1 = await connection.sendTransaction(transaction1, [user], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
  });

  // Confirm the transaction
  await connection.confirmTransaction(signature1, 'confirmed');
  console.log("Initialized user account! Tx:", signature1);
   
}


console.log("aa: ",user.publicKey);
// Calling the deposit function
const instruction = await program.methods
  .deposit(depositAmount) // Amount to deposit
  .accounts({
    user: user.publicKey, // Use the deployer's public key
    vaultState: vaultStatePDA,   // PDA for vault state
    userAccount: userAccountPDA,  // User-specific PDA
    solVault: solVaultPDA,        // PDA holding SOL
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .instruction(); // Execute the transaction
  console.log("Instruction Object:", instruction);

const transaction = new Transaction().add(instruction);

// Get recent blockhash
const { blockhash } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash; // Set the blockhash
transaction.feePayer = user.publicKey; // Set fee payer

// Sign the transaction
await transaction.sign(user); // Sign with the deployer's keypair

// Send and confirm the transaction
const signature = await connection.sendTransaction(transaction, [user], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
});

// Confirm the transaction
await connection.confirmTransaction(signature, 'confirmed');
console.log(signature);

console.log("Deposited SOL into the vault!");