// server/services/marketComputation.js

export async function checkStopLosses(prisma) {
    const openPositions = await prisma.user.findMany({ where: { status: true } });

    for (const pos of openPositions) {
        const latestMarkPrice = await getLatestMarkPrice(pos.coinName);

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
            //notify the user by email/push here!
            console.log(`Position ${pos.id} closed on stop loss at price ${latestMarkPrice}`);
        }
    }
}

async function getLatestMarkPrice(coinName) {
    return Math.random() * 100;
}
