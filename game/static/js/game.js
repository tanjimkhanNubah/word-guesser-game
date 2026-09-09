// SSL and WSS Dynamic connection handler
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const gameSocket = new WebSocket(
    wsProtocol + window.location.host + '/ws/game/' + roomName + '/'
);

gameSocket.onopen = function(e) {
    console.log("WebSocket Connection Established Successfully!");
    gameSocket.send(JSON.stringify({
        'action': 'join',
        'player': playerName
    }));
};

gameSocket.onmessage = function(e) {
    const data = JSON.parse(e.data);
    console.log("Received Event:", data);

    if (data.type === 'state_update') {
        updateUI(data.state);
    } else if (data.type === 'new_question') {
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            qaBox.innerHTML += `<p><b>❓ ${data.by}:</b> ${data.question}</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    } else if (data.type === 'new_answer') {
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            qaBox.innerHTML += `<p style="color: #27ae60;"><b>💬 ${data.by}:</b> ${data.answer}</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    } else if (data.type === 'system_notice') {
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            qaBox.innerHTML += `<p style="color: #e67e22; font-weight: bold;">📢 ${data.msg}</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    }
};

gameSocket.onclose = function(e) {
    console.error("WebSocket Closed Unsuccessfully");
};

function updateUI(state) {
    const turnStatus = document.getElementById('turn-status');
    const wordSelectBox = document.getElementById('word-select-box');
    const askBox = document.getElementById('ask-box');
    const guessBox = document.getElementById('guess-box');
    const scoreboardModal = document.getElementById('scoreboard-modal');
    const gameoverModal = document.getElementById('gameover-modal');

    const chooser = state.players[state.current_chooser_idx] || '';

    if (state.phase === 'WAITING') {
        if (turnStatus) turnStatus.innerText = `Waiting for players... (${state.players.length}/3 Connected)`;
    } else if (state.phase === 'WORD_SELECT') {
        if (turnStatus) turnStatus.innerText = `Waiting for ${chooser} to pick a word...`;
        if (wordSelectBox) wordSelectBox.style.display = (playerName === chooser) ? 'block' : 'none';
        if (askBox) askBox.style.display = 'none';
        if (guessBox) guessBox.style.display = 'none';
        if (scoreboardModal) scoreboardModal.style.display = 'none';
    } else if (state.phase === 'PLAYING') {
        if (turnStatus) turnStatus.innerText = `Game in progress! Chooser: ${chooser}`;
        if (wordSelectBox) wordSelectBox.style.display = 'none';
        if (askBox) askBox.style.display = (playerName !== chooser) ? 'block' : 'none';
        if (guessBox) guessBox.style.display = (playerName !== chooser) ? 'block' : 'none';
        if (scoreboardModal) scoreboardModal.style.display = 'none';
    } else if (state.phase === 'SCOREBOARD') {
        if (scoreboardModal) {
            scoreboardModal.style.display = 'flex';
            renderScoreList('scores-list', state.scores);
        }
    } else if (state.phase === 'GAME_OVER') {
        if (gameoverModal) {
            gameoverModal.style.display = 'flex';
            showFinalScores(state.scores);
        }
    }
}

function submitSecretWord() {
    const input = document.getElementById('secret-word-input');
    if (input && input.value.trim()) {
        gameSocket.send(JSON.stringify({
            'action': 'set_word',
            'player': playerName,
            'word': input.value.trim()
        }));
        input.value = '';
    }
}

function sendQuestion() {
    const input = document.getElementById('question-input');
    if (input && input.value.trim()) {
        gameSocket.send(JSON.stringify({
            'action': 'ask_question',
            'player': playerName,
            'question': input.value.trim()
        }));
        input.value = '';
    }
}

function sendAnswer(ans) {
    if (ans.trim()) {
        gameSocket.send(JSON.stringify({
            'action': 'answer_question',
            'player': playerName,
            'answer': ans.trim()
        }));
    }
}

function sendGuess() {
    const input = document.getElementById('guess-input');
    if (input && input.value.trim()) {
        gameSocket.send(JSON.stringify({
            'action': 'submit_guess',
            'player': playerName,
            'guess': input.value.trim()
        }));
        input.value = '';
    }
}

function renderScoreList(elementId, scores) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = '';
    Object.entries(scores).forEach(([player, score]) => {
        container.innerHTML += `<p><b>${player}:</b> ${score} pts</p>`;
    });
}

function showFinalScores(scores) {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return;

    const highestScore = sorted[0][1];
    const winners = sorted.filter(([player, score]) => score === highestScore).map(([player]) => player);
    const winnerAnnouncement = document.getElementById('winner-announcement');
    
    if (winners.length > 1) {
        winnerAnnouncement.innerText = `🤝 Tie between ${winners.join(', ')} (${highestScore} pts)!`;
    } else {
        winnerAnnouncement.innerText = `🏆 Winner: ${winners[0]} (${highestScore} pts)!`;
    }

    const list = document.getElementById('final-scores-list');
    if (!list) return;
    list.innerHTML = '';
    
    sorted.forEach(([player, score], idx) => {
        let medal = '👤';
        if (score === highestScore) medal = '🥇';
        else if (idx === 1) medal = '🥈';
        else if (idx === 2) medal = '🥉';
        
        list.innerHTML += `
            <div style="padding: 10px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; font-size: 18px;">
                <span>${medal} <b>${player}</b></span>
                <span style="color: #27ae60; font-weight: bold;">${score} pts</span>
            </div>`;
    });
}