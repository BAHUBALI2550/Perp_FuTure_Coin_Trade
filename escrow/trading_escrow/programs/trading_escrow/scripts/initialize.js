import * as anchor from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import { Connection, Keypair, PublicKey, clusterApiUrl, Transaction, SystemProgram } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet.js'; 
import idl from "../../../target/idl/trading_escrow.json" with { type: "json" };

// Function to load keypair
function loadKeypairFromFile(filename) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(filename)));
    return Keypair.fromSecretKey(secret);
}

async function isAccountInitialized(connection, publicKey) {
    const accountInfo = await connection.getAccountInfo(publicKey);
    return accountInfo !== null && accountInfo.owner.equals(programId);
}

// wallet
const deployer = loadKeypairFromFile('deployer.json');
const backend = loadKeypairFromFile('backend_keypair.json');
const vault = loadKeypairFromFile('vault_keypair.json');

// Provider
const connection = new Connection(clusterApiUrl("devnet"), {
    commitment: "processed"
});

const wallet = new NodeWallet.default(deployer);
const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "processed",
});
anchor.setProvider(provider);

// program ID
const programId = new PublicKey("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");
const program = new anchor.Program(idl, programId);

// PDAs 
const [vaultStatePDA] = await PublicKey.findProgramAddress(
    [Buffer.from("vault-state")],
    programId
);

const [solVaultPDA] = await PublicKey.findProgramAddress(
    [Buffer.from("sol-vault")],
    programId
);

const vaultStateInitialized = await isAccountInitialized(connection, vaultStatePDA);
if (!vaultStateInitialized) {
// Create an instruction to initialize the contract
const instruction = await program.methods
    .initialize(backend.publicKey) // Pass the backend wallet public key
    .accounts({
        authority: deployer.publicKey,
        vaultState: vaultStatePDA,
        solVault: solVaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction(); // Generate the instruction

    // console.log("Instruction Object:", instruction);

// new transaction
const transaction = new Transaction().add(instruction);

const { blockhash } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash; 
transaction.feePayer = deployer.publicKey; 

// Sign transaction
await transaction.sign(deployer);

// Send and confirm
const signature = await connection.sendTransaction(transaction, [deployer], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
});

// Confirm the transaction
await connection.confirmTransaction(signature, 'confirmed');
console.log(signature);

console.log("Contract initialized!");
}
else {
    console.log("Vault state already initialized, skipping...");
}