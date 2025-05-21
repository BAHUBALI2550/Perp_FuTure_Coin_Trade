// server/services/marketComputation.js

export async function checkStopLosses(prisma) {
    // 1. Get all open positions
    const openPositions = await prisma.user.findMany({ where: { status: true } });

    for (const pos of openPositions) {
        const latestMarkPrice = await getLatestMarkPrice(pos.coinName);

        // Example stop loss condition (LONG and SHORT logic)
        const triggerStopLoss =
            (pos.positionType === 'LONG' && latestMarkPrice <= pos.stopLoss) ||
            (pos.positionType === 'SHORT' && latestMarkPrice >= pos.stopLoss);

        if (triggerStopLoss) {
            await prisma.user.update({
                where: { id: pos.id },
                data: { 
                    markPrice: latestMarkPrice,
                    status: false,
                    closeTime: new Date()
                }
            });
            // Optionally notify the user by email/push here!
            console.log(`Position ${pos.id} closed on stop loss at price ${latestMarkPrice}`);
        }
    }
}

// Reuse/get real price as above
async function getLatestMarkPrice(coinName) {
    // Implement real price fetch here
    return Math.random() * 100;
}
