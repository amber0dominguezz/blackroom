const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const ROOM_SIZE = 30;
const FLASHLIGHT_RANGE = 2;
const MIN_WALL_SPACING = 4; // Minimum blocks of space between walls

// Store all players
const players = new Map();

// Store walls (Set of "x,y" strings)
const walls = new Set();

// Available avatars
const avatars = ['👤', '👻', '🧟', '🦇', '🐺', '🕷️', '💀', '👹'];

// Generate maze-like walls with at least MIN_WALL_SPACING blocks between them
function generateWalls() {
  walls.clear();
  
  // Grid spacing: walls every (MIN_WALL_SPACING + 1) blocks to ensure MIN_WALL_SPACING open space
  const gridSpacing = MIN_WALL_SPACING + 1;
  
  // Generate horizontal walls (creating corridors that are at least MIN_WALL_SPACING blocks wide)
  for (let y = gridSpacing; y < ROOM_SIZE - 1; y += gridSpacing) {
    // Create horizontal wall segments with gaps for maze-like structure
    let x = 1; // Start from 1 to avoid edge
    while (x < ROOM_SIZE - 1) {
      // Decide whether to place a wall segment here
      if (Math.random() > 0.3) { // 70% chance to place a wall segment
        const segmentLength = 2 + Math.floor(Math.random() * 4); // 2-5 blocks long
        
        for (let i = 0; i < segmentLength && x < ROOM_SIZE - 1; i++, x++) {
          walls.add(`${x},${y}`);
        }
      } else {
        // Skip this position (creates a gap)
        x++;
      }
      
      // Ensure at least MIN_WALL_SPACING blocks of gap before next potential wall
      // This guarantees corridors are at least MIN_WALL_SPACING blocks wide
      x += MIN_WALL_SPACING;
    }
  }
  
  // Generate vertical walls (creating corridors that are at least MIN_WALL_SPACING blocks wide)
  for (let x = gridSpacing; x < ROOM_SIZE - 1; x += gridSpacing) {
    // Create vertical wall segments with gaps
    let y = 1; // Start from 1 to avoid edge
    while (y < ROOM_SIZE - 1) {
      // Decide whether to place a wall segment here
      if (Math.random() > 0.3) { // 70% chance to place a wall segment
        const segmentLength = 2 + Math.floor(Math.random() * 4); // 2-5 blocks long
        
        for (let i = 0; i < segmentLength && y < ROOM_SIZE - 1; i++, y++) {
          walls.add(`${x},${y}`);
        }
      } else {
        // Skip this position (creates a gap)
        y++;
      }
      
      // Ensure at least MIN_WALL_SPACING blocks of gap before next potential wall
      y += MIN_WALL_SPACING;
    }
  }
  
  // Ensure spawn positions are not walls
  // Remove walls from edge positions where players spawn
  for (let i = 0; i < ROOM_SIZE; i++) {
    walls.delete(`0,${i}`); // Left edge
    walls.delete(`${ROOM_SIZE - 1},${i}`); // Right edge
    walls.delete(`${i},0`); // Top edge
    walls.delete(`${i},${ROOM_SIZE - 1}`); // Bottom edge
  }
}

// Check if a position is a wall
function isWall(x, y) {
  return walls.has(`${x},${y}`);
}

// Get random non-wall position on edges (for spawning)
function getRandomWallPosition() {
  let x, y;
  let attempts = 0;
  
  do {
    const side = Math.floor(Math.random() * 4);
    
    switch(side) {
      case 0: // Top wall
        x = Math.floor(Math.random() * ROOM_SIZE);
        y = 0;
        break;
      case 1: // Right wall
        x = ROOM_SIZE - 1;
        y = Math.floor(Math.random() * ROOM_SIZE);
        break;
      case 2: // Bottom wall
        x = Math.floor(Math.random() * ROOM_SIZE);
        y = ROOM_SIZE - 1;
        break;
      case 3: // Left wall
        x = 0;
        y = Math.floor(Math.random() * ROOM_SIZE);
        break;
    }
    attempts++;
  } while (isWall(x, y) && attempts < 100);
  
  return { x, y };
}

// Initialize walls when server starts
generateWalls();

// Check if player can catch another player (catcher must be facing target)
function canCatch(catcher, target) {
  const dx = target.x - catcher.x;
  const dy = target.y - catcher.y;
  
  // Check if catcher is facing the target and target is in flashlight range
  // Flashlight: 2 blocks ahead, 1 block to either side
  switch(catcher.direction) {
    case 'up':
      // Facing up: target must be above (dy < 0), within 2 blocks up, and within 1 block horizontally
      return dy < 0 && Math.abs(dy) <= FLASHLIGHT_RANGE && Math.abs(dx) <= 1;
    case 'down':
      // Facing down: target must be below (dy > 0), within 2 blocks down, and within 1 block horizontally
      return dy > 0 && Math.abs(dy) <= FLASHLIGHT_RANGE && Math.abs(dx) <= 1;
    case 'left':
      // Facing left: target must be to the left (dx < 0), within 2 blocks left, and within 1 block vertically
      return dx < 0 && Math.abs(dx) <= FLASHLIGHT_RANGE && Math.abs(dy) <= 1;
    case 'right':
      // Facing right: target must be to the right (dx > 0), within 2 blocks right, and within 1 block vertically
      return dx > 0 && Math.abs(dx) <= FLASHLIGHT_RANGE && Math.abs(dy) <= 1;
    default:
      return false;
  }
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('join', (avatar) => {
    const position = getRandomWallPosition();
    const player = {
      id: socket.id,
      x: position.x,
      y: position.y,
      avatar: avatar || avatars[Math.floor(Math.random() * avatars.length)],
      alive: true,
      direction: 'down', // Track player's facing direction
      kills: 0 // Track kill count
    };
    
    players.set(socket.id, player);
    
    // Send current player their info
    socket.emit('init', {
      id: socket.id,
      x: player.x,
      y: player.y,
      avatar: player.avatar,
      roomSize: ROOM_SIZE,
      walls: Array.from(walls) // Send walls array to client
    });
    
    // Send all existing players to new player
    const otherPlayers = Array.from(players.values())
      .filter(p => p.id !== socket.id && p.alive)
      .map(p => ({ id: p.id, x: p.x, y: p.y, avatar: p.avatar, kills: p.kills }));
    socket.emit('players', otherPlayers);
    
    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', {
      id: player.id,
      x: player.x,
      y: player.y,
      avatar: player.avatar,
      kills: player.kills
    });
  });
  
  socket.on('move', (direction) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    
    // Update player direction
    player.direction = direction;
    
    let newX = player.x;
    let newY = player.y;
    
    switch(direction) {
      case 'up':
        newY = Math.max(0, player.y - 1);
        break;
      case 'down':
        newY = Math.min(ROOM_SIZE - 1, player.y + 1);
        break;
      case 'left':
        newX = Math.max(0, player.x - 1);
        break;
      case 'right':
        newX = Math.min(ROOM_SIZE - 1, player.x + 1);
        break;
    }
    
    // Check if new position is a wall or out of bounds
    if (isWall(newX, newY)) {
      return; // Can't move into a wall
    }
    
    // Only move if position changed and is valid
    if (newX !== player.x || newY !== player.y) {
      player.x = newX;
      player.y = newY;
      
      // Check for catches - only the moving player can catch others
      const otherPlayers = Array.from(players.values())
        .filter(p => p.id !== socket.id && p.alive);
      
      for (const otherPlayer of otherPlayers) {
        // Only check if the moving player can catch the other player
        // The moving player is the one using their flashlight
        if (canCatch(player, otherPlayer)) {
          // Only the caught player dies
          otherPlayer.alive = false;
          
          // Increment kill count for the catcher
          player.kills++;
          
          // Notify the catcher
          socket.emit('caught', { 
            playerId: otherPlayer.id, 
            kills: player.kills 
          });
          
          // Notify the caught player
          io.to(otherPlayer.id).emit('died');
          
          // Broadcast kill update to all players
          socket.broadcast.emit('playerKilled', {
            killerId: player.id,
            killedId: otherPlayer.id,
            kills: player.kills
          });
          
          // Respawn the caught player
          setTimeout(() => {
            const newPos = getRandomWallPosition();
            otherPlayer.x = newPos.x;
            otherPlayer.y = newPos.y;
            otherPlayer.alive = true;
            io.to(otherPlayer.id).emit('respawn', {
              x: otherPlayer.x,
              y: otherPlayer.y
            });
            socket.broadcast.emit('playerRespawned', {
              id: otherPlayer.id,
              x: otherPlayer.x,
              y: otherPlayer.y,
              avatar: otherPlayer.avatar
            });
          }, 2000);
          
          // Break to avoid processing other catches
          break;
        }
      }
      
      // Broadcast movement
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: player.x,
        y: player.y
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    players.delete(socket.id);
    socket.broadcast.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Players can join using: http://localhost:${PORT}`);
});

