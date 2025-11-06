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

// Store all players
const players = new Map();

// Available avatars
const avatars = ['👤', '👻', '🧟', '🦇', '🐺', '🕷️', '💀', '👹'];

// Get random wall position
function getRandomWallPosition() {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  
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
  
  return { x, y };
}

// Check if player can catch another player
function canCatch(catcher, target) {
  const dx = Math.abs(catcher.x - target.x);
  const dy = Math.abs(catcher.y - target.y);
  
  // Check if target is within flashlight range (2 blocks)
  return (dx <= FLASHLIGHT_RANGE && dy <= FLASHLIGHT_RANGE) && 
         (dx + dy <= FLASHLIGHT_RANGE * 2);
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
      alive: true
    };
    
    players.set(socket.id, player);
    
    // Send current player their info
    socket.emit('init', {
      id: socket.id,
      x: player.x,
      y: player.y,
      avatar: player.avatar,
      roomSize: ROOM_SIZE
    });
    
    // Send all existing players to new player
    const otherPlayers = Array.from(players.values())
      .filter(p => p.id !== socket.id && p.alive)
      .map(p => ({ id: p.id, x: p.x, y: p.y, avatar: p.avatar }));
    socket.emit('players', otherPlayers);
    
    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', {
      id: player.id,
      x: player.x,
      y: player.y,
      avatar: player.avatar
    });
  });
  
  socket.on('move', (direction) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    
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
    
    // Only move if position changed
    if (newX !== player.x || newY !== player.y) {
      player.x = newX;
      player.y = newY;
      
      // Check for catches
      const otherPlayers = Array.from(players.values())
        .filter(p => p.id !== socket.id && p.alive);
      
      for (const otherPlayer of otherPlayers) {
        if (canCatch(player, otherPlayer)) {
          // Player caught someone
          otherPlayer.alive = false;
          socket.emit('caught', otherPlayer.id);
          io.to(otherPlayer.id).emit('died');
          
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
        }
        
        // Check if someone else caught this player
        if (canCatch(otherPlayer, player)) {
          player.alive = false;
          socket.emit('died');
          io.to(otherPlayer.id).emit('caught', player.id);
          
          // Respawn this player
          setTimeout(() => {
            const newPos = getRandomWallPosition();
            player.x = newPos.x;
            player.y = newPos.y;
            player.alive = true;
            socket.emit('respawn', {
              x: player.x,
              y: player.y
            });
            socket.broadcast.emit('playerRespawned', {
              id: player.id,
              x: player.x,
              y: player.y,
              avatar: player.avatar
            });
          }, 2000);
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

