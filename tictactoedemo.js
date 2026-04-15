const X = "X";
const O = "O";
const EMPTY = null;

const statusText = document.getElementById("status-text");
const turnIndicator = document.getElementById("turn-indicator");
const restartButton = document.getElementById("restart-button");
const playerButtons = Array.from(document.querySelectorAll(".player-button"));
const cells = Array.from(document.querySelectorAll(".cell"));

let user = null;
let board = initialState();
let aiTimeoutId = null;

function initialState() {
    return [
        [EMPTY, EMPTY, EMPTY],
        [EMPTY, EMPTY, EMPTY],
        [EMPTY, EMPTY, EMPTY]
    ];
}

function player(currentBoard) {
    let xCount = 0;
    let oCount = 0;

    for (const row of currentBoard) {
        for (const cell of row) {
            if (cell === X) {
                xCount += 1;
            } else if (cell === O) {
                oCount += 1;
            }
        }
    }

    return xCount === oCount ? X : O;
}

function actions(currentBoard) {
    const moves = [];

    for (let i = 0; i < currentBoard.length; i += 1) {
        for (let j = 0; j < currentBoard[i].length; j += 1) {
            if (currentBoard[i][j] === EMPTY) {
                moves.push([i, j]);
            }
        }
    }

    return moves;
}

function result(currentBoard, action) {
    const [i, j] = action;

    if (currentBoard[i][j] !== EMPTY) {
        throw new Error("invalid action");
    }

    const nextBoard = currentBoard.map((row) => [...row]);
    nextBoard[i][j] = player(currentBoard);
    return nextBoard;
}

function winner(currentBoard) {
    const lines = [];

    for (let i = 0; i < 3; i += 1) {
        lines.push(currentBoard[i]);
        lines.push([currentBoard[0][i], currentBoard[1][i], currentBoard[2][i]]);
    }

    lines.push([currentBoard[0][0], currentBoard[1][1], currentBoard[2][2]]);
    lines.push([currentBoard[0][2], currentBoard[1][1], currentBoard[2][0]]);

    for (const line of lines) {
        if (line[0] !== EMPTY && line.every((value) => value === line[0])) {
            return line[0];
        }
    }

    return null;
}

function terminal(currentBoard) {
    if (winner(currentBoard) !== null) {
        return true;
    }

    return actions(currentBoard).length === 0;
}

function utility(currentBoard) {
    const gameWinner = winner(currentBoard);

    if (gameWinner === X) {
        return 1;
    }

    if (gameWinner === O) {
        return -1;
    }

    return 0;
}

function minimax(currentBoard) {
    if (terminal(currentBoard)) {
        return null;
    }

    if (player(currentBoard) === X) {
        let bestScore = -Infinity;
        let bestMove = null;

        for (const action of actions(currentBoard)) {
            const score = minValue(result(currentBoard, action));
            if (score > bestScore) {
                bestScore = score;
                bestMove = action;
            }
        }

        return bestMove;
    }

    let bestScore = Infinity;
    let bestMove = null;

    for (const action of actions(currentBoard)) {
        const score = maxValue(result(currentBoard, action));
        if (score < bestScore) {
            bestScore = score;
            bestMove = action;
        }
    }

    return bestMove;
}

function maxValue(currentBoard) {
    if (terminal(currentBoard)) {
        return utility(currentBoard);
    }

    let value = -Infinity;

    for (const action of actions(currentBoard)) {
        value = Math.max(value, minValue(result(currentBoard, action)));
    }

    return value;
}

function minValue(currentBoard) {
    if (terminal(currentBoard)) {
        return utility(currentBoard);
    }

    let value = Infinity;

    for (const action of actions(currentBoard)) {
        value = Math.min(value, maxValue(result(currentBoard, action)));
    }

    return value;
}

function resetGame() {
    if (aiTimeoutId !== null) {
        window.clearTimeout(aiTimeoutId);
        aiTimeoutId = null;
    }

    user = null;
    board = initialState();
    statusText.textContent = "Choose whether you want to play as X or O.";
    if (turnIndicator) {
        turnIndicator.textContent = "";
    }

    for (const button of playerButtons) {
        button.classList.remove("active");
    }

    renderBoard();
}

function startGame(selectedPlayer) {
    if (aiTimeoutId !== null) {
        window.clearTimeout(aiTimeoutId);
        aiTimeoutId = null;
    }

    user = selectedPlayer;
    board = initialState();

    playerButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.player === selectedPlayer);
    });

    renderBoard();
    triggerAiMove();
}

function renderBoard() {
    const currentPlayer = player(board);
    const gameWinner = winner(board);
    const gameOver = terminal(board);

    cells.forEach((cellButton) => {
        const row = Number(cellButton.dataset.row);
        const col = Number(cellButton.dataset.col);
        const value = board[row][col];

        cellButton.textContent = value ?? "";
        cellButton.classList.toggle("x-mark", value === X);
        cellButton.classList.toggle("o-mark", value === O);

        const shouldDisable = user === null || value !== EMPTY || gameOver || currentPlayer !== user;
        cellButton.disabled = shouldDisable;
    });

    if (user === null) {
        return;
    }

    if (gameOver) {
        if (gameWinner === null) {
            statusText.textContent = "Nobody wins when both players are perfect.";
        } else if (gameWinner === user) {
            statusText.textContent = "You found a winning line.";
        } else {
            statusText.textContent = "The AI finished the game optimally.";
        }
        return;
    }

    if (currentPlayer === user) {
        statusText.textContent = "Choose any open tile.";
    } else {
        statusText.textContent = "Minimax is evaluating the best move.";
    }
}

function triggerAiMove() {
    if (user === null || terminal(board) || player(board) === user) {
        return;
    }

    if (aiTimeoutId !== null) {
        window.clearTimeout(aiTimeoutId);
    }

    aiTimeoutId = window.setTimeout(() => {
        const move = minimax(board);

        if (move !== null) {
            board = result(board, move);
        }

        aiTimeoutId = null;
        renderBoard();
    }, 320);
}

playerButtons.forEach((button) => {
    button.addEventListener("click", () => {
        startGame(button.dataset.player);
    });
});

cells.forEach((cellButton) => {
    cellButton.addEventListener("click", () => {
        if (user === null || terminal(board) || player(board) !== user) {
            return;
        }

        const row = Number(cellButton.dataset.row);
        const col = Number(cellButton.dataset.col);

        if (board[row][col] !== EMPTY) {
            return;
        }

        board = result(board, [row, col]);
        renderBoard();
        triggerAiMove();
    });
});

restartButton.addEventListener("click", resetGame);

renderBoard();
