// // Release funds (liquidate) function

// const collateralAmount = new anchor.BN(250_000_000); // Amount to give to backend (0.25 SOL)
// const toTransferAmount = new anchor.BN(100_000_000); // Amount to send back to user (0.1 SOL)

// // Calling the liquidate function
// await program.methods
//   .liquidate(collateralAmount, toTransferAmount) // Amounts for liquidation
//   .accounts({
//     backendAuthority: backend.publicKey, // Backend authority's public key
//     vaultState: vaultStatePDA,           // PDA for vault state
//     userAccount: userAccountPDA,         // User's account
//     backendWallet: backend.publicKey,     // Backend wallet public key
//     user: depositUser.publicKey,         // User's public key
//     solVault: solVaultPDA,               // PDA holding SOL
//     systemProgram: anchor.web3.SystemProgram.programId,
//   })
//   .signers([backend]) // Sign with the backend authority's keypair
//   .rpc(); // Execute the transaction

// console.log("Funds released!");




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

// wallets
const backend = loadKeypairFromFile('backend_keypair.json'); 
const depositUser = loadKeypairFromFile('user.json'); 

//Connection
const connection = new Connection(clusterApiUrl("devnet"), { commitment: "processed" });

// Initialize Provider using the backend wallet
const wallet = new NodeWallet.default(backend);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "processed" });
anchor.setProvider(provider);

// Program ID
const programId = new PublicKey("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");
const program = new anchor.Program(idl, programId);

const collateralAmount = new BN(250_000_000); // 0.25 SOL
const toTransferAmount = new BN(100_000_000); // 0.1 SOL

// PDAs
const [vaultStatePDA] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("vault-state")],
    programId
);
const userAccountPDA = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("user-acct"), depositUser.publicKey.toBuffer()],
    programId
);
const [solVaultPDA] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("sol-vault")],
    programId
);

console.log("Releasing funds...");

const liquidateInstruction = await program.methods
    .liquidate(collateralAmount, toTransferAmount) // Amounts for liquidation
    .accounts({
        backendAuthority: backend.publicKey, // Backend authority's public key
        vaultState: vaultStatePDA,           // PDA for vault state
        userAccount: userAccountPDA,         // User's account
        backendWallet: backend.publicKey,     // Backend wallet public key
        user: depositUser.publicKey,         // User's public key
        solVault: solVaultPDA,               // PDA holding SOL
        systemProgram: SystemProgram.programId,
    })
    .instruction();

const transaction = new Transaction().add(liquidateInstruction);

// recent blockhash
const { blockhash } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash; 
transaction.feePayer = backend.publicKey; 

// Sign transaction
await transaction.sign(backend);

// Send and confirm the transaction
const signature = await connection.sendTransaction(transaction, [backend], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
});

// Confirm the transaction
await connection.confirmTransaction(signature, 'confirmed');

console.log("Funds released! Transaction signature:", signature);