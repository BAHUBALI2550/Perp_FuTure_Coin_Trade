// const anchor = require("@project-serum/anchor");
// const { Keypair, PublicKey } = require("@solana/web3.js");
// const fs = require("fs");
// const path = require("path");

import anchor from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import idl from "../../../target/idl/trading_escrow.json" with { type: "json" };

import { fileURLToPath } from 'url'; // Import this to handle URLs
// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load wallet keypair
const keypairPath = path.resolve(__dirname, "../../../deployer.json"); 
const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
const walletKeypair = Keypair.fromSecretKey(new Uint8Array(secret));

const programId = new PublicKey("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");

(async () => {
  // Set up provider
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", {
    commitment: "confirmed",
  });


  // const idl = await import('../../../target/idl/trading_escrow.json', {
  //   assert: { type: 'json' }
  // });

//    const idl = JSON.parse(fs.readFileSync('./target/idl/stock_escrow.json', 'utf8'));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(walletKeypair), {
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  // Load program
  const program = new anchor.Program(idl, programId);
  // Define your accounts
  const vaultPubkey = new PublicKey("9B6gpdvJT5RoJbjHMETsKJGk8tXDVQ8g1VdPw342p7uq");
  const backendPubkey = new PublicKey("6x6GCmHVdVoviAeR1kEArkMiSxac4KZnW6vcuJRkBaK5");
  const ownerPubkey = new PublicKey("9B6gpdvJT5RoJbjHMETsKJGk8tXDVQ8g1VdPw342p7uq");
  // Call initialize
  await program.methods
    .initialize()
    .accounts({
      vault: vaultPubkey,
      backend: backendPubkey,
      owner: ownerPubkey,
    })
    .rpc();
  console.log("Initialize transaction submitted");
})();