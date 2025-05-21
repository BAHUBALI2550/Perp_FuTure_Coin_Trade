import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "./../target/types/escrow";
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, Account } from "@solana/spl-token";
import { assert } from "chai";

describe("release_funds",  function () {


  this.timeout(30000);
  console.log("🧪 Loaded test file");


  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  let mint: anchor.web3.PublicKey;
  let user = anchor.web3.Keypair.generate();
  let backend = anchor.web3.Keypair.generate();

  let userAta:  Account;
let backendAta: Account;
let vaultAta: Account;

let escrow = anchor.web3.Keypair.generate();
let vaultPda: anchor.web3.PublicKey;
let vaultBump: number;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  before(async () => {


    console.log("🔧 Before hook running...");
    console.log("user:",user.publicKey);
    console.log("backend:",backend.publicKey);

    // Airdrop SOL
    // await provider.connection.confirmTransaction(
    //   await provider.connection.requestAirdrop(user.publicKey, 1e9),
    //   "confirmed"
    // );


    // await sleep(1000);

    // await provider.connection.confirmTransaction(
    //   await provider.connection.requestAirdrop(backend.publicKey, 1e9),
    //   "confirmed"
    // );


    // await sleep(1000);

    // Create mint
    mint = await createMint(provider.connection, backend, backend.publicKey, null, 6);

    // Create token accounts
    userAta = (await getOrCreateAssociatedTokenAccount(provider.connection, user, mint, user.publicKey));
    backendAta = await getOrCreateAssociatedTokenAccount(provider.connection, backend, mint, backend.publicKey);

    // Mint some tokens to vault and backend
    await mintTo(provider.connection, backend, mint, backendAta.address, backend, 1_000_000_000);

    // Derive vault PDA
    [vaultPda, vaultBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrow.publicKey.toBuffer()],
      program.programId
    );

    // Manually create vault token account (assume PDA init already in your real contract)
    vaultAta = await getOrCreateAssociatedTokenAccount(provider.connection, backend, mint, vaultPda, true);

    // Fund vault with test payout amount
    await mintTo(provider.connection, backend, mint, vaultAta.address, backend, 100_000_000);
  });

  it("Releases payout and sends positive fee to backend", async () => {
    
    console.log("🚀 Test started...");
    
    const payout = new anchor.BN(100_000_000);
    const fee = new anchor.BN(10_000_000); // Positive fee

    const tx = await program.methods
      .releaseFunds(payout, fee)
      .accounts({
        escrow: escrow.publicKey,
        destination: userAta.address, // or another destination if applicable
        backendTokenAccount: backendAta.address,
        userTokenAccount: userAta.address,
        backend: backend.publicKey,
        authority: backend.publicKey, // whoever is allowed to release funds
        tokenProgram: TOKEN_PROGRAM_ID,
      }as any)
      .signers([]);
      const sim = await tx.simulate();
console.log("🧪 Simulation logs:", sim);

await tx.rpc(); 

    const userAccount = await getAccount(provider.connection, userAta.address);
    const backendAccount = await getAccount(provider.connection, backendAta.address);

    assert.strictEqual(Number(userAccount.amount), 90_000_000);
    assert.isAbove(Number(backendAccount.amount), 1_000_000_000);
  });

  it("Handles negative fee and backend rebate to user", async () => {
    // Reset: Add funds back to vault
    await mintTo(provider.connection, backend, mint, vaultAta.address, backend, 100_000_000);

    const payout = new anchor.BN(100_000_000);
    const fee = new anchor.BN(-5_000_000); // Negative fee (backend pays user)

    await program.methods
      .releaseFunds(payout, fee)
      .accounts({
        escrow: escrow.publicKey,
        destination: userAta.address, // or another destination if applicable
        backendTokenAccount: backendAta.address,
        userTokenAccount: userAta.address,
        backend: backend.publicKey,
        authority: backend.publicKey, // whoever is allowed to release funds
        tokenProgram: TOKEN_PROGRAM_ID,
      }as any)
      .signers([backend]) // backend must sign since it's paying fee
      .rpc();

    const userAccount = await getAccount(provider.connection, userAta.address);
    assert.strictEqual(Number(userAccount.amount), 90_000_000 + 105_000_000);
  });
});
