class Game {
    constructor() {
        this.room = new WebsimSocket();
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.players = {}; // Player characters
        this.projectiles = {}; // Active projectiles
        this.lastUpdateTime = 0;
        this.keys = {}; // For tracking key presses
        this.mouse = { x: 0, y: 0 }; // For tracking mouse position
        
        // Game constants
        this.PLAYER_SPEED = 200; // pixels per second
        this.DASH_SPEED = 600; // pixels per second
        this.DASH_DURATION = 200; // ms
        this.DASH_COOLDOWN = 1000; // ms
        this.PROJECTILE_SPEED = 400; // pixels per second
        this.PROJECTILE_LIFETIME = 2000; // ms
        this.PROJECTILE_RADIUS = 5;
        this.PLAYER_RADIUS = 20;
        this.MAX_HEALTH = 100;

        // Set up event listeners
        this.setupListeners();
        
        // Start the game loop
        this.startGameLoop();
    }

    async initialize() {
        // Initialize the websim connection
        await this.room.initialize();
        
        // Set up subscriptions for room state and presence
        this.room.subscribePresence(this.handlePresenceUpdate.bind(this));
        this.room.subscribeRoomState(this.handleRoomStateUpdate.bind(this));
        this.room.subscribePresenceUpdateRequests(this.handlePresenceUpdateRequest.bind(this));
        
        // Set up onmessage handler
        this.room.onmessage = this.handleMessage.bind(this);
        
        // Initialize our player
        this.initializePlayer();
        
        // Resize canvas
        this.resizeCanvas();
        window.addEventListener('resize', this.resizeCanvas.bind(this));
        
        // Show player list
        this.updatePlayersList();
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }

    initializePlayer() {
        // Initialize player with starting values
        this.room.updatePresence({
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            vx: 0,
            vy: 0,
            health: this.MAX_HEALTH,
            score: 0,
            dashing: false,
            dashCooldown: false,
            lastDashTime: 0
        });
    }

    handlePresenceUpdate(presence) {
        // Update the players list in the UI
        this.updatePlayersList();
    }

    handleRoomStateUpdate(roomState) {
        // Handle the projectiles and other room state changes
        if (roomState.projectiles) {
            // Store local copy of projectiles for rendering
            this.projectiles = roomState.projectiles;
        }
    }

    handlePresenceUpdateRequest(request, fromClientId) {
        const myPresence = this.room.presence[this.room.clientId] || {};
        
        if (request.type === 'damage') {
            // Calculate new health
            const newHealth = Math.max(0, myPresence.health - request.amount);
            const newScore = myPresence.score || 0;
            
            // Update our presence
            this.room.updatePresence({
                health: newHealth
            });
            
            // Create hit effect
            this.createHitEffect(myPresence.x, myPresence.y);
            
            // Send hit event for sound
            this.room.send({
                type: 'hit',
                x: myPresence.x,
                y: myPresence.y
            });
            
            // If we died, update the killer's score
            if (newHealth <= 0) {
                this.room.requestPresenceUpdate(fromClientId, {
                    type: 'addScore',
                    amount: 1
                });
                
                // Reset our position and health after a short delay
                setTimeout(() => {
                    this.room.updatePresence({
                        x: Math.random() * this.canvas.width,
                        y: Math.random() * this.canvas.height,
                        health: this.MAX_HEALTH
                    });
                }, 1000);
            }
        } else if (request.type === 'addScore') {
            // Update our score
            this.room.updatePresence({
                score: (myPresence.score || 0) + request.amount
            });
        }
    }

    handleMessage(event) {
        const data = event.data;
        
        switch (data.type) {
            case 'connected':
                console.log(`Client connected: ${data.clientId}, ${data.username}`);
                break;
                
            case 'disconnected':
                console.log(`Client disconnected: ${data.clientId}, ${data.username}`);
                break;
                
            case 'shoot':
                // Create projectile effect
                this.createProjectileEffect(data.x, data.y, data.vx, data.vy);
                break;
                
            case 'dash':
                // Create dash effect
                this.createDashEffect(data.x, data.y);
                break;
                
            case 'hit':
                // Create hit effect
                this.createHitEffect(data.x, data.y);
                break;
        }
    }

    updatePlayersList() {
        const playersContainer = document.getElementById('players-container');
        playersContainer.innerHTML = '';
        
        const scoreboardContainer = document.getElementById('scoreboard');
        scoreboardContainer.innerHTML = 'Scoreboard:';
        
        // Sort players by score
        const sortedPlayers = Object.entries(this.room.peers)
            .map(([clientId, peer]) => {
                const presence = this.room.presence[clientId] || {};
                return {
                    clientId,
                    username: peer.username,
                    avatarUrl: peer.avatarUrl,
                    score: presence.score || 0
                };
            })
            .sort((a, b) => b.score - a.score);
        
        // Add players to the sidebar list
        sortedPlayers.forEach(player => {
            const listItem = document.createElement('li');
            listItem.className = 'player-item';
            
            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            avatar.style.backgroundImage = `url(${player.avatarUrl})`;
            
            const name = document.createElement('span');
            name.className = 'player-name';
            name.textContent = player.username;
            
            const score = document.createElement('span');
            score.className = 'player-score';
            score.textContent = player.score;
            
            listItem.appendChild(avatar);
            listItem.appendChild(name);
            listItem.appendChild(score);
            
            playersContainer.appendChild(listItem);
            
            // Add top players to scoreboard
            if (sortedPlayers.indexOf(player) < 3) {
                const scoreEntry = document.createElement('div');
                scoreEntry.textContent = `${player.username}: ${player.score}`;
                scoreboardContainer.appendChild(scoreEntry);
            }
        });
        
        // Update health bar
        const myPresence = this.room.presence[this.room.clientId] || {};
        const healthBar = document.getElementById('health-bar');
        if (healthBar && myPresence.health !== undefined) {
            const healthPercent = Math.max(0, myPresence.health / this.MAX_HEALTH * 100);
            healthBar.style.width = `${healthPercent}%`;
        }
    }

    setupListeners() {
        // Keyboard input
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            
            // Space bar for dash
            if (e.key === ' ') {
                this.dash();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        // Mouse input
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('click', (e) => {
            this.shoot();
        });
    }

    dash() {
        const myPresence = this.room.presence[this.room.clientId];
        if (!myPresence) return;
        
        const now = Date.now();
        
        // Check if dash is on cooldown
        if (myPresence.dashCooldown || now - myPresence.lastDashTime < this.DASH_COOLDOWN) {
            return;
        }
        
        // Calculate dash direction (towards mouse)
        const dx = this.mouse.x - myPresence.x;
        const dy = this.mouse.y - myPresence.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return;
        
        const normalizedDx = dx / length;
        const normalizedDy = dy / length;
        
        // Update presence with dash state
        this.room.updatePresence({
            dashing: true,
            dashCooldown: true,
            lastDashTime: now,
            vx: normalizedDx * this.DASH_SPEED,
            vy: normalizedDy * this.DASH_SPEED
        });
        
        // Send dash effect event
        this.room.send({
            type: 'dash',
            x: myPresence.x,
            y: myPresence.y
        });
        
        // Create dash effect
        this.createDashEffect(myPresence.x, myPresence.y);
        
        // End dash after duration
        setTimeout(() => {
            this.room.updatePresence({
                dashing: false,
                vx: 0,
                vy: 0
            });
            
            // Reset cooldown after cooldown period
            setTimeout(() => {
                this.room.updatePresence({
                    dashCooldown: false
                });
            }, this.DASH_COOLDOWN - this.DASH_DURATION);
        }, this.DASH_DURATION);
    }

    shoot() {
        const myPresence = this.room.presence[this.room.clientId];
        if (!myPresence) return;
        
        // Calculate direction (towards mouse)
        const dx = this.mouse.x - myPresence.x;
        const dy = this.mouse.y - myPresence.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return;
        
        const normalizedDx = dx / length;
        const normalizedDy = dy / length;
        
        // Create a unique ID for the projectile
        const projectileId = `${this.room.clientId}-${Date.now()}`;
        
        // Calculate exact spawn position at edge of player
        const spawnX = myPresence.x + normalizedDx * this.PLAYER_RADIUS;
        const spawnY = myPresence.y + normalizedDy * this.PLAYER_RADIUS;
        
        // Add projectile to room state
        const newProjectiles = {
            ...(this.room.roomState.projectiles || {}),
            [projectileId]: {
                x: spawnX,
                y: spawnY,
                vx: normalizedDx * this.PROJECTILE_SPEED,
                vy: normalizedDy * this.PROJECTILE_SPEED,
                ownerId: this.room.clientId,
                createdAt: Date.now()
            }
        };
        
        this.room.updateRoomState({
            projectiles: newProjectiles
        });
        
        // Send shoot event for sound
        this.room.send({
            type: 'shoot',
            x: spawnX,
            y: spawnY,
            vx: normalizedDx,
            vy: normalizedDy
        });
        
        // Auto-remove projectile after lifetime
        setTimeout(() => {
            if (this.room.roomState.projectiles && this.room.roomState.projectiles[projectileId]) {
                const updatedProjectiles = { ...this.room.roomState.projectiles };
                delete updatedProjectiles[projectileId];
                
                this.room.updateRoomState({
                    projectiles: updatedProjectiles
                });
            }
        }, this.PROJECTILE_LIFETIME);
    }

    createDashEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'dash-effect';
        effect.style.left = `${x - 20}px`;
        effect.style.top = `${y - 20}px`;
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 300);
    }

    createHitEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'hit-effect';
        effect.style.left = `${x - 10}px`;
        effect.style.top = `${y - 10}px`;
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 300);
    }

    createProjectileEffect(x, y, vx, vy) {
        // Visual effect only, actual projectile is in room state
        const effect = document.createElement('div');
        effect.className = 'projectile';
        effect.style.left = `${x - 5}px`;
        effect.style.top = `${y - 5}px`;
        document.querySelector('.game-area').appendChild(effect);
        
        // Animate along trajectory for a short distance
        const distance = 20;
        const endX = x + vx * distance;
        const endY = y + vy * distance;
        
        effect.animate([
            { left: `${x - 5}px`, top: `${y - 5}px` },
            { left: `${endX - 5}px`, top: `${endY - 5}px` }
        ], {
            duration: 100,
            easing: 'linear'
        });
        
        // Remove the element after animation
        setTimeout(() => {
            effect.remove();
        }, 100);
    }

    handlePlayerInput(deltaTime) {
        const myPresence = this.room.presence[this.room.clientId];
        if (!myPresence || myPresence.dashing) return;
        
        let vx = 0;
        let vy = 0;
        
        // WASD or Arrow keys
        if (this.keys['w'] || this.keys['ArrowUp']) vy -= this.PLAYER_SPEED;
        if (this.keys['s'] || this.keys['ArrowDown']) vy += this.PLAYER_SPEED;
        if (this.keys['a'] || this.keys['ArrowLeft']) vx -= this.PLAYER_SPEED;
        if (this.keys['d'] || this.keys['ArrowRight']) vx += this.PLAYER_SPEED;
        
        // Normalize diagonal movement
        if (vx !== 0 && vy !== 0) {
            const length = Math.sqrt(vx * vx + vy * vy);
            vx = vx / length * this.PLAYER_SPEED;
            vy = vy / length * this.PLAYER_SPEED;
        }
        
        // Only update if there's a change
        if (vx !== myPresence.vx || vy !== myPresence.vy) {
            this.room.updatePresence({
                vx: vx,
                vy: vy
            });
        }
    }

    updateGameState(deltaTime) {
        // Update player positions based on velocity
        Object.entries(this.room.presence).forEach(([clientId, presence]) => {
            if (presence.x === undefined || presence.y === undefined) return;
            
            let newX = presence.x + (presence.vx || 0) * deltaTime;
            let newY = presence.y + (presence.vy || 0) * deltaTime;
            
            // Keep players within bounds
            newX = Math.max(20, Math.min(this.canvas.width - 20, newX));
            newY = Math.max(20, Math.min(this.canvas.height - 20, newY));
            
            // Only update our own position
            if (clientId === this.room.clientId) {
                if (newX !== presence.x || newY !== presence.y) {
                    this.room.updatePresence({
                        x: newX,
                        y: newY
                    });
                }
            }
        });
        
        // Update projectiles - only if we're the authority (first connected client)
        const firstClientId = Object.keys(this.room.peers)[0];
        if (this.room.clientId === firstClientId && this.room.roomState.projectiles) {
            const updatedProjectiles = { ...this.room.roomState.projectiles };
            let projectilesChanged = false;
            
            Object.entries(updatedProjectiles).forEach(([id, projectile]) => {
                // Update projectile position
                const newX = projectile.x + projectile.vx * deltaTime;
                const newY = projectile.y + projectile.vy * deltaTime;
                
                // Check if projectile is out of bounds
                if (newX < 0 || newX > this.canvas.width ||
                    newY < 0 || newY > this.canvas.height) {
                    delete updatedProjectiles[id];
                    projectilesChanged = true;
                    return;
                }
                
                // Update position
                projectile.x = newX;
                projectile.y = newY;
                projectilesChanged = true;
                
                // Check for collision with players
                Object.entries(this.room.presence).forEach(([clientId, presence]) => {
                    // Skip if it's the owner's projectile or if player doesn't have position
                    if (clientId === projectile.ownerId || 
                        presence.x === undefined || 
                        presence.y === undefined ||
                        presence.health <= 0) {
                        return;
                    }
                    
                    // Simple collision detection
                    const dx = presence.x - projectile.x;
                    const dy = presence.y - projectile.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < this.PLAYER_RADIUS + this.PROJECTILE_RADIUS) {
                        // Request damage to the hit player
                        this.room.requestPresenceUpdate(clientId, {
                            type: 'damage',
                            amount: 10
                        });
                        
                        // Remove the projectile
                        delete updatedProjectiles[id];
                        projectilesChanged = true;
                    }
                });
            });
            
            // Only update room state if projectiles changed
            if (projectilesChanged) {
                this.room.updateRoomState({
                    projectiles: updatedProjectiles
                });
            }
        }
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        // Draw projectiles from our synchronized local copy
        if (this.projectiles) {
            Object.values(this.projectiles).forEach(projectile => {
                this.ctx.fillStyle = '#ffff00';
                this.ctx.beginPath();
                this.ctx.arc(projectile.x, projectile.y, this.PROJECTILE_RADIUS, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Add glow effect
                this.ctx.shadowColor = '#ffaa00';
                this.ctx.shadowBlur = 10;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            });
        }
        
        // Draw players
        Object.entries(this.room.presence).forEach(([clientId, presence]) => {
            if (presence.x === undefined || presence.y === undefined) return;
            
            const peer = this.room.peers[clientId];
            if (!peer) return;
            
            // Draw player circle
            this.ctx.beginPath();
            this.ctx.arc(presence.x, presence.y, 20, 0, Math.PI * 2);
            
            // Player color based on health
            const healthPercent = (presence.health || 0) / this.MAX_HEALTH;
            const r = Math.floor(255 * (1 - healthPercent));
            const g = Math.floor(255 * healthPercent);
            const b = 100;
            
            this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            this.ctx.fill();
            
            // Draw player outline
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = clientId === this.room.clientId ? '#ffffff' : '#aaaaaa';
            this.ctx.stroke();
            
            // Draw avatar in center of player
            if (peer.avatarUrl) {
                // Create a circular clip for the avatar
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.arc(presence.x, presence.y, 15, 0, Math.PI * 2);
                this.ctx.clip();
                
                // Draw avatar if already loaded
                if (this.avatarCache && this.avatarCache[clientId]) {
                    this.ctx.drawImage(
                        this.avatarCache[clientId],
                        presence.x - 15,
                        presence.y - 15,
                        30,
                        30
                    );
                } else {
                    // Load avatar
                    if (!this.avatarCache) this.avatarCache = {};
                    const img = new Image();
                    img.onload = () => {
                        this.avatarCache[clientId] = img;
                    };
                    img.src = peer.avatarUrl;
                }
                
                this.ctx.restore();
            }
            
            // Draw username above player
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(peer.username, presence.x, presence.y - 30);
            
            // Draw health bar above username
            const barWidth = 40;
            const barHeight = 5;
            this.ctx.fillStyle = '#333333';
            this.ctx.fillRect(
                presence.x - barWidth / 2,
                presence.y - 40,
                barWidth,
                barHeight
            );
            
            this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            this.ctx.fillRect(
                presence.x - barWidth / 2,
                presence.y - 40,
                barWidth * (healthPercent || 0),
                barHeight
            );
            
            // Draw score above health bar
            if (presence.score) {
                this.ctx.fillStyle = '#f8d847';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(
                    `Score: ${presence.score}`,
                    presence.x,
                    presence.y - 45
                );
            }
            
            // Draw dash cooldown indicator
            if (clientId === this.room.clientId && presence.dashCooldown) {
                const now = Date.now();
                const elapsed = now - (presence.lastDashTime || 0);
                const cooldownPercent = Math.min(1, elapsed / this.DASH_COOLDOWN);
                
                this.ctx.beginPath();
                this.ctx.arc(
                    presence.x,
                    presence.y,
                    25,
                    -Math.PI / 2,
                    -Math.PI / 2 + (2 * Math.PI * cooldownPercent),
                    false
                );
                this.ctx.lineTo(presence.x, presence.y);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                this.ctx.fill();
            }
        });
    }

    gameLoop(currentTime) {
        if (!this.lastUpdateTime) {
            this.lastUpdateTime = currentTime;
        }
        
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;
        
        // Handle player input
        this.handlePlayerInput(deltaTime);
        
        // Update game state
        this.updateGameState(deltaTime);
        
        // Render the game
        this.render();
        
        // Schedule the next frame
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    startGameLoop() {
        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', async () => {
    const game = new Game();
    await game.initialize();
});