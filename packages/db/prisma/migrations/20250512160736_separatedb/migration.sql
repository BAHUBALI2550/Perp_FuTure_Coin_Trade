-- CreateTable
CREATE TABLE "UserClosed" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "coinName" TEXT NOT NULL,
    "leverage" DOUBLE PRECISION NOT NULL,
    "positionType" "PositionType" NOT NULL,
    "currentPositionSize" DOUBLE PRECISION NOT NULL,
    "collateral" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "markPrice" DOUBLE PRECISION NOT NULL,
    "liquidationPrice" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stopLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentPnL" DOUBLE PRECISION NOT NULL,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3),
    "lastFeeCalculatedTime" TIMESTAMP(3),

    CONSTRAINT "UserClosed_pkey" PRIMARY KEY ("id")
);
