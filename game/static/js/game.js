// SSL and WSS Dynamic connection handler
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const gameSocket = new WebSocket(
    wsProtocol + window.location.host + '/ws/game/' + roomName + '/'
);

let gameTimer = null;
let currentQuotedQuestion = "";

gameSocket.onopen = function(e) {
    console.log("WebSocket Connection Established Successfully!");
    const maxPlayersTarget = typeof maxPlayers !== 'undefined' ? maxPlayers : 3;

    gameSocket.send(JSON.stringify({
        'action': 'join',
        'player': playerName,
        'max_players': maxPlayersTarget
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
            const qCountEl = document.getElementById('q-count');
            if (qCountEl) qCountEl.innerText = `(${data.q_count}/${data.max_q})`;

            const p = document.createElement('p');
            p.innerHTML = `<b>❓ ${data.by}:</b> ${data.question}`;
            p.style.cursor = 'pointer';
            p.style.margin = '5px 0';
            p.title = 'Click to reply';

            // Chooser clicking a question triggers WhatsApp-style reply preview
            p.onclick = function() {
                if (window.isChooser) {
                    currentQuotedQuestion = data.question;
                    const replyTextEl = document.getElementById('replying-q-text');
                    const replyPanel = document.getElementById('chooser-reply-panel');
                    if (replyTextEl) replyTextEl.innerText = `"${data.question}"`;
                    if (replyPanel) replyPanel.style.display = 'block';
                }
            };

            qaBox.appendChild(p);
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    } else if (data.type === 'new_answer') {
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            let quoteText = data.quoted_question ? `<br><small style="color: #7f8c8d;">↳ Replying to: "${data.quoted_question}"</small>` : '';
            qaBox.innerHTML += `<p style="color: #27ae60; margin: 5px 0;"><b>💬 ${data.by}:</b> ${data.answer}${quoteText}</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    } else if (data.type === 'correct_guess') {
        // Stop timer immediately on correct guess
        clearInterval(gameTimer);
        gameTimer = null;
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            qaBox.innerHTML += `<p style="color: #27ae60; font-weight: bold; margin: 5px 0;">🎉 ${data.player} guessed the correct word: "${data.word}"!</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    } else if (data.type === 'wrong_guess') {
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            qaBox.innerHTML += `<p style="color: #c0392b; margin: 5px 0;">❌ ${data.player} guessed wrong! (${data.guesses_left} left)</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    } else if (data.type === 'system_notice') {
        const qaBox = document.getElementById('qa-box');
        if (qaBox) {
            qaBox.innerHTML += `<p style="color: #e67e22; font-weight: bold; margin: 5px 0;">📢 ${data.msg}</p>`;
            qaBox.scrollTop = qaBox.scrollHeight;
        }
    }
};

gameSocket.onclose = function(e) {
    console.error("WebSocket Closed Unsuccessfully");
};

function startTimer(seconds) {
    clearInterval(gameTimer);
    let timeLeft = seconds;
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.style.display = 'inline-block';

    gameTimer = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            gameTimer = null;
            if (timerDisplay) timerDisplay.innerText = "⏰ 00:00";
            if (window.isChooser) {
                gameSocket.send(JSON.stringify({
                    'action': 'timer_expired',
                    'player': playerName
                }));
            }
        } else {
            let mins = Math.floor(timeLeft / 60);
            let secs = timeLeft % 60;
            if (timerDisplay) timerDisplay.innerText = `⏰ ${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
            timeLeft--;
        }
    }, 1000);
}

function updateUI(state) {
    const turnStatus = document.getElementById('turn-status');
    const wordSelectBox = document.getElementById('word-select-box');
    const askBox = document.getElementById('ask-box');
    const replyPanel = document.getElementById('chooser-reply-panel');
    const guessBox = document.getElementById('guess-box');
    const scoreboardModal = document.getElementById('scoreboard-modal');
    const gameoverModal = document.getElementById('gameover-modal');
    const timerDisplay = document.getElementById('timer-display');

    const chooser = state.players[state.current_chooser_idx] || '';
    const maxRequired = state.max_players || 3;
    window.isChooser = (playerName === chooser);

    if (state.phase === 'WAITING') {
        if (turnStatus) turnStatus.innerText = `Waiting for players... (${state.players.length}/${maxRequired} Connected)`;
        if (timerDisplay) timerDisplay.style.display = 'none';
        clearInterval(gameTimer);
        gameTimer = null;
    } else if (state.phase === 'WORD_SELECT') {
        if (turnStatus) turnStatus.innerText = `Waiting for ${chooser} to pick a word...`;
        if (wordSelectBox) wordSelectBox.style.display = window.isChooser ? 'block' : 'none';
        if (askBox) askBox.style.display = 'none';
        if (replyPanel) replyPanel.style.display = 'none';
        if (guessBox) guessBox.style.display = 'none';
        if (scoreboardModal) scoreboardModal.style.display = 'none';
        if (timerDisplay) timerDisplay.style.display = 'none';
        clearInterval(gameTimer);
        gameTimer = null;
    } else if (state.phase === 'PLAYING') {
        if (turnStatus) turnStatus.innerText = `Game in progress! Chooser: ${chooser}`;
        if (wordSelectBox) wordSelectBox.style.display = 'none';

        // Display controls based on role
        if (window.isChooser) {
            if (askBox) askBox.style.display = 'none';
            if (guessBox) guessBox.style.display = 'none';
        } else {
            if (askBox) askBox.style.display = 'block';
            if (guessBox) guessBox.style.display = 'block';
            if (replyPanel) replyPanel.style.display = 'none';
        }

        if (scoreboardModal) scoreboardModal.style.display = 'none';

        // Start 5-minute Timer (300 seconds) if not already running
        if (!gameTimer) {
            startTimer(300);
        }
    } else if (state.phase === 'SCOREBOARD') {
        // Stop timer immediately on round completion
        clearInterval(gameTimer);
        gameTimer = null;
        if (timerDisplay) timerDisplay.style.display = 'none';
        if (scoreboardModal) {
            scoreboardModal.style.display = 'flex';
            renderScoreList('scores-list', state.scores);
        }
    } else if (state.phase === 'GAME_OVER') {
        clearInterval(gameTimer);
        gameTimer = null;
        if (timerDisplay) timerDisplay.style.display = 'none';
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
    if (ans && ans.trim()) {
        gameSocket.send(JSON.stringify({
            'action': 'answer_question',
            'player': playerName,
            'answer': ans.trim(),
            'quoted_question': currentQuotedQuestion
        }));
        currentQuotedQuestion = "";
        const replyPanel = document.getElementById('chooser-reply-panel');
        const customInput = document.getElementById('custom-answer-input');
        if (replyPanel) replyPanel.style.display = 'none';
        if (customInput) customInput.value = '';
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
        container.innerHTML += `<p style="margin: 5px 0;"><b>${player}:</b> ${score} pts</p>`;
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

function restartGame() {
    window.location.reload();
}