const express = require('express');
const cors = require('cors');
const axios = require('axios');
const socketIO = require('socket.io');
const { prismaClient } = require('../packages/db/src');
const http = require('http');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, clusterApiUrl } = require('@solana/web3.js');
require('dotenv').config();
const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
const PORT = 3001;
const bs58 = require('bs58').default;
const anchor = require('@coral-xyz/anchor');
const { BN } = anchor; 
const {NodeWallet} = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;
const idl = require("../escrow/trading_escrow/target/idl/trading_escrow.json");
const NETWORK = clusterApiUrl("devnet");
const PROGRAM_ID = new PublicKey("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");

const server = http.createServer(app);

let fundingRate = 0.0026;
let lastFundingTime = Date.now();
const connection = new Connection("https://api.devnet.solana.com");

// ✅ CORS fix for Socket.IO
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const userSockets = {};

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('register', (walletId) => {
    userSockets[walletId] = socket;
  });

  socket.on('disconnect', () => {
    for (const walletId in userSockets) {
      if (userSockets[walletId] === socket) {
        delete userSockets[walletId];
        break;
      }
    }
  });
});

function loadBackendKeypair() {
  const secretKey = bs58.decode(process.env.BACKEND_PRIVATE_KEY);
  return Keypair.fromSecretKey(secretKey);
}

function calculatePnL(position) {
  const { positionType, entryPrice, markPrice, currentPositionSize, leverage, currentPrice, collateral } = position;

  const c = collateral/1000000000;
  const r = currentPositionSize/(entryPrice * leverage); // current coin amount
  const g = currentPrice*r; // current coin price
  if(g >= c)
  {
    const s = (g-c);
    console.log(s);
    return s;
  }
  else{
    const s = -(g-c);
    console.log(s);
    return s;
  }
}

async function updatePositionPrice() {
  const latestPrices = await fetchCryptoPrices();

  const openPositions = await prismaClient.user.findMany({ where: { status: true } });

  const now = Date.now();
  const timeSinceLastFunding = (now - lastFundingTime) / (60 * 60 * 1000); // in hours
  const timeUntilFunding = Math.max(1 - timeSinceLastFunding, 0);

  for (const position of openPositions) {
    const currentPrice = latestPrices[position.coinName];
    if (!currentPrice) continue;

    const userId = position.walletId;

    const basis = fundingRate * timeUntilFunding;
    const markPrice = currentPrice * (1 + basis);

    const currentPnL = calculatePnL({
      positionType: position.positionType,
      entryPrice: position.entryPrice,
      markPrice: markPrice,
      currentPositionSize: position.currentPositionSize,
      leverage: position.leverage,
      currentPrice: currentPrice,
      collateral: position.collateral,
    });

    const { positionType, liquidationPrice, stopLoss, takeProfit, collateral } = position;

  const isLiquidated = positionType === 'LONG'
    ? markPrice <= liquidationPrice
    : markPrice >= liquidationPrice;

  const stopLossTriggered = stopLoss > 0 &&
    (
      (positionType === 'LONG' && markPrice <= stopLoss) ||
      (positionType === 'SHORT' && markPrice >= stopLoss)
    );

  const takeProfitTriggered = takeProfit > 0 &&
    (
      (positionType === 'LONG' && markPrice >= takeProfit) ||
      (positionType === 'SHORT' && markPrice <= takeProfit)
    );

  const collateralDepleted = position.totalFees >= (collateral * 0.999); // safer margin

  let closeReason = null;
  if (isLiquidated) {
    closeReason = "Liquidation";
  } else if (stopLossTriggered) {
    closeReason = "Stop Loss hit";
  } else if (takeProfitTriggered) {
    closeReason = "Take Profit hit";
  } else if (collateralDepleted) {
    closeReason = "Collateral depleted due to fees";
  }

    if (closeReason) {
    console.log(`⛔ Closing position ${position.id} for user ${position.walletId}: ${closeReason}`);

      const user = new PublicKey(position.walletId);
      const backend = loadBackendKeypair(); // Load the backend wallet keypair
      const connection = new Connection(NETWORK, { commitment: 'confirmed' });
      const wallet = new anchor.Wallet(backend);
      const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
      anchor.setProvider(provider);
      const program = new anchor.Program(idl, PROGRAM_ID);



            // Transfer collateral from vault to backend wallet
            const collateralAmount = new BN(Math.floor(Number(position.collateral))); 
            let toTransferAmount = 0;
            if (collateralDepleted) {
                toTransferAmount = 0; 
            } else {
                toTransferAmount = Math.max(Math.floor(((position.currentPositionSize) * 1e9) + position.currentPnL - position.totalFees), 0);
            }
            
            const [vaultStatePDA] = await PublicKey.findProgramAddressSync(
                [Buffer.from("vault-state")],
                PROGRAM_ID
            );

            const [userAccountPDA] = await PublicKey.findProgramAddressSync(
              [Buffer.from("user-acct"), user.toBuffer()], PROGRAM_ID
            );
            const [solVaultPDA] = await PublicKey.findProgramAddressSync(
              [Buffer.from("sol-vault")], PROGRAM_ID
            );

            const ix = await program.methods
            .liquidate(collateralAmount, toTransferAmount)
            .accounts({
              backendAuthority: backend.publicKey, // Backend auth
              vaultState: vaultStatePDA,
              userAccount: userAccountPDA,
              backendWallet: backend.publicKey,    // Payout to this backend wallet
              user: user,                          // End user wallet
              solVault: solVaultPDA,
              systemProgram: SystemProgram.programId,
            })
            .instruction();
          // Build TX 
          const transaction = new Transaction().add(ix);
          const blockhashObj = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhashObj.blockhash;
          transaction.feePayer = backend.publicKey;
          // Sign 
          transaction.sign(backend);
          // Send 
          const sig = await connection.sendTransaction(transaction, [backend], {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
      });
          await connection.confirmTransaction(sig, 'confirmed');
          console.log("Funds released! TX signature:", sig);
          

      await prismaClient.userClosed.create({
        data: {
          ...position,
          status: false,
          closeTime: new Date(),
          markPrice,
          totalFees: position.totalFees,
          currentPnL: currentPnL,
          lastFeeCalculatedTime: position.lastFeeCalculatedTime,
          onchainPositionId: sig
        }
      });

      await prismaClient.user.delete({ where: { id: position.id } });

      if (userSockets[position.walletId]) {
        userSockets[position.walletId].emit('positionClosed', {
          id: position.id,
          reason: closeReason,
        });
      }

      continue;
    }

    if (userSockets[userId]) {
      userSockets[userId].emit('positionUpdate', {
        id: position.id,
        markPrice: parseFloat(markPrice.toFixed(4)),
        currentPnL: parseFloat(currentPnL.toFixed(4)),
      })
    }
  }
}

setInterval(updatePositionPrice, 50000); // every 50 seconds

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCryptoPrices() {
  try {
    const res1 = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana");
    const data1 = await res1.json();
    await delay(6000); // wait 6 seconds

    const res2 = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum");
    const data2 = await res2.json();
    await delay(6000); // wait 6 seconds

    const res3 = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=wrapped-bitcoin");
    const data3 = await res3.json();

    if (!data1.length || !data2.length || !data3.length) {
      throw new Error("One or more CoinGecko responses are empty");
    }

    return {
      SOL: data1[0].current_price,
      ETH: data2[0].current_price,
      WBTC: data3[0].current_price,
    };
  } catch (err) {
    console.error("Failed to fetch crypto prices:", err);
    return {}; // or rethrow if needed
  }
}


async function calculateFundingRate() {
  try {
    const openPositions = await prismaClient.user.findMany({
      where: { status: true }
    });

    let longCount = 0;
    let shortCount = 0;

    for (const pos of openPositions) {
      if (pos.positionType.toLowerCase() === 'long') {
        longCount++;
      } else if (pos.positionType.toLowerCase() === 'short') {
        shortCount++;
      }
    }

    const total = longCount + shortCount;
    if (total === 0) {
      fundingRate = 0.0026;
    } else {
      const imbalance = (longCount - shortCount) / total;
      fundingRate = parseFloat((imbalance * 0.01).toFixed(6));
    }

    const now = new Date();
    const updates = openPositions.map((pos) => {
      const fee = pos.collateral * Math.abs(fundingRate);

      let newTotalFees = pos.totalFees;

      if (longCount > shortCount) {
        // Longs pay, Shorts earn
        if (pos.positionType.toLowerCase() === "buy") {
          newTotalFees += fee; // Long pays
        } else {
          newTotalFees -= fee; // Short earns
        }
      } else if (shortCount > longCount) {
        // Shorts pay, Longs earn
        if (pos.positionType.toLowerCase() === "short") {
          newTotalFees += fee; // Short pays
        } else {
          newTotalFees -= fee; // Long earns
        }
      } // if equal, no fee

      return prismaClient.user.update({
        where: { id: pos.id },
        data: {
          totalFees: parseFloat(newTotalFees.toFixed(6)),
          lastFeeCalculatedTime: now
        }
      });
    });

    await Promise.all(updates);
    lastFundingTime = now.getTime();
    console.log(`[Funding Rate] Longs: ${longCount}, Shorts: ${shortCount}, Rate: ${fundingRate}`);
  } catch (err) {
    console.error("Failed to calculate funding rate:", err);
    fundingRate = 0.0026; //
  }
}

setInterval(calculateFundingRate, 60 * 60 * 1000); //every hour


// enter a position to the database
app.post("/api/v1/buyorshort", async (req, res) => {
  try {
    const {
      signature,
      walletId,
      coinName,
      leverage,
      positionType,
      currentPositionSize,
      collateral,
      entryPrice,
      markPrice,
      liquidationPrice,
      currentPnL,
      openTime,
      lastFeeCalculatedTime
    } = req.body;

    // const rawTxBuffer = Uint8Array.from(tx); // transaction.serialize()
    
    // Submitting raw signed transaction
    // const txSignature = await connection.sendRawTransaction(rawTxBuffer);
    await connection.confirmTransaction(signature);
    console.log("✅ TX confirmed:", signature);

    const data = await prismaClient.user.create({
      data: {
        walletId,
        coinName,
        leverage,
        positionType,
        currentPositionSize,
        collateral,
        entryPrice,
        markPrice,
        liquidationPrice,
        currentPnL,
        openTime,
        lastFeeCalculatedTime,
        escrowAccount: signature,
        vaultTokenAccount: 'as',
        onchainPositionId: '1'
      }
    });
    res.json({ signature });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to enter the Transaction" });
  }
});


// get all open positions for a user(walletId)
app.get("/api/v1/positions", async (req, res) => {
  try {
    const walletId = req.query.walletId; // ✅ use req.query

    if (!walletId) {
      return;
    }
    const positions = await prismaClient.user.findMany({
      where: {
        walletId: walletId,
        status: true
      }
    });
    res.json({ positions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get positions" });
  }
});

// get all data history from userClosed
app.get("/api/v1/transactions", async (req, res) => {
  try {
    const walletId = req.query.walletId; // ✅ use req.query

    if (!walletId) {
      return;
    }
    const transactions = await prismaClient.userClosed.findMany({
      where: {
        walletId: walletId,
        status: false
      }
    });
    res.json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get transactions" });
  }
});

// delete a data from user and move to userClosed for history
app.delete("/api/v1/positions/:id", async (req, res) => {
  try {
    const positionId = req.params.id;
    const userId = req.userId;

    const position = await prismaClient.user.findUnique({
      where: { id: positionId, walletId: userId }
    });

    if (!position) {
      return res.status(404).json({ error: "Position not found" });
    }
    
    const payout = ((position.currentPositionSize) * 1e9) + position.currentPnL - position.totalFees;
    const collateralAmount = new BN(Math.floor(Number(position.collateral))); // lamports
    const toTransferAmount = new BN(Math.floor(Number(payout))); // lamports

    if(toTransferAmount > 0) {
    const backend = loadBackendKeypair();
    const user = new PublicKey(position.walletId);
    
    
    const connection = new Connection(NETWORK, { commitment: 'confirmed' });
    const wallet = new anchor.Wallet(backend);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    anchor.setProvider(provider);
    const program = new anchor.Program(idl, PROGRAM_ID);

    // PDAs
    const [vaultStatePDA] = await PublicKey.findProgramAddressSync(
      [Buffer.from("vault-state")], PROGRAM_ID
    );
    const [userAccountPDA] = await PublicKey.findProgramAddressSync(
      [Buffer.from("user-acct"), user.toBuffer()], PROGRAM_ID
    );
    const [solVaultPDA] = await PublicKey.findProgramAddressSync(
      [Buffer.from("sol-vault")], PROGRAM_ID
    );

    const ix = await program.methods
      .liquidate(collateralAmount, toTransferAmount)
      .accounts({
        backendAuthority: backend.publicKey, // Backend auth
        vaultState: vaultStatePDA,
        userAccount: userAccountPDA,
        backendWallet: backend.publicKey,    // Payout to this backend wallet
        user: user,                          // End user wallet
        solVault: solVaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    // Build TX 
    const transaction = new Transaction().add(ix);
    const blockhashObj = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhashObj.blockhash;
    transaction.feePayer = backend.publicKey;
    // Sign 
    transaction.sign(backend);
    // Send 
    const sig = await connection.sendTransaction(transaction, [backend], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
});
    await connection.confirmTransaction(sig, 'confirmed');
    console.log("Funds released! TX signature:", sig);
    // Copy to UserClosed
    const closed = await prismaClient.userClosed.create({ data: { ...position, status: false, closeTime: new Date(), onchainPositionId: sig } });
    // Remove from User
    await prismaClient.user.delete({ where: { id: positionId } });

    res.json({ message: "Position closed and archived", closedPosition: closed });
  }
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to close position" });
  }
});

app.put("/api/v1/positions/:id", async (req, res) => {
  try {
    const positionId = req.params.id;
    const walletId = req.params.walletId;
    const { markPrice, currentPositionSize, liquidationPrice, takeProfit, stopLoss, currentPnL, totalFees, lastFeeCalculatedTime } = req.body;

    // Find the position
    const position = await prismaClient.user.findUnique({
      where: { id: positionId, walletId: walletId },
    });

    if (!position) {
      return res.status(404).json({ error: "Position not found" });
    }

    // Update the position
    const updatedPosition = await prismaClient.user.update({
      where: { id: positionId },
      data: {
        markPrice: markPrice,
        currentPositionSize: currentPositionSize,
        liquidationPrice: liquidationPrice,
        takeProfit: takeProfit,
        stopLoss: stopLoss,
        currentPnL: currentPnL,
        totalFees: totalFees,
        lastFeeCalculatedTime: lastFeeCalculatedTime
      },
    });

    res.json(updatedPosition);
  } catch (error) {
    console.error("Failed to update position:", error);
    res.status(500).json({ error: "Failed to update position" });
  }
});

app.get("/api/v1/coingecko", async (req, res) => {
  const ids = req.query.ids;
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Failed to fetch from CoinGecko", err);
    res.status(500).json({ error: "CoinGecko fetch failed" });
  }
});

app.get("/api/v1/coingecko/market_chart", async (req, res) => {
  const { geckoId, from, to } = req.query;

  if (!geckoId || !from || !to) {
    return res.status(400).json({ error: "Missing required query parameters" });
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Failed to fetch from CoinGecko", err);
    res.status(500).json({ error: "Failed to fetch market chart data" });
  }
});

app.use(express.static('public'));

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
