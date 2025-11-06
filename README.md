# Black Room - Multiplayer Horror Game

A multiplayer horror game where players navigate a dark 30x30 room with only a flashlight that reveals 2 blocks ahead. Players spawn along the walls and must avoid being caught by others while trying to catch them.

## Features

- **30x30 Block Room**: Navigate a dark room block by block
- **Flashlight Mechanics**: See only 2 blocks ahead in the direction you're facing
- **Multiplayer**: Real-time multiplayer using WebSockets
- **Avatar Selection**: Choose from 8 different avatars
- **Catch & Die System**: Catch players within your flashlight range, or be caught yourself
- **Respawn System**: Automatically respawn along walls after death

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

4. Share the link with friends to play together!

## How to Play

1. **Choose an Avatar**: Select your avatar from the grid
2. **Move**: Use arrow keys or WASD to move around
3. **Flashlight**: Your flashlight always points in the direction you're moving and reveals 2 blocks ahead
4. **Catch Players**: If another player is within 2 blocks of your flashlight range, they die
5. **Avoid Being Caught**: Stay out of other players' flashlight ranges
6. **Respawn**: When you die, you'll respawn at a random wall position after 2 seconds

## Controls

- **Arrow Keys** or **WASD**: Move around the room
- Movement direction determines where your flashlight points

## Technical Details

- **Backend**: Node.js with Express and Socket.io
- **Frontend**: HTML5 Canvas with vanilla JavaScript
- **Real-time**: WebSocket communication for multiplayer synchronization

