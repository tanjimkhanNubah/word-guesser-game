function showFinalScores(scores) {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length === 0) return;

    // Highest score check
    const highestScore = sorted[0][1];
    
    // Find all players who have the highest score (for Tie condition)
    const winners = sorted.filter(([player, score]) => score === highestScore).map(([player]) => player);

    const winnerAnnouncement = document.getElementById('winner-announcement');
    
    if (winners.length > 1) {
        // TIE Condition
        winnerAnnouncement.innerText = `🤝 Tie between ${winners.join(', ')} (${highestScore} pts)!`;
    } else {
        // Single Winner Condition
        winnerAnnouncement.innerText = `🏆 Winner: ${winners[0]} (${highestScore} pts)!`;
    }

    const list = document.getElementById('final-scores-list');
    if (!list) return;
    list.innerHTML = '';
    
    sorted.forEach(([player, score], idx) => {
        let medal = '👤';
        if (score === highestScore) {
            medal = '🥇';
        } else if (idx === 1) {
            medal = '🥈';
        } else if (idx === 2) {
            medal = '🥉';
        }
        
        list.innerHTML += `
            <div style="padding: 10px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; font-size: 18px;">
                <span>${medal} <b>${player}</b></span>
                <span style="color: #27ae60; font-weight: bold;">${score} pts</span>
            </div>`;
    });
}