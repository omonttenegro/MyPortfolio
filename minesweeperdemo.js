const ROWS = 7;
const COLS = 8;
const TOTAL_MINES = 8;

const boardElement = document.getElementById("board");
const statusText = document.getElementById("status-text");
const turnIndicator = document.getElementById("turn-indicator");
const newGameButton = document.getElementById("new-game-button");
const aiStepButton = document.getElementById("ai-step-button");
const autoplayButton = document.getElementById("autoplay-button");
const flagModeButton = document.getElementById("flag-mode-button");

let cells = [];
let autoplayTimer = null;

class Sentence {
    constructor(cellsSet, count) {
        this.cells = new Set(cellsSet);
        this.count = count;
    }

    knownMines() {
        if (this.cells.size > 0 && this.cells.size === this.count) {
            return [...this.cells];
        }
        return [];
    }

    knownSafes() {
        if (this.count === 0 && this.cells.size > 0) {
            return [...this.cells];
        }
        return [];
    }

    markMine(cellKey) {
        if (this.cells.has(cellKey)) {
            this.cells.delete(cellKey);
            this.count -= 1;
        }
    }

    markSafe(cellKey) {
        if (this.cells.has(cellKey)) {
            this.cells.delete(cellKey);
        }
    }

    signature() {
        const cellsKey = [...this.cells].sort().join("|");
        return `${cellsKey}:${this.count}`;
    }
}

function cellKey(row, col) {
    return `${row},${col}`;
}

function parseCellKey(key) {
    return key.split(",").map(Number);
}

function neighborsOf(key) {
    const [row, col] = parseCellKey(key);
    const neighbors = [];

    for (let r = row - 1; r <= row + 1; r += 1) {
        for (let c = col - 1; c <= col + 1; c += 1) {
            if (r === row && c === col) {
                continue;
            }

            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                neighbors.push(cellKey(r, c));
            }
        }
    }

    return neighbors;
}

function createInitialState() {
    return {
        minesInitialized: false,
        mines: new Set(),
        revealed: new Set(),
        flagged: new Set(),
        movesMade: new Set(),
        knownMines: new Set(),
        knownSafes: new Set(),
        knowledge: [],
        gameOver: false,
        won: false,
        flagMode: false,
        autoplay: false,
        feedbackTitle: "Reveal a cell to start, or let AI make the first move.",
        feedbackDetail: "The first revealed cell is always safe. On touch devices, flag mode helps you place markers."
    };
}

let state = createInitialState();

function buildBoard() {
    const fragment = document.createDocumentFragment();

    for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "ms-cell";
            button.dataset.row = String(row);
            button.dataset.col = String(col);
            button.setAttribute("aria-label", `Row ${row + 1} Column ${col + 1}`);
            fragment.appendChild(button);
            cells.push(button);
        }
    }

    boardElement.appendChild(fragment);
}

function setFeedback(title, detail) {
    state.feedbackTitle = title;
    state.feedbackDetail = detail;
}

function placeMines(firstKey) {
    const blockedCells = new Set([firstKey, ...neighborsOf(firstKey)]);

    while (state.mines.size < TOTAL_MINES) {
        const row = Math.floor(Math.random() * ROWS);
        const col = Math.floor(Math.random() * COLS);
        const key = cellKey(row, col);

        if (!blockedCells.has(key)) {
            state.mines.add(key);
        }
    }

    state.minesInitialized = true;
}

function countAdjacentMines(key) {
    return neighborsOf(key).filter((neighbor) => state.mines.has(neighbor)).length;
}

function stopAutoplay() {
    if (autoplayTimer !== null) {
        window.clearTimeout(autoplayTimer);
        autoplayTimer = null;
    }
    state.autoplay = false;
}

function markKnownSafe(key) {
    if (state.knownSafes.has(key)) {
        return false;
    }

    state.knownSafes.add(key);
    state.knowledge.forEach((sentence) => sentence.markSafe(key));
    return true;
}

function markKnownMine(key) {
    if (state.knownMines.has(key)) {
        return false;
    }

    state.knownMines.add(key);
    state.knowledge.forEach((sentence) => sentence.markMine(key));
    return true;
}

function cleanupKnowledge() {
    const seen = new Set();

    state.knowledge = state.knowledge.filter((sentence) => {
        if (sentence.cells.size === 0) {
            return false;
        }

        if (sentence.count < 0 || sentence.count > sentence.cells.size) {
            return false;
        }

        const signature = sentence.signature();
        if (seen.has(signature)) {
            return false;
        }

        seen.add(signature);
        return true;
    });
}

function inferKnowledge() {
    let changed = true;

    while (changed) {
        changed = false;
        cleanupKnowledge();

        const safeCells = new Set();
        const mineCells = new Set();

        for (const sentence of state.knowledge) {
            sentence.knownSafes().forEach((cell) => safeCells.add(cell));
            sentence.knownMines().forEach((cell) => mineCells.add(cell));
        }

        safeCells.forEach((cell) => {
            if (markKnownSafe(cell)) {
                changed = true;
            }
        });

        mineCells.forEach((cell) => {
            if (markKnownMine(cell)) {
                changed = true;
            }
        });

        const derivedSentences = [];

        for (let i = 0; i < state.knowledge.length; i += 1) {
            for (let j = 0; j < state.knowledge.length; j += 1) {
                if (i === j) {
                    continue;
                }

                const first = state.knowledge[i];
                const second = state.knowledge[j];

                if (first.cells.size === 0 || second.cells.size === 0 || first.cells.size >= second.cells.size) {
                    continue;
                }

                const isSubset = [...first.cells].every((cell) => second.cells.has(cell));

                if (!isSubset) {
                    continue;
                }

                const difference = [...second.cells].filter((cell) => !first.cells.has(cell));
                const countDifference = second.count - first.count;

                if (difference.length === 0) {
                    continue;
                }

                derivedSentences.push(new Sentence(difference, countDifference));
            }
        }

        if (derivedSentences.length > 0) {
            state.knowledge.push(...derivedSentences);
            changed = true;
        }
    }

    cleanupKnowledge();
}

function addKnowledgeFromCell(key) {
    markKnownSafe(key);

    const nearbyMineCount = countAdjacentMines(key);
    const candidateCells = new Set();
    let adjustedCount = nearbyMineCount;

    for (const neighbor of neighborsOf(key)) {
        if (state.knownMines.has(neighbor)) {
            adjustedCount -= 1;
        } else if (!state.revealed.has(neighbor) && !state.knownSafes.has(neighbor)) {
            candidateCells.add(neighbor);
        }
    }

    if (candidateCells.size > 0) {
        state.knowledge.push(new Sentence(candidateCells, adjustedCount));
    }

    inferKnowledge();
}

function checkWin() {
    if (state.revealed.size === ROWS * COLS - TOTAL_MINES) {
        state.gameOver = true;
        state.won = true;
        stopAutoplay();
        setFeedback("Board cleared. Clean sweep.", "Every safe cell is open and the minefield has been solved.");
    }
}

function revealCell(key, origin = "player") {
    if (state.gameOver || state.flagged.has(key) || state.revealed.has(key)) {
        return false;
    }

    if (!state.minesInitialized) {
        placeMines(key);
    }

    if (state.mines.has(key)) {
        state.revealed.add(key);
        state.gameOver = true;
        state.won = false;
        stopAutoplay();
        setFeedback(
            "Boom. Mission failed.",
            origin === "ai"
                ? "The AI ran out of certain moves, guessed, and hit a mine."
                : "That cell was a mine. Time to restart the board."
        );
        render();
        return true;
    }

    const queue = [key];
    const visited = new Set();

    while (queue.length > 0) {
        const current = queue.shift();

        if (visited.has(current) || state.revealed.has(current) || state.flagged.has(current)) {
            continue;
        }

        visited.add(current);
        state.revealed.add(current);
        state.movesMade.add(current);
        addKnowledgeFromCell(current);

        if (countAdjacentMines(current) === 0) {
            neighborsOf(current).forEach((neighbor) => {
                if (!visited.has(neighbor) && !state.flagged.has(neighbor) && !state.revealed.has(neighbor)) {
                    queue.push(neighbor);
                }
            });
        }
    }

    checkWin();
    render();
    return true;
}

function toggleFlag(key) {
    if (state.gameOver || state.revealed.has(key)) {
        return;
    }

    if (state.flagged.has(key)) {
        state.flagged.delete(key);
        setFeedback("Flag removed.", "The selected cell is no longer marked.");
    } else if (!state.flagged.has(key)) {
        state.flagged.add(key);
        setFeedback("Flag placed.", "Marked as a suspected mine.");
    }

    render();
}

function getSafeMove() {
    return [...state.knownSafes].find((cell) => !state.revealed.has(cell) && !state.flagged.has(cell)) ?? null;
}

function getRandomMove() {
    const moves = [];

    for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
            const key = cellKey(row, col);

            if (!state.revealed.has(key) && !state.flagged.has(key) && !state.knownMines.has(key)) {
                moves.push(key);
            }
        }
    }

    if (moves.length === 0) {
        return null;
    }

    return moves[Math.floor(Math.random() * moves.length)];
}

function runAiStep() {
    if (state.gameOver) {
        return;
    }

    let move = getSafeMove();
    let detail = "The AI is following a move inferred from its current knowledge base.";

    if (move === null) {
        move = state.minesInitialized ? getRandomMove() : cellKey(Math.floor(ROWS / 2), Math.floor(COLS / 2));
        detail = state.minesInitialized
            ? "No guaranteed safe move was available, so the AI selected a random unexplored cell."
            : "The AI opened the board with a safe first move.";
    }

    if (move === null) {
        stopAutoplay();
        setFeedback("No legal moves left.", "All remaining hidden cells are already marked as mines.");
        render();
        return;
    }

    setFeedback("AI move executed.", detail);
    revealCell(move, "ai");
}

function scheduleAutoplay() {
    if (!state.autoplay || state.gameOver) {
        return;
    }

    autoplayTimer = window.setTimeout(() => {
        runAiStep();
        if (state.autoplay && !state.gameOver) {
            scheduleAutoplay();
        }
    }, 380);
}

function toggleAutoplay() {
    state.autoplay = !state.autoplay;

    if (!state.autoplay) {
        stopAutoplay();
        render();
        return;
    }

    scheduleAutoplay();
    render();
}

function resetGame() {
    stopAutoplay();
    state = createInitialState();
    render();
}

function render() {
    statusText.textContent = state.feedbackTitle;
    if (turnIndicator) {
        turnIndicator.textContent = state.feedbackDetail;
    }

    aiStepButton.disabled = state.gameOver;
    autoplayButton.disabled = state.gameOver;

    autoplayButton.textContent = state.autoplay ? "Autoplay on" : "Autoplay off";
    autoplayButton.classList.toggle("active", state.autoplay);
    flagModeButton.textContent = state.flagMode ? "Flag mode on" : "Flag mode off";
    flagModeButton.classList.toggle("active", state.flagMode);

    cells.forEach((button) => {
        const key = cellKey(Number(button.dataset.row), Number(button.dataset.col));
        const adjacentCount = countAdjacentMines(key);
        const isRevealed = state.revealed.has(key);
        const isMine = state.mines.has(key) && (state.gameOver || isRevealed);
        const isFlagged = state.flagged.has(key) && !isRevealed;
        const isSafeHint = state.knownSafes.has(key) && !isRevealed;

        button.className = "ms-cell";

        if (isRevealed) {
            button.classList.add("revealed");
        }

        if (isFlagged) {
            button.classList.add("flagged");
        }

        if (isMine) {
            button.classList.add("mine");
        }

        if (isSafeHint) {
            button.classList.add("safe-hint");
        }

        if (isRevealed && adjacentCount > 0 && !isMine) {
            button.classList.add(`count-${adjacentCount}`);
        }

        if (isMine) {
            button.textContent = "✹";
        } else if (isFlagged) {
            button.textContent = "⚑";
        } else if (isRevealed && adjacentCount > 0) {
            button.textContent = String(adjacentCount);
        } else {
            button.textContent = "";
        }
    });
}

buildBoard();

boardElement.addEventListener("click", (event) => {
    const target = event.target.closest(".ms-cell");

    if (!target) {
        return;
    }

    const key = cellKey(Number(target.dataset.row), Number(target.dataset.col));

    if (state.flagMode) {
        toggleFlag(key);
        return;
    }

    if (!state.gameOver) {
        setFeedback("Cell revealed.", "The knowledge base is updated after every safe move.");
    }

    revealCell(key, "player");
});

boardElement.addEventListener("contextmenu", (event) => {
    const target = event.target.closest(".ms-cell");

    if (!target) {
        return;
    }

    event.preventDefault();
    const key = cellKey(Number(target.dataset.row), Number(target.dataset.col));
    toggleFlag(key);
});

newGameButton.addEventListener("click", resetGame);
aiStepButton.addEventListener("click", runAiStep);
autoplayButton.addEventListener("click", toggleAutoplay);
flagModeButton.addEventListener("click", () => {
    state.flagMode = !state.flagMode;
    setFeedback(
        state.flagMode ? "Flag mode enabled." : "Flag mode disabled.",
        state.flagMode
            ? "Tap cells to place or remove flags instead of revealing them."
            : "Clicks will reveal cells again."
    );
    render();
});

render();
