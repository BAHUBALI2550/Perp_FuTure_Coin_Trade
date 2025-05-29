import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Wallet, Settings, LogOut } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import io from 'socket.io-client';
import { Connection, PublicKey, Transaction, clusterApiUrl, SystemProgram } from '@solana/web3.js';
import { utils, BN, Program } from '@coral-xyz/anchor';

import {Buffer} from 'buffer';
window.Buffer = window.Buffer || Buffer;

const PROGRAM_ID = "5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc";
const NETWORK = clusterApiUrl("devnet");

function toLamports(amount) {
  return Math.floor(Number(amount) * 1_000_000_000);
}


const connection = new Connection("https://api.devnet.solana.com");


const tokens = [
  {
    symbol: "SOL",
    geckoId: "solana",
    name: "Solana",
    img: "https://cdn-icons-png.flaticon.com/128/17978/17978842.png",
    price: 172.03,
    change: 0.10
  },
  {
    symbol: "ETH",
    geckoId: "ethereum",
    name: "Ethereum",
    img: "https://cdn-icons-png.flaticon.com/128/4123/4123821.png",
    price: 3112.43,
    change: -0.62
  },
  {
    symbol: "WBTC",
    geckoId: "wrapped-bitcoin",
    name: "Wrapped BTC",
    img: "https://cdn-icons-png.flaticon.com/128/4935/4935054.png",
    price: 62783.49,
    change: 0.27
  }
];


const tabOptions = [
  { label: "Long/Buy" },
  { label: "Short/Sell" }
];
const orderTypes = ["Market", "Limit"];
const leverages = [1.1, 20, 40, 60, 80, 100];

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function PhantomIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Phantom wallet" className="inline-block align-middle">
      <circle cx="16" cy="16" r="16" fill="#7C3AED" />
      <ellipse cx="20.67" cy="13.33" rx="1.67" ry="2.13" fill="#fff" />
      <ellipse cx="11.33" cy="13.33" rx="1.67" ry="2.13" fill="#fff" />
      <path d="M10.8 19.19c1.32 2.03 6.09 2.06 7.37.01a.67.67 0 1 1 1.13.73C17.03 22.77 10.97 22.77 8.7 19.93a.66.66 0 1 1 1.12-.74c.08.13.17.27.28.4a5.2 5.2 0 0 0 .7.6zm0 0" fill="#fff" />
    </svg>
  );
}

const WALLET_STATES = {
  UNAVAILABLE: "UNAVAILABLE",
  IDLE: "IDLE",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED"
};


function TopNavbar({ setWalletAddr, setSocket, setPositions }) {
  const [walletAvail, setWalletAvail] = useState(false);
  const [provider, setProvider] = useState(null);
  const [state, setState] = useState(WALLET_STATES.IDLE);
  const [pubKey, setPubKey] = useState(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const walletAddr =
    typeof pubKey === "string"
      ? pubKey
      : pubKey?.toBase58?.() ?? "";

  useEffect(() => {
    if ("solana" in window) {
      const solWindow = window;
      if (solWindow?.solana?.isPhantom) {
        setProvider(solWindow.solana);
        setWalletAvail(true);
        solWindow.solana.connect({ onlyIfTrusted: true }).catch(() => {});
      }
    } else {
      setWalletAvail(false);
      setProvider(null);
      setState(WALLET_STATES.UNAVAILABLE);
    }
  }, []);

  useEffect(() => {
    if (!provider) return;

    const onConnect = (pk) => {
      setState(WALLET_STATES.CONNECTED);
      setPubKey(pk);
    };
    const onDisconnect = () => {
      handleWalletDisconnect();
    };
    const onAccountChanged = (newPubKey) => {
      if (newPubKey) {
        setPubKey(newPubKey);
      } else {
        handleWalletDisconnect();
      }
    };

    provider.on("connect", onConnect);
    provider.on("disconnect", onDisconnect);
    provider.on("accountChanged", onAccountChanged);

    return () => {
      
    };
  }, [provider]);

  useEffect(() => {
    if (walletAddr) {
      setWalletAddr(walletAddr);
      const newSocket = io("http://localhost:3001");
      newSocket.emit("register", walletAddr);
      setSocket(newSocket);
    }
  }, [walletAddr]);

  const handleWalletDisconnect = () => {
    setPubKey(null);
    setWalletAddr(null);
    setState(WALLET_STATES.IDLE);
    setWalletMenuOpen(false);
    setErrorMsg("");
    setPositions([]); // clear position data
    if (typeof socket?.disconnect === "function") {
      socket.disconnect();
    }
    setSocket(null);
  };

  const handleConnect = async () => {
    if (!provider || state === WALLET_STATES.CONNECTING) return;
    setState(WALLET_STATES.CONNECTING);
    setErrorMsg("");
    try {
      const wallet = await provider.connect();
      setPubKey(wallet.publicKey);
      setState(WALLET_STATES.CONNECTED);
      setWalletMenuOpen(false);
    } catch (err) {
      setErrorMsg("Connect ERROR: " + (err?.message || "Unknown"));
      handleWalletDisconnect();
    }
  };

  const handleDisconnect = async () => {
    if (!provider) return;
    try {
      await provider.disconnect();
      await new Promise((res) => setTimeout(res, 500));
      handleWalletDisconnect();
    } catch (err) {
      setErrorMsg("Disconnect ERROR: " + (err?.message || "Unknown"));
    }
  };

  // Mask wallet address for UI
  function maskWallet(addr) {
    if (!addr || typeof addr !== "string" || addr.length < 8) return addr || "";
    return addr.slice(0, 4) + "..." + addr.slice(-4);
  }

  const handleChangeAccount = async () => {
  if (!provider) return;
  setErrorMsg("");
  try {
    const wallet = await provider.connect({ onlyIfTrusted: false }); 
    setPubKey(wallet.publicKey); // update pubkey if switched accounts
    setState(WALLET_STATES.CONNECTED);
    setWalletMenuOpen(false);
  } catch (err) {
    setErrorMsg("Change Account ERROR: " + (err?.message || "Unknown"));
  }
};

  return (
    <nav className="navbar w-full bg-white dark:bg-zinc-950 shadow flex justify-between items-center p-0 lg:px-8 px-3 py-2 z-50 relative transition-colors duration-300">
      <div className="navbar-left flex items-center gap-2 md:gap-4">
        <img src="https://cdn.jsdelivr.net/gh/solana-labs/explorer/public/favicon.ico" className="logo h-9 w-9 rounded-xl hover:scale-105 shadow transition-transform" alt="Logo" />
        <span className="brand text-xl font-bold text-purple-600 dark:text-violet-300 tracking-widest ml-2 select-none">Jup.ag</span>
        <span className="nav-item ml-3 text-zinc-700 dark:text-zinc-100 font-semibold hover:text-purple-600 cursor-pointer transition-colors">Spot</span>
        <span className="nav-new text-xs px-1.5 py-0.5 font-bold rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white dark:from-violet-600 dark:to-fuchsia-600 ml-1 animate-bounce shadow-sm">New</span>
        <span className="nav-item nav-perps ml-3 text-zinc-700 dark:text-zinc-100 font-semibold hover:text-fuchsia-600 cursor-pointer transition-colors">Perps</span>
        <span className="nav-item ml-3 text-zinc-700 dark:text-zinc-100 font-semibold hover:text-purple-600 cursor-pointer transition-colors">Pro</span>
        <span className="nav-item ml-3 text-zinc-700 dark:text-zinc-100 font-semibold hover:text-purple-600 cursor-pointer transition-colors">More</span>
      </div>
      <div className="navbar-right flex items-center gap-2 md:gap-3 relative">
        {/* If phantom unavailable, show install prompt */}
        {!walletAvail && (
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="connect-btn px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-md hover:brightness-105 active:scale-95 focus:outline-none transition-all duration-200 w-36 flex items-center justify-center gap-2"
            aria-label="Install Phantom Wallet"
          >
            <PhantomIcon size={18} />
            <span>Install Phantom</span>
          </a>
        )}
        {/* Connect button if not connected */}
        {walletAvail && state !== WALLET_STATES.CONNECTED && (
          <button
            // className="connect-btn px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-md hover:brightness-105 active:scale-95 focus:outline-none transition-all duration-200 w-32 flex items-center justify-center gap-2"
            onClick={handleConnect}
            disabled={state === WALLET_STATES.CONNECTING}
            aria-label="Connect to Phantom"
            tabIndex={0}
          >
            {state === WALLET_STATES.CONNECTING ? (
              <span className="loader spinner mr-2" aria-label="Loading" />
            ) : (
              <PhantomIcon size={18} />
            )}
            <span>
              {state === WALLET_STATES.CONNECTING ? "Connecting..." : "Connect"}
            </span>
          </button>
        )}
        {/* Connected state: wallet menu */}
        {walletAvail && state === WALLET_STATES.CONNECTED && (
          <div className="relative">
            <button
              // className="wallet-btn flex items-center px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-50 dark:hover:bg-zinc-700 shadow-md hover:shadow-lg transition-all duration-200 font-mono text-base text-zinc-800 dark:text-zinc-50 font-bold gap-2 outline-none focus:ring-2 focus:ring-violet-400"
              style={{ position: "absolute", top: 10, right: 90 }}
              aria-haspopup="menu"
              aria-expanded={walletMenuOpen}
              onClick={e => {
                e.stopPropagation();
                setWalletMenuOpen((v) => !v);
              }}
              tabIndex={0}
            >
              <PhantomIcon size={19} />
              <span title={walletAddr} className="truncate max-w-[80px]">
                {maskWallet(walletAddr)}
              </span>
              <svg viewBox="0 0 22 22" width={16} className="ml-1" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 9l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Dropdown Menu */}
            {walletMenuOpen && (
  <div
    style={{
      animation: "fadeIn 0.22s",
      position: "absolute",
      top: 60,
      right: 100,
      border: "4px solid black",
      padding: "12px",
      borderRadius: "12px",
      backgroundColor: "grey",
    }}
    onClick={e => e.stopPropagation()}
    role="menu"
    aria-label="Wallet actions"
  >
    <button
      onClick={handleChangeAccount}
      disabled={!walletAvail || state !== WALLET_STATES.CONNECTED}
      className="flex items-center w-full px-4 py-2 gap-2 hover:bg-violet-50 dark:hover:bg-zinc-800 active:bg-violet-100 dark:active:bg-zinc-700 transition-all text-zinc-800 dark:text-zinc-100"
      tabIndex={0}
      aria-label="Change Account"
    >
      <Settings size={18} className="text-purple-500" />
      <span className="font-medium">Change Account</span>
    </button>

    <button
      onClick={handleDisconnect}
      className="flex items-center w-full px-4 py-2 gap-2 hover:bg-violet-50 dark:hover:bg-zinc-800 active:bg-violet-100 dark:active:bg-zinc-700 transition-all text-zinc-800 dark:text-zinc-100"
      tabIndex={0}
      aria-label="Logout"
    >
      <LogOut size={18} className="text-fuchsia-600" />
      <span className="font-medium"> Logout</span>
    </button>

    <div className="px-4 py-2 mt-0.5 text-xs text-zinc-400 dark:text-zinc-600 break-all select-text cursor-pointer">
      {walletAddr}
    </div>
  </div>
)}

          </div>
        )}
        {/* Settings Button always visible */}
        <button
          className="icon-btn p-2 ml-3 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 shadow transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-400"
          aria-label="Settings"
          tabIndex={0}
        >
          <Settings size={18} className="text-zinc-500 dark:text-zinc-300" />
        </button>
        {/* Toast / Error */}
        {/* {errorMsg && (
          <div className="fixed bottom-6 right-6 px-6 py-3 bg-rose-700 text-white font-semibold rounded-2xl shadow-md z-[80] animate-fadeIn">
            {errorMsg}
          </div>
        )} */}
      </div>
      {/* Animations */}
      <style>
        {`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px);} to { opacity: 1; transform: none; } }
        .spinner {
          border: 2px solid #e9d5ff;
          border-top: 2px solid #7C3AED;
          border-radius: 50%;
          width: 17px; height: 17px; animation: spin 0.7s linear infinite;
          display: inline-block; vertical-align: middle;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}
      </style>
      {/* Outside click closes dropdown */}
      {walletMenuOpen && (
        <div
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-30"
          onClick={() => setWalletMenuOpen(false)}
        />
      )}
    </nav>
  );
}


function MarketSelector({ currentToken, setToken }) {
  return (
    <div className="market-selector">
      {tokens.map(token => (
        <button
          key={token.symbol}
          onClick={() => setToken(token)}
          className={currentToken.symbol === token.symbol ? "token-btn active" : "token-btn"}
        >
          <img src={token.img} alt={token.symbol} className="token-img" />
          {token.symbol}
        </button>
      ))}
      <button className="earn-btn">Earn</button>
    </div>
  );
}

function ChartHeader({ token, toggleIndicator }) {
  return (
    <div className="chart-header">
      <div className="chart-header-left">
        <span className="chart-header-item">5m</span>
        <span className="chart-header-item">15m</span>
        <span className="chart-header-item">1h</span>
        <span className="chart-header-divider">|</span>
        <span className="chart-header-indicator" onClick={toggleIndicator} style={{ cursor: 'pointer' }}>
          {/* SVG icon */}
          <svg width="18" height="18" className="inline mr-1" style={{ verticalAlign: 'middle' }}>
            <rect x="3" y="6" width="12" height="6" rx="2" fill="#196e52" />
          </svg>
          <span>Indicators</span>
        </span>
      </div>
      <div className="chart-header-right">
        <span
          className="price-status up"
        >
          O{(token.price - 0.2).toFixed(2)} H{(token.price + 4.05).toFixed(2)} L{(token.price - 3.26).toFixed(2)} C{token.price.toFixed(2)} ({token.change > 0 ? "+" : ""}{token.change}%)
        </span>
      </div>
    </div>
  );
}

function TradingChart({ token }) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);
  const [showCandles, setShowCandles] = useState(false);

  const toggleChartType = () => setShowCandles(prev => !prev);


  const fetchCoinGeckoChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - 60 * 120; // Last 60 mins
    try {
      const response = await fetch(
      `http://localhost:3001/api/v1/coingecko/market_chart?geckoId=${token.geckoId}&from=${startTime}&to=${endTime}`
      );
      const data = await response.json();
      if (!data.prices) throw new Error('Invalid data');

      const chartData = data.prices.map(([timestamp, price]) => ({
        time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price,
      }));
      setChartData(chartData);
    } catch (err) {
      setError("Failed to load chart");
      setChartData([]);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchCoinGeckoChart();
    const interval = setInterval(fetchCoinGeckoChart, 60000); // 1 min
    return () => clearInterval(interval);
  }, [fetchCoinGeckoChart]);

  return (
    <div className="trading-chart" style={{ padding: "18px", minHeight: 440 }}>
      {loading ? (
        <div className="chart-loading">Loading...</div>
      ) : error ? (
        <div className="chart-error">{error}</div>
      ) : chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#172230" />
            <XAxis dataKey="time" tick={{ fill: "#a8b2c5", fontSize: 12 }} angle={-45} textAnchor="end" />
            <YAxis width={60} tick={{ fill: "#a8b2c5", fontSize: 12 }} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ color: "#10151c", background: "#d3e3cb" }}
              formatter={(value, name) => [`$${parseFloat(value).toFixed(2)}`, name === "price" ? "Price" : ""]}
              labelStyle={{ color: "#0c162a" }}
            />
            <Line type="monotone" dataKey="price" stroke="#4dbc70" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="chart-error">No historical price data.</div>
      )}
    </div>
  );
}

function OrderPanel({ token, walletAddr }) {
  const [selectedTab, setSelectedTab] = useState(0);
  const [orderType, setOrderType] = useState("Market");
  const [inputAmount, setInputAmount] = useState("");
  const [leverageIdx, setLeverageIdx] = useState(0);
  const [slippage, setSlippage] = useState(2.0);
  const [showInput, setShowInput] = useState(true);
   const [marketData, setMarketData] = useState({
    price: token.price,
    volume: 0,
    high: 0,
    low: 0,
    change: token.change,
  });

   const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [idl, setIdl] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('../escrow/trading_escrow/target/idl/trading_escrow.json');
        if (!res.ok) throw new Error('IDL not found.');
        const data = await res.json();
        setIdl(data);
      } catch (e) {
        setFeedback("Failed to load program interface (IDL).");
      }
    })();
  }, []);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/v1/coingecko?ids=solana");
        const data = await res.json();
        const sol = data[0];
        setMarketData({
          price: sol.current_price,
          volume: sol.total_volume,
          high: sol.high_24h,
          low: sol.low_24h,
          change: sol.price_change_percentage_24h,
        });
      } catch (e) {
        console.error("Failed to fetch market data", e);
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 25000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async () => {
    setFeedback("");
    if (!inputAmount || !walletAddr) return;

    if (!idl) {
      setFeedback("Anchor program interface loading...");
      return;
    }

    try {
      
      const backendWallet = new PublicKey(import.meta.env.VITE_BACKEND_PUBLIC_KEY);
      const now = new Date().toISOString();
      const leverage = leverages[leverageIdx];
      const positionType = selectedTab === 0 ? "LONG" : "SHORT";
      const posSize = inputAmount * leverage;
      const collateral = inputAmount * 1000000000;
      const entryPrice = marketData.price;
      const liquidationPrice = selectedTab === 0
        ? entryPrice * (1 - 1 / leverage)
        : entryPrice * (1 + 1 / leverage);

  //     const tx = new Transaction().add(
  //       SystemProgram.transfer({
  //         fromPubkey: new PublicKey(walletAddr),
  //         toPubkey: backendWallet,
  //         lamports: inputAmount * 1000000000, // Convert SOL → lamports
  //       })
  //     );

  //     tx.feePayer = new PublicKey(walletAddr);
  // const { blockhash } = await connection.getRecentBlockhash();
  // tx.recentBlockhash = blockhash;

  //     const signedTx = await window.solana.signTransaction(tx);
  // const rawTx = signedTx.serialize();
  
    try {
      setIsSubmitting(true);

      // Setup provider/connection
      const connection = new Connection(NETWORK, "confirmed");
      const walletPublicKey = new PublicKey(walletAddr);

      // Instantiate Program
      const programId = new PublicKey(PROGRAM_ID);
      const program = new Program(idl, programId);

      // Find PDAs
      const [userAccountPDA] = await PublicKey.findProgramAddressSync(
        [
          Buffer.from("user-acct"),
          walletPublicKey.toBuffer()
        ],
        programId
      );

      const [vaultStatePDA] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vault-state")],
        programId
      );

      const [solVaultPDA] = await PublicKey.findProgramAddressSync(
        [Buffer.from("sol-vault")],
        programId
      );

      // initialize user account in vault, only for the first time
      const resi = await fetch(`http://localhost:3001/api/v1/positions?walletId=${walletAddr}`);
        if (!resi.ok) throw new Error("API failed to fetch positions");
        const data1 = await resi.json();
        if (!data1.positions || data1.positions.length === 0) {
            // No positions found, initialize the user account
            const initializeInstruction = await program.methods.initializeUserAccount()
                .accounts({
                    user: walletPublicKey,
                    userAccount: userAccountPDA,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();
            const transaction1 = new Transaction().add(initializeInstruction);
            const { blockhash } = await connection.getLatestBlockhash();
            transaction1.recentBlockhash = blockhash;
            transaction1.feePayer = walletPublicKey;

            // Request wallet to sign, using the wallet adapter
            const signedTransaction = await window.solana.signTransaction(transaction1);
            // Ensure the transaction is serialized properly
            const rawTransaction = signedTransaction.serialize();
            // Send the signed transaction
            const signature = await connection.sendRawTransaction(rawTransaction, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
            });
            await connection.confirmTransaction(signature, 'confirmed');
            console.log("Initialized user account! Tx:", signature);
        }

      const lamports = new BN(toLamports(inputAmount));

      // Anchor, deposit
      const ix = await program.methods
        .deposit(lamports)
        .accounts({
          user: walletPublicKey,
          vaultState: vaultStatePDA,
          userAccount: userAccountPDA,
          solVault: solVaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);

      
      tx.feePayer = walletPublicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      

      // Request wallet to sign
      const signedTx = await window.solana.signTransaction(tx);

      const sig = await connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: false }
      );

      const payload = {
        signature: sig,
        walletId: walletAddr,
        coinName: token.symbol,
        leverage,
        positionType,
        currentPositionSize: parseFloat(posSize),
        collateral: parseFloat(collateral),
        entryPrice,
        markPrice: entryPrice,
        liquidationPrice,
        currentPnL: 0,
        openTime: now,
        lastFeeCalculatedTime: now,
      };

      const res = await fetch("http://localhost:3001/api/v1/buyorshort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      console.log("Position created:", data);

      setInputAmount(""); // Reset
    } catch (e) {
      console.error(e);
      setFeedback("Deposit failed: " + (e.message || e.toString()));
    } finally {
      setIsSubmitting(false);
    }

      
    } catch (e) {
      console.error("Failed to submit order", e);
    }
  };

 return (
    <section className="order-panel">
      <div className="order-panel-header">
        <div>
          <span className="order-price">${marketData.price.toFixed(2)}</span>
          <span className={marketData.change > 0 ? "order-chg up" : "order-chg down"}>
            {marketData.change > 0 ? "+" : ""}{marketData.change.toFixed(2)}%
          </span>
        </div>
        <div className="order-panel-stats">
          <span><span className="order-panel-stat-label">24H Vol</span> <b>${(marketData.volume / 1e6).toFixed(2)}M</b></span><br />
          <span><span className="order-panel-stat-label">24H High</span> <b>${marketData.high.toFixed(2)}</b></span><br />
          <span><span className="order-panel-stat-label">24H Low</span> <b>${marketData.low.toFixed(2)}</b></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="order-tabs">
        {tabOptions.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setSelectedTab(i)}
            className={selectedTab === i ? "order-tab active" : "order-tab"}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Order type toggle */}
      <div className="order-type-buttons">
        {orderTypes.map(type => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={orderType === type ? "order-type-btn active" : "order-type-btn"}
          >
            {type}
          </button>
        ))}
        <span className="order-type-price">${marketData.price.toFixed(2)}</span>
      </div>

      {/* Amount input */}
      <div className="order-input-block">
        <label className="order-amt-label">You're paying</label>
        <div className="order-amt-row">
          <img src={token.img} alt={token.symbol} className="token-img" />
          <span className="order-amt-token">{token.symbol}</span>
          <input
            type={showInput ? "text" : "password"}
            className="order-amt-input"
            placeholder="0.00"
            value={inputAmount}
            onChange={e => setInputAmount(e.target.value)}
            aria-label="Amount"
          />
          <button
            className="amt-eye"
            aria-label={showInput ? "Hide" : "Show"}
            onClick={() => setShowInput(!showInput)}
          >
            {showInput ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
        <div className="order-input-hint">0 {token.symbol}</div>
      </div>

      {/* Leverage selector */}
      <div className="leverage-block">
        <span className="leverage-label">Leverage</span>
        <div className="leverage-btns">
          {leverages.map((lev, idx) => (
            <button
              key={lev}
              onClick={() => setLeverageIdx(idx)}
              className={idx === leverageIdx ? "leverage-btn active" : "leverage-btn"}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      {/* Slippage & analytics */}
      <div className="order-panel-extra">
        <div>
          <span className="order-extra-label">Slippage:</span>
          <span className="order-extra-val">{slippage}%</span>
        </div>
        <div className="order-extra-stats">
          <div>Available Liq. <b>$2.50M</b></div>
          <div>Borrow Rate <b>0.0026% / hr</b></div>
        </div>
      </div>

      {/* Submit */}
      <button
        disabled={!inputAmount}
        onClick={handleSubmit}
        className={inputAmount ? "order-submit" : "order-submit disabled"}
      >
        {selectedTab === 0 ? "Long/Buy" : "Short/Sell"}
      </button>

      {/* Order summary */}
      <div className="order-footer">
        <div className="order-footer-row"><span>Entry Price</span><span>-</span></div>
        <div className="order-footer-row"><span>Liquidation Price</span><span>-</span></div>
        <div className="order-footer-row"><span>Total Fees</span><span>-</span></div>
        <div className="order-footer-row"><span>Borrow fees due</span><span>-</span></div>
      </div>
    </section>
  );
}

function PositionsTable({ walletAddr, socket, positions, setPositions, tokens }) {
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [showModal, setShowModal] = useState(false);
                const [activeTab, setActiveTab] = useState('open');
              const [transactionHistory, setTransactionHistory] = useState([]);

  useEffect(() => {
    if (!walletAddr) return;
    fetch(`http://localhost:3001/api/v1/positions?walletId=${walletAddr}`)
      .then((res) => res.json())
      .then((data) => setPositions(data.positions))
      .catch(() => console.log("Failed to load positions"));
  }, [walletAddr]);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (update) => {
      setPositions((prev) =>
        prev.map((pos) =>
          pos.id === update.id 
            ? { ...pos, markPrice: update.markPrice, currentPnL: update.currentPnL }
            : pos
        )
      );
    };

    const handleClose = (closed) => {
      setPositions((prev) => prev.filter((pos) => pos.id !== closed.id));
    };

    socket.on("positionUpdate", handleUpdate);
    socket.on("positionClosed", handleClose);

    return () => {
      socket.off("positionUpdate", handleUpdate);
      socket.off("positionClosed", handleClose);
    };
  }, [socket]);

                    useEffect(() => {
                    if (activeTab === 'transaction' && walletAddr) {
                      fetch(`http://localhost:3001/api/v1/transactions?walletId=${walletAddr}`)
                        .then((res) => res.json())
                        .then((data) => setTransactionHistory(data.transactions))
                        .catch(() => console.log("Failed to load transaction history"));
                    }
                  }, [activeTab, walletAddr]);

  const handleClose = async (positionId) => {
    try {
      await fetch(`http://localhost:3001/api/v1/positions/${positionId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to close position", err);
    }
  };

  const matchedToken = tokens.find(
    (t) => t.symbol.toUpperCase() === selectedPosition?.coinName.toUpperCase()
  );

  const openModal = (position) => {
    setSelectedPosition(position);
    setTakeProfit(position.takeProfit || "");
    setStopLoss(position.stopLoss || "");
    setShowModal(true);
  };

  const updateTPnSL = async () => {
    if (!selectedPosition) return;
    try {
      const res = await fetch(`http://localhost:3001/api/v1/positions/${selectedPosition.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selectedPosition,
          takeProfit: parseFloat(takeProfit),
          stopLoss: parseFloat(stopLoss),
        }),
      });

      const updated = await res.json();
      setPositions((prev) =>
        prev.map((pos) => (pos.id === updated.id ? updated : pos))
      );
      setShowModal(false);
    } catch (error) {
      console.error("Update failed", error);
    }
  };

  return (
    <>
      <div className="positions-table">
        <div className="positions-tabs">
          <div 
            className={`positions-tab \${activeTab === 'open' ? 'active' : ''}`} 
            onClick={() => setActiveTab('open')}
          >
            Open Positions
          </div>
          <div 
            className={`positions-tab \${activeTab === 'transaction' ? 'active' : ''}`} 
            onClick={() => setActiveTab('transaction')}
          >
            Transaction History
          </div>
        </div>
        <div className="positions-table-wrap">
          <table className="positions-main-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Value</th>
                <th>Size</th>
                <th>Collateral</th>
                <th>Entry / Mark Price</th>
                <th>Liq. Price</th>
                <th>Take Profit</th>
                <th>Stop Loss</th>
                <th><button className="close-all-btn">Close All</button></th>
              </tr>
            </thead>
            <tbody>
              {activeTab === 'open' ? (
              positions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="positions-table-hint">No open positions</td>
                </tr>
              ) : (
                positions.map((pos) => {

                   const token = tokens.find(t => t.symbol.toUpperCase() === pos.coinName.toUpperCase());

                  return (
                  <tr key={pos.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {token && (
                          <img src={token.img} alt={pos.coinName} width="24" />
                        )}
                        <span>{pos.coinName}</span>
                      </div>
                      <div style={{ color: '#6d7887', fontSize: '0.85rem' }}>
                        {pos.leverage.toFixed(2)}x {pos.positionType}
                      </div>
                    </td>
                    <td>
                      <div>{pos.currentPnL?.toFixed(4) || '0.00'}</div>
                      <div
                        style={{
                          color: pos.currentPnL > 0 ? '#1fe180' : '#ff4d4f',
                          fontSize: '0.85rem',
                        }}
                      >
                        +PNL%
                      </div>
                    </td>
                    <td>
                      <div>${pos.currentPositionSize.toFixed(2)}</div>
                      <div style={{ fontSize: '0.85rem', color: '#6d7887' }}>
                        {(pos.currentPositionSize / pos.entryPrice).toFixed(4)} {pos.coinName}
                      </div>
                    </td>
                    <td>
                      ${(pos.collateral/1000000000).toFixed(2)} <button className="edit-btn">Edit</button>
                    </td>
                    <td>{pos.entryPrice.toFixed(2)} / {pos.markPrice.toFixed(2)}</td>
                    <td style={{ color: '#ffcc00' }}>${pos.liquidationPrice.toFixed(2)}</td>
                    <td><button className="tp-btn" onClick={() => openModal(pos)}>Add TP</button></td>
                    <td><button className="sl-btn" onClick={() => openModal(pos)}>Add SL</button></td>
                    <td><button className="close-btn" onClick={() => handleClose(pos.id)}>Close</button></td>
                  </tr>
                );
})
              )
              ) : (
                // Transaction History Table
                transactionHistory.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="positions-table-hint">No transaction history</td>
                  </tr>
                ) : (
                  transactionHistory.map((transaction) => {
                    const token = tokens.find(t => t.symbol.toUpperCase() === transaction.coinName.toUpperCase());
                    return (
                      <tr key={transaction.id}>
                        <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {token && (
                          <img src={token.img} alt={transaction.coinName} width="24" />
                        )}
                        <span>{transaction.coinName}</span>
                      </div>
                      <div style={{ color: '#6d7887', fontSize: '0.85rem' }}>
                        {transaction.leverage.toFixed(2)}x {transaction.positionType}
                      </div>
                    </td>
                        {/* Display other relevant transaction details below */}
                        <td>${transaction.currentPnL.toFixed(2)}</td>
                        <td>${transaction.currentPositionSize.toFixed(2)}</td>
                        <td>${(transaction.collateral / 1000000000).toFixed(2)}</td>
                        <td>{transaction.entryPrice.toFixed(2)} / {transaction.markPrice.toFixed(2)}</td>
                        <td style={{ color: '#ffcc00' }}>${transaction.liquidationPrice.toFixed(2)}</td>
                        <td style={{ color: '#00ff00' }}>{transaction.takeProfit.toFixed(2)}</td>
                        <td style={{ color: '#ff0000' }}>{transaction.stopLoss.toFixed(2)}</td>
                        <td></td>
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>
      </div>




      {/* Full-screen Modal */}
      {showModal && selectedPosition && (
  <div className="modal-overlay">
    <div className="tp-sl-modal">
      <h2 className="modal-title">Take Profit & Stop Loss</h2>

      <div className="modal-summary-box">
  <div className="modal-summary-row">
    <div className="current-price-header">
  <div className="current-price-top">
    <div className="coin-with-text">
      <img src={matchedToken.img} alt={selectedPosition.coinName} width="20" height="20" />
      <span>Current Price</span>
    </div>
    <span className="current-price-value">${selectedPosition.markPrice.toFixed(2)}</span>
  </div>
  <div className="divider-line"></div>
</div>
  </div>
  <div className="modal-summary-row">
    <span>Entry Price:</span>
    <span>${selectedPosition.entryPrice.toFixed(2)}</span>
  </div>
  <div className="modal-summary-row">
    <span>Liquidation Price:</span>
    <span>${selectedPosition.liquidationPrice.toFixed(2)}</span>
  </div>
  <div className="modal-summary-row">
    <span>Leverage:</span>
    <span>{selectedPosition.leverage.toFixed(2)}x</span>
  </div>
  <div className="modal-summary-row">
    <span>Current P&L:</span>
    <span style={{ color: "#1fe180" }}>
      +${(selectedPosition.currentPnL || 0.07).toFixed(2)} (+7.72%)
    </span>
  </div>
  <div className="modal-summary-row">
    <span>Total Fees:</span>
    <span>{(selectedPosition.totalFees || 0.02385)}</span>
  </div>
  <div className="modal-summary-row">
    <span>Net P&L:</span>
    <span style={{ color: "red" }}>
      -${Math.abs(selectedPosition.currentPnL || 0.14).toFixed(2)} (-12.28%)
    </span>
  </div>
</div>

      <div className="modal-summary-row">
  <span>Take Profit Price:</span>
  <span style={{ color: "#1fe180" }}>
    +${(takeProfit && selectedPosition.markPrice
        ? (parseFloat(takeProfit) - selectedPosition.markPrice).toFixed(2)
        : "0.00"
    )} (+333.00%)
  </span>
</div>
<div className="modal-field">
  <input
    type="number"
    placeholder="Take Profit (USD)"
    value={takeProfit}
    onChange={(e) => setTakeProfit(e.target.value)}
  />
</div>

{/* Stop Loss Row */}
<div className="modal-summary-row">
  <span>Stop Loss Price:</span>
  <span style={{ color: "#e44" }}>
    -${(stopLoss && selectedPosition.markPrice
        ? (selectedPosition.markPrice - parseFloat(stopLoss)).toFixed(2)
        : "0.00"
    )} (-64.93%)
  </span>
</div>
<div className="modal-field">
  <input
    type="number"
    placeholder="Stop Loss (USD)"
    value={stopLoss}
    onChange={(e) => setStopLoss(e.target.value)}
  />
</div>

{/* Close Position In */}
<div className="modal-summary-row">
  <span>Close position in:</span>
  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <img
      src={matchedToken.img}
      alt={selectedPosition.coinName}
      width="20"
    />
    <span>{selectedPosition.coinName}</span>
  </span>
</div>
      <p className="modal-disclaimer">
        Take Profit and Stop Loss orders will remain in effect regardless of any changes to your collateral or position size. <br />
        TPSL will not be executed if your token account is closed.
      </p>

      <div className="modal-actions">
        <button className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
        <button className="confirm-btn" onClick={updateTPnSL}>Confirm</button>
      </div>
    </div>
  </div>
)}
    </>
  );
}


const App = () => {
  const [currentToken, setToken] = useState(tokens[0]);
  const [walletAddr, setWalletAddr] = useState(null);
  const [socket, setSocket] = useState(null);
  const [positions, setPositions] = useState([]);

  
  return (
    <div className="main-bg">
      <style>{`
        body {
          background: #13171f;
        }
        .main-bg {
          min-height: 100vh;
          background: #13171f;
          color: #d0d8e7;
          font-family: 'Inter', sans-serif;
        }
        .navbar {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #10151c;
          border-bottom: 1px solid #23282d;
        }
        .navbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 1rem;
        }
        .logo { width: 32px; height: 32px; margin-right: 8px;}
        .brand { color: #fff; font-size: 1.35rem; font-weight: 700;}
        .nav-item {
          margin-left: 1.5rem;
          color: #fff;
          opacity: 0.8;
          font-size: 0.97rem;
          cursor: pointer;
        }
        .nav-item:hover { opacity: 1; }
        .nav-perps { font-weight: 600; }
        .nav-new {
          margin-left: 1.3rem;
          color: #16ff89;
          background: #1f2d26;
          padding: 2px 8px;
          border-radius: 5px;
          font-size: 0.85rem;
          font-weight: 700;
          position: relative;
        }
        .navbar-right {
          display: flex;
          gap: 10px;
          align-items: center;
          padding-right: 1.3rem;
        }
        .connect-btn {
          padding: 7px 24px;
          border-radius: 7px;
          background: #223b28;
          color: #32ef92;
          font-weight: 600;
          border: none;
          cursor: pointer;
        }
        .connect-btn:hover {
          background: #295e37;
        }
        .icon-btn {
          margin-left: 12px;
          border-radius: 100vw;
          background: #23282d;
          width: 32px;
          height: 32px;
          border: none;
          color: #a0adba;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .market-selector {
          display: flex;
          align-items: center;
          gap: 30px;
          padding: 1.1rem 2rem;
          background: #131a23;
          border-bottom: 1px solid #23282d;
        }
        .token-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.18rem;
          font-weight: 700;
          padding: 10px 22px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: #a8b2c5;
          transition: 0.2s;
          box-shadow: none;
          cursor: pointer;
        }
        .token-btn:hover { background: #22343d33; color: #fff; }
        .token-btn.active {
          background: linear-gradient(90deg,#19203b 55%,#1f4030 100%);
          color: #fff;
        }
        .token-img { width: 24px; height: 24px; }
        .earn-btn {
          margin-left: 20px;
          background: #25331c;
          color: #87e27b;
          border: none;
          border-radius: 5px;
          font-weight: 700;
          font-size: 1rem;
          padding: 7px 24px;
          cursor: pointer;
        }
        .earn-btn:hover { background: #345032; }
        .chart-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #151a25;
          border-bottom: 1px solid #23282d;
          padding: 12px 20px 12px 16px;
          font-size: 0.96rem;
        }
        .chart-header-left {
          display: flex;
          gap: 14px;
          color: #a9b8d1;
          align-items: center;
        }
        .chart-header-item {
          cursor: pointer;
          opacity: 0.9;
        }
        .chart-header-item:hover {color: #fff;}
        .chart-header-divider { margin: 0 18px;}
        .chart-header-indicator { display: flex; align-items: center;}
        .chart-header-right {
          display: flex;
          gap: 1.3rem;
          align-items: center;
        }
        .price-status {
          font-weight: 600;
        }
        .price-status.up { color: #9ce39a; }
        .price-status.down { color: #f56e92; }
        .icon-btn-sm {
          background: none;
          border: none;
          color: #b8c9de;
          opacity: 0.7;
          margin: 0 2px;
          cursor: pointer;
        }
        .icon-btn-sm:hover { opacity: 1;}
        main {
          width: 100%;
          display: flex;
          flex: 1 1 0;
        }
        .flex-1 { flex: 1;}
        .block-wrap { display: flex; flex: 1;}
        .trading-chart {
          background: #181e2b;
          border-radius: 13px;
          border: 1px solid #23282d;
          height: 440px;
          width: 100%;
          min-width: 650px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .chart-placeholder {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.60;
        }
        .chart-label {
          position: absolute;
          padding: 7px 15px;
          border-radius: 16px;
          font-weight: 700;
          font-size: 0.982rem;
          z-index: 3;
        }
        .chart-label.high {
          left: 18px;
          top: 18px;
          background: #192f20;
          color: #8edd95;
        }
        .chart-label.price {
          right: 18px;
          top: 48%;
          background: #1d2738;
          color: #fff;
          font-weight: 700;
          font-size: 1.13rem;
          transform: translateY(-50%);
        }
        .chart-label.low {
          left: 18px;
          bottom: 18px;
          background: #233045;
          color: #a8b2c5;
          font-size: 0.91rem;
        }
        .order-panel {
          min-width: 360px;
          max-width: 400px;
          border-radius: 13px;
          background: #181e23;
          border: 1px solid #23282d;
          color: #d0d8e7;
          padding: 32px 28px 22px 28px;
          box-shadow: 0 8px 36px 0 #181d23cc;
          height: fit-content;
          margin-left: 32px;
        }
        .order-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 3px;
        }
        .order-price {
          font-size: 2.1rem;
          font-weight: 700;
          color: #fff;
          margin-right: 7px;
        }
        .order-chg {
          margin-top: 8px;
          font-size: 0.99rem;
          font-weight: 600;
          display: block;
        }
        .order-chg.up { color: #36cf75; }
        .order-chg.down { color: #e54c7d; }
        .order-panel-stats { font-size: 0.88rem; text-align: right; color: #c9cfd7;}
        .order-panel-stat-label { color: #c9cfd7; opacity: 0.80; margin-right: 6px;}
        .order-tabs {
          display: flex;
          margin: 15px 0 11px 0;
          gap: 11px;
        }
        .order-tab {
          flex: 1 1 0;
          padding: 10px;
          border-radius: 8px;
          font-size: 1.04rem;
          font-weight: 700;
          color: #b9bec5;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.18s;
        }
        .order-tab.active {
          background: #12e57018;
          color: #12e570;
        }
        .order-tab:hover:not(.active) { background: #36364523;}
        .order-type-buttons {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 17px;
        }
        .order-type-btn {
          padding: 8px 20px;
          border-radius: 23px;
          font-size: 1.045rem;
          font-weight: 600;
          background: none;
          color: #a8b2c5;
          border: none;
          cursor: pointer;
        }
        .order-type-btn.active {
          color: #7efec1;
          background: #23343c;
          border: 2px solid #7efec1;
        }
        .order-type-btn:hover:not(.active) { background: #222c3923;}
        .order-type-price {
          margin-left: auto;
          font-size: 1.24rem;
          font-weight: 800;
          color: #fff;
        }
        .order-input-block {
          margin: 15px 0;
        }
        .order-amt-label {
          color: #8696a7;
          font-size: 0.92rem;
          margin-bottom: 1px;
          display: block;
        }
        .order-amt-row {
          display: flex;
          align-items: center;
          background: #14191f;
          border-radius: 7px;
          padding: 9px 9px;
        }
        .order-amt-token {
          font-size: 1.08rem;
          font-weight: 700;
          margin-left: 3px;
        }
        .order-amt-input {
          flex: 1 1 0px;
          padding: 0px 13px;
          font-size: 1.32rem;
          font-weight: 700;
          background: transparent;
          color: #e3e5fd;
          border: none;
          outline: none;
          margin-left: 10px;
          text-align: right;
        }
        .amt-eye {
          background: none;
          border: none;
          margin-left: 12px;
          color: #727d96;
          cursor: pointer;
        }
        .order-input-hint {
          text-align: right;
          font-size: 0.97rem;
          color: #a8b2c5;
          margin-top: 3px;
        }
        .leverage-block {
          display: flex;
          align-items: center;
          gap: 17px;
          margin: 18px 0 8px 0;
        }
        .leverage-label {
          font-size: 1.07rem;
          font-weight: 700;
          margin-right: 10px;
        }
        .leverage-btns {
          display: flex;
          gap: 7px;
          flex: 1;
          flex-wrap: wrap;
        }
        .leverage-btn {
          background: #202a37;
          color: #a8b2c5;
          border: none;
          padding: 6px 13px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 1.05rem;
          cursor: pointer;
          transition: 0.18s;
        }
        .leverage-btn.active {
          background: #10dd79;
          color: #fff;
          transform: scale(1.07);
        }
        .leverage-btn:hover:not(.active) { background: #222c39;}
        .order-panel-extra {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 8px;
          margin-bottom: 14px;
        }
        .order-extra-label {
          font-size: 0.96rem;
          color: #a8b2c5;
          margin-right: 8px;
        }
        .order-extra-val {
          background: #232b2f;
          color: #f8e15b;
          border-radius: 15px;
          font-weight: 700;
          padding: 2.5px 11px;
          font-size: 0.97rem;
          margin-left: 0.3rem;
        }
        .order-extra-stats {
          text-align: right;
          color: #a8b2c5;
          font-size: 0.95rem;
        }
        .order-submit, .order-submit.disabled {
          width: 100%;
          padding: 15px 0;
          border: none;
          border-radius: 10px;
          font-weight: 900;
          font-size: 1.21rem;
          margin: 25px 0 0 0;
          box-shadow: 0 2px 30px #00ffae21;
          transition: 0.19s;
          cursor: pointer;
        }
        .order-submit {
          background: #2efc95;
          color: #071516;
        }
        .order-submit:hover:not(.disabled) {
          background: #37f196;
        }
        .order-submit.disabled {
          background: #193038 !important;
          color: #6d7887;
          cursor: not-allowed;
          box-shadow: none;
        }
        .order-footer {
          margin-top: 24px;
          border-top: 1px solid #23282d;
          padding-top: 10px;
          font-size: 1rem;
        }
        .order-footer-row {
          display: flex;
          justify-content: space-between;
          margin: 0.2em 0;
          color: #85accf;
        }
        /* Table section */
        .positions-table {
          padding: 20px;
          color: #dde5f3;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .positions-tabs {
          display: flex;
          margin-bottom: 16px;
        }

        .positions-tab {
          padding: 8px 16px;
          background: #1f2633;
          color: #a8b2c5;
          border-radius: 6px;
          margin-right: 8px;
          cursor: pointer;
          position: relative;
        }

        .positions-tab.active {
          background: #2a323f;
          color: #fff;
          border: 2px solid #1fe180; /* Green border for active tab */
          padding: 6px 14px;
      }

        .positions-table-wrap {
          overflow-x: auto;
        }

        .positions-main-table {
          width: 100%;
          border-collapse: collapse;
          background: #1a1f2d;
          border-radius: 12px;
          overflow: hidden;
        }

        .positions-main-table th,
        .positions-main-table td {
          padding: 12px 16px;
          text-align: left;
          font-size: 0.95rem;
        }

        .positions-main-table th {
          background: #202737;
          color: #a8b2c5;
        }

        .positions-main-table tr:nth-child(even) {
          background: #1f2633;
        }

        .positions-main-table tr:nth-child(odd) {
          background: #252c3b;
        }

        .positions-table-hint {
          text-align: center;
          padding: 20px;
          color: #6d7887;
        }

        /* Buttons */
        .close-all-btn,
        .close-btn,
        .tp-btn,
        .sl-btn,
        .edit-btn {
          padding: 6px 12px;
          font-size: 0.85rem;
          font-weight: bold;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .close-all-btn {
          background: #ff4d4f;
          color: white;
        }

        .close-btn {
          background: #ff5e57;
          color: white;
        }

        .tp-btn,
        .sl-btn {
          background: #2a323f;
          color: #1fe180;
        }

        .edit-btn {
          background: #2a323f;
          color: #a8b2c5;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 9999;
          width: 100vw;
          height: 100vh;
          background-color: rgba(18, 21, 26, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          backdrop-filter: blur(5px);
        }

        .current-price-section {
  margin-bottom: 16px;
}

.current-price-header {
  width: 100%;
  margin-bottom: 20px;
}

.current-price-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.1rem;
  font-weight: 500;
  color: #f1f5f9;
  padding: 0 4px;
}

.current-price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.coin-with-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.coin-with-text .label {
  font-size: 1.1rem;
  font-weight: 500;
  color: #cbd5e1; /* Bright and readable */
}

.coin-with-price {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-price-label {
  font-size: 1.05rem;
  color: #cfd9e4;
}

.current-price-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: #ffffff;
}

.divider-line {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, #334155, #475569);
  margin-top: 10px;
  border-radius: 2px;
}

.modal-hint {
  font-size: 0.78rem;
  color: #8793a1;
  margin-top: 12px;
  margin-bottom: 16px;
}

        .tp-sl-modal {
          background-color: #1e222d;
          color: white;
          padding: 30px 24px;
          border-radius: 10px;
          width: 400px;
          max-width: 90%;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        }

        .modal-title {
  font-size: 1.2rem;
  margin-bottom: 16px;
}

.modal-summary-box {
  background-color: #14171f;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  color: #ccc;
}

.modal-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.92rem;
}

.modal-summary-row span:first-child {
  color: #aaa;
}


.modal-price-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #fff;
}

.modal-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

.modal-field {
  margin-bottom: 20px;
}

.modal-field label {
  color: #aaa;
  font-size: 14px;
  margin-bottom: 4px;
  display: block;
}

.input-info {
  font-size: 12px;
  margin-bottom: 4px;
}

.modal-field input {
  width: 100%;
  padding: 10px 12px;
  background: #1b1e26;
  border: 1px solid #2b2f38;
  border-radius: 6px;
  color: #fff;
  font-size: 1rem;
}

.expected-value {
  margin-top: 4px;
  font-size: 12px;
  color: #888;
}

.modal-close-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  margin-top: 20px;
  color: #ccc;
}

.modal-disclaimer {
  font-size: 12px;
  color: #666;
  margin: 12px 0;
  line-height: 1.4;
}

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }

        .cancel-btn, .confirm-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: bold;
          border: none;
          cursor: pointer;
        }

        .cancel-btn {
          background-color: #444;
          color: white;
        }

        .confirm-btn {
          background-color: #00c47c;
          color: white;
        }


        /* Blur background when modal is active */
        .blurred {
          filter: blur(2px);
          pointer-events: none;
          user-select: none;
        }


        /* Responsive (basic for width) */
        @media(max-width: 1190px) {
          .trading-chart { min-width: 420px;}
          .order-panel { min-width: 300px; margin-left: 14px;}
          .main-bg { padding-left: 0 !important;}
        }
        @media(max-width: 930px) {
          .market-selector { flex-wrap: wrap;}
          .trading-chart { min-width: 0; height: 270px;}
          .order-panel { padding: 18px 7px;}
          .positions-main-table th, .positions-main-table td { padding: 8px 5px;}
        }
        @media(max-width: 720px) {
          .main-bg, body { padding: 0;}
          .chart-header, .market-selector {padding-left: 7px; padding-right: 7px;}
          main { flex-direction: column;}
          .order-panel { margin: 15px 6px 30px 6px; width: auto;}
        }
      `}
      </style>
      <TopNavbar 
        setWalletAddr={setWalletAddr}
        setSocket={setSocket}
        setPositions={setPositions}
      />
      <MarketSelector currentToken={currentToken} setToken={setToken} />
      <main>
        <section style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <ChartHeader token={currentToken} />
          <div style={{ display: 'flex', flex: 1, padding: "22px 12px 0 12px", gap: "28px" }}>
            <div style={{ flex: 1 }}>
              <TradingChart token={currentToken} />
              {<PositionsTable 
                walletAddr={walletAddr}
                socket={socket}
                positions={walletAddr ? positions : []}
                setPositions={setPositions}
                tokens={tokens}
              /> }
            </div>
            <div>
              <OrderPanel 
              token={currentToken}
              walletAddr={walletAddr}
               />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;





