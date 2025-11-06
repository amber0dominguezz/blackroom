const socket = io();

let gameState = {
    myId: null,
    myX: 0,
    myY: 0,
    myAvatar: '👤',
    roomSize: 30,
    blockSize: 20,
    players: new Map(),
    walls: new Set(), // Store walls as Set of "x,y" strings
    alive: true,
    direction: 'down', // Track facing direction for flashlight
    kills: 0, // Track kill count
    isRevealing: false, // Track if players are currently revealed
    revealCountdown: 7 // Countdown timer for reveal
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const avatarSelection = document.getElementById('avatarSelection');
const gameScreen = document.getElementById('gameScreen');
const deathScreen = document.getElementById('deathScreen');
const avatarGrid = document.getElementById('avatarGrid');
const startButton = document.getElementById('startGame');
const statusDiv = document.getElementById('status');
const playerCountDiv = document.getElementById('playerCount');
const killsDiv = document.getElementById('kills');
const revealCountdownDiv = document.getElementById('revealCountdown');
const revealTextDiv = document.getElementById('revealText');
const revealTimerDiv = document.getElementById('revealTimer');

const avatars = ['👤', '👻', '🧟', '🦇', '🐺', '🕷️', '💀', '👹'];
const FLASHLIGHT_RANGE = 2;

// Setup avatar selection
avatars.forEach(avatar => {
    const div = document.createElement('div');
    div.className = 'avatar-option';
    div.textContent = avatar;
    div.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        gameState.selectedAvatar = avatar;
        startButton.disabled = false;
    });
    avatarGrid.appendChild(div);
});

// Start game
startButton.addEventListener('click', () => {
    if (!gameState.selectedAvatar) return;
    avatarSelection.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    socket.emit('join', gameState.selectedAvatar);
    setupCanvas();
    startGameLoop();
    startRevealCountdown();
});

// Setup canvas
function setupCanvas() {
    const size = gameState.roomSize * gameState.blockSize;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
}

// Socket events
socket.on('init', (data) => {
    gameState.myId = data.id;
    gameState.myX = data.x;
    gameState.myY = data.y;
    gameState.myAvatar = data.avatar;
    gameState.roomSize = data.roomSize;
    gameState.kills = 0; // Initialize kills
    killsDiv.textContent = `Kills: ${gameState.kills}`;
    // Store walls from server
    if (data.walls) {
        gameState.walls = new Set(data.walls);
    }
});

socket.on('players', (playersList) => {
    playersList.forEach(player => {
        gameState.players.set(player.id, {
            x: player.x,
            y: player.y,
            avatar: player.avatar,
            kills: player.kills || 0
        });
    });
    updatePlayerCount();
});

socket.on('playerJoined', (player) => {
    gameState.players.set(player.id, {
        x: player.x,
        y: player.y,
        avatar: player.avatar,
        kills: player.kills || 0
    });
    updatePlayerCount();
});

socket.on('playerMoved', (data) => {
    if (gameState.players.has(data.id)) {
        gameState.players.get(data.id).x = data.x;
        gameState.players.get(data.id).y = data.y;
    }
});

socket.on('playerLeft', (playerId) => {
    gameState.players.delete(playerId);
    updatePlayerCount();
});

socket.on('playerRespawned', (player) => {
    if (gameState.players.has(player.id)) {
        gameState.players.get(player.id).x = player.x;
        gameState.players.get(player.id).y = player.y;
    }
});

socket.on('caught', (data) => {
    // You caught someone
    gameState.kills = data.kills || 0;
    killsDiv.textContent = `Kills: ${gameState.kills}`;
    
    // Visual feedback - animate the kill counter
    killsDiv.style.transform = 'scale(1.3)';
    killsDiv.style.color = '#ff0000';
    setTimeout(() => {
        killsDiv.style.transform = 'scale(1)';
        killsDiv.style.color = '#ffaa00';
    }, 300);
    
    statusDiv.textContent = `You caught someone! (${gameState.kills} kills)`;
    setTimeout(() => {
        if (gameState.alive) {
            statusDiv.textContent = 'Alive';
        }
    }, 2000);
});

socket.on('died', () => {
    gameState.alive = false;
    statusDiv.textContent = 'You died!';
    gameScreen.classList.add('hidden');
    deathScreen.classList.remove('hidden');
});

socket.on('respawn', (data) => {
    gameState.myX = data.x;
    gameState.myY = data.y;
    gameState.alive = true;
    statusDiv.textContent = 'Alive';
    deathScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

socket.on('playerKilled', (data) => {
    // Update kill count for the killer if we're tracking them
    if (gameState.players.has(data.killerId)) {
        gameState.players.get(data.killerId).kills = data.kills;
    }
});

// Handle reveal events
socket.on('revealStart', (data) => {
    gameState.isRevealing = true;
    // Update player positions from reveal data
    if (data.players) {
        data.players.forEach(player => {
            if (player.id !== gameState.myId && gameState.players.has(player.id)) {
                gameState.players.get(player.id).x = player.x;
                gameState.players.get(player.id).y = player.y;
            }
        });
    }
    revealCountdownDiv.classList.add('revealing');
    revealTextDiv.textContent = 'Players revealed!';
    revealTimerDiv.textContent = '';
});

socket.on('revealEnd', () => {
    gameState.isRevealing = false;
    revealCountdownDiv.classList.remove('revealing');
    revealTextDiv.textContent = 'Revealing players position in';
    // Reset countdown to 7 (next reveal in 7 seconds)
    gameState.revealCountdown = 7;
    revealTimerDiv.textContent = gameState.revealCountdown;
    
    // Restart countdown
    if (revealCountdownInterval) {
        clearInterval(revealCountdownInterval);
    }
    revealCountdownInterval = setInterval(() => {
        if (gameState.isRevealing) {
            return; // Don't countdown during reveal
        }
        
        gameState.revealCountdown--;
        revealTimerDiv.textContent = gameState.revealCountdown;
        
        if (gameState.revealCountdown <= 0) {
            clearInterval(revealCountdownInterval);
            revealCountdownInterval = null;
        }
    }, 1000);
});

// Movement
window.addEventListener('keydown', (e) => {
    if (!gameState.alive) return;
    
    const key = e.key.toLowerCase();
    
    // Prevent default to avoid scrolling
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'm'].includes(key)) {
        e.preventDefault();
    }
    
    // WASD/Arrow keys change facing direction
    if (key === 'arrowup' || key === 'w') {
        gameState.direction = 'up';
    } else if (key === 'arrowdown' || key === 's') {
        gameState.direction = 'down';
    } else if (key === 'arrowleft' || key === 'a') {
        gameState.direction = 'left';
    } else if (key === 'arrowright' || key === 'd') {
        gameState.direction = 'right';
    }
    // M key moves one block forward in the current facing direction
    else if (key === 'm') {
        // Update position optimistically
        let newX = gameState.myX;
        let newY = gameState.myY;
        
        switch(gameState.direction) {
            case 'up':
                newY = Math.max(0, gameState.myY - 1);
                break;
            case 'down':
                newY = Math.min(gameState.roomSize - 1, gameState.myY + 1);
                break;
            case 'left':
                newX = Math.max(0, gameState.myX - 1);
                break;
            case 'right':
                newX = Math.min(gameState.roomSize - 1, gameState.myX + 1);
                break;
        }
        
        // Check if new position is a wall
        const wallKey = `${newX},${newY}`;
        if (gameState.walls.has(wallKey)) {
            return; // Can't move into a wall
        }
        
        // Only move if position changed and is not a wall
        if (newX !== gameState.myX || newY !== gameState.myY) {
            gameState.myX = newX;
            gameState.myY = newY;
            socket.emit('move', gameState.direction);
        }
    }
});

// Get visible blocks based on flashlight
function getVisibleBlocks() {
    const visible = new Set();
    const { myX, myY, direction } = gameState;
    
    // Always see your current position
    visible.add(`${myX},${myY}`);
    
    // Add blocks in flashlight range (2 blocks ahead in a focused beam)
    for (let i = 1; i <= FLASHLIGHT_RANGE; i++) {
        switch(direction) {
            case 'up':
                // Show blocks directly ahead and slightly to sides
                for (let j = -1; j <= 1; j++) {
                    const checkX = myX + j;
                    const checkY = myY - i;
                    if (checkX >= 0 && checkX < gameState.roomSize && checkY >= 0) {
                        visible.add(`${checkX},${checkY}`);
                    }
                }
                break;
            case 'down':
                for (let j = -1; j <= 1; j++) {
                    const checkX = myX + j;
                    const checkY = myY + i;
                    if (checkX >= 0 && checkX < gameState.roomSize && checkY < gameState.roomSize) {
                        visible.add(`${checkX},${checkY}`);
                    }
                }
                break;
            case 'left':
                for (let j = -1; j <= 1; j++) {
                    const checkX = myX - i;
                    const checkY = myY + j;
                    if (checkY >= 0 && checkY < gameState.roomSize && checkX >= 0) {
                        visible.add(`${checkX},${checkY}`);
                    }
                }
                break;
            case 'right':
                for (let j = -1; j <= 1; j++) {
                    const checkX = myX + i;
                    const checkY = myY + j;
                    if (checkY >= 0 && checkY < gameState.roomSize && checkX < gameState.roomSize) {
                        visible.add(`${checkX},${checkY}`);
                    }
                }
                break;
        }
    }
    
    return visible;
}

// Render game
function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const visibleBlocks = getVisibleBlocks();
    const blockSize = gameState.blockSize;
    
    // Draw ALL walls first (always visible)
    gameState.walls.forEach(wallKey => {
        const [x, y] = wallKey.split(',').map(Number);
        ctx.fillStyle = '#444';
        ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
        ctx.strokeStyle = '#666';
        ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
        // Add a subtle pattern to walls
        ctx.fillStyle = '#555';
        ctx.fillRect(x * blockSize + 2, y * blockSize + 2, blockSize - 4, blockSize - 4);
    });
    
    // Draw visible floor blocks (where flashlight reveals OR around revealed players)
    const blocksToDraw = new Set(visibleBlocks);
    
    // If revealing, add floor blocks around all players
    if (gameState.isRevealing) {
        gameState.players.forEach((player, id) => {
            // Add a 2x2 area around each player
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const x = player.x + dx;
                    const y = player.y + dy;
                    if (x >= 0 && x < gameState.roomSize && y >= 0 && y < gameState.roomSize) {
                        blocksToDraw.add(`${x},${y}`);
                    }
                }
            }
        });
    }
    
    blocksToDraw.forEach(blockKey => {
        // Skip if this is a wall (already drawn)
        if (gameState.walls.has(blockKey)) {
            return;
        }
        
        const [x, y] = blockKey.split(',').map(Number);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
        ctx.strokeStyle = '#333';
        ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
    });
    
    // Draw other players (visible if in flashlight range OR if revealing)
    gameState.players.forEach((player, id) => {
        if (id === gameState.myId) return;
        const blockKey = `${player.x},${player.y}`;
        const isVisible = visibleBlocks.has(blockKey) || gameState.isRevealing;
        
        if (isVisible) {
            ctx.font = `${blockSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Make revealed players slightly brighter/glowing
            if (gameState.isRevealing) {
                ctx.shadowColor = '#ffff00';
                ctx.shadowBlur = 10;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.fillText(
                player.avatar,
                player.x * blockSize + blockSize / 2,
                player.y * blockSize + blockSize / 2
            );
            ctx.shadowBlur = 0; // Reset shadow
        }
    });
    
    // Draw self (always visible)
    ctx.font = `${blockSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff0000';
    ctx.fillText(
        gameState.myAvatar,
        gameState.myX * blockSize + blockSize / 2,
        gameState.myY * blockSize + blockSize / 2
    );
    
}

function updatePlayerCount() {
    playerCountDiv.textContent = `Players: ${gameState.players.size + 1}`;
}

// Initialize kills display
killsDiv.textContent = `Kills: ${gameState.kills}`;

// Reveal countdown timer
let revealCountdownInterval = null;

function startRevealCountdown() {
    // Clear any existing interval
    if (revealCountdownInterval) {
        clearInterval(revealCountdownInterval);
    }
    
    // Show countdown
    revealCountdownDiv.classList.remove('hidden');
    revealTextDiv.textContent = 'Revealing players position in';
    
    // Update countdown every second
    revealCountdownInterval = setInterval(() => {
        if (gameState.isRevealing) {
            return; // Don't countdown during reveal
        }
        
        gameState.revealCountdown--;
        revealTimerDiv.textContent = gameState.revealCountdown;
        
        if (gameState.revealCountdown <= 0) {
            clearInterval(revealCountdownInterval);
            revealCountdownInterval = null;
        }
    }, 1000);
    
    // Initial display
    revealTimerDiv.textContent = gameState.revealCountdown;
}

function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
}

function startGameLoop() {
    gameLoop();
}

