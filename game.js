class Game {
    constructor() {
        this.room = new WebsimSocket();
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.players = {}; // Player characters
        this.lastUpdateTime = 0;
        this.keys = {}; // For tracking key presses
        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 }; // For tracking mouse position
        
        // Game constants
        this.PLAYER_SPEED = 200; // pixels per second
        this.DASH_SPEED = 600; // pixels per second
        this.DASH_DURATION = 200; // ms
        this.DASH_COOLDOWN = 1000; // ms
        this.MAX_HEALTH = 100;
        
        // Map and camera settings
        this.MAP_WIDTH = 2000;
        this.MAP_HEIGHT = 1500;
        this.camera = { x: 0, y: 0 };

        // Initialize projectile system
        this.projectileSystem = new ProjectileSystem(this);
        
        // Initialize weapon system
        this.weapon = new Weapon(this);
        
        // Initialize dash attack system
        this.dashAttack = new DashAttack(this);
        
        // Initialize coordinate system
        this.coordinateSystem = new CoordinateSystem(this);
        
        // Initialize structure system
        this.structureSystem = new StructureSystem(this);
        
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
        
        // Store original message handler
        this.originalMessageHandler = this.room.onmessage;
        
        // Initialize projectile system
        this.projectileSystem.initialize();
        
        // Initialize dash attack system
        this.dashAttack.initialize();
        
        // Initialize structure system
        this.structureSystem.initialize();
        
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
        
        // Center camera if player isn't initialized yet
        if (!this.room || !this.room.presence || !this.room.presence[this.room.clientId]) {
            this.camera.x = (this.MAP_WIDTH - this.canvas.width) / 2;
            this.camera.y = (this.MAP_HEIGHT - this.canvas.height) / 2;
        }
    }

    initializePlayer() {
        // Initialize player with starting values in the middle of the map
        this.room.updatePresence({
            x: this.MAP_WIDTH / 2,
            y: this.MAP_HEIGHT / 2,
            vx: 0,
            vy: 0,
            health: this.MAX_HEALTH,
            score: 0,
            dashing: false,
            dashCooldown: false,
            lastDashTime: 0
        });
        
        // Initialize camera position to center on player
        this.updateCamera();
    }

    handlePresenceUpdate(presence) {
        // Update the players list in the UI
        this.updatePlayersList();
    }

    handleRoomStateUpdate(roomState) {
        // We're now handling projectiles in the ProjectileSystem class
        this.updatePlayersList();
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
                        x: Math.random() * this.MAP_WIDTH,
                        y: Math.random() * this.MAP_HEIGHT,
                        health: this.MAX_HEALTH
                    });
                    
                    // Update camera to follow our player
                    this.updateCamera();
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
                
            case 'structurePlaced':
                // Create structure placed effect at the given location
                this.structureSystem.createStructurePlacedEffect(data.x, data.y);
                break;
                
            case 'structureHit':
                // Create structure hit effect
                this.structureSystem.createStructureHitEffect(data.x, data.y);
                break;
                
            case 'structureDestroyed':
                // Create structure destroyed effect
                this.structureSystem.createStructureDestroyedEffect(data.x, data.y);
                break;
                
            case 'placementModeOn':
                // Show placement mode indicator if desired
                console.log("Placement mode activated");
                break;
                
            case 'placementModeOff':
                // Hide placement mode indicator if desired
                console.log("Placement mode deactivated");
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
            
            // Update world mouse position
            this.mouse.worldX = this.mouse.x + this.camera.x;
            this.mouse.worldY = this.mouse.y + this.camera.y;
        });
        
        // Click to shoot
        this.canvas.addEventListener('click', (e) => {
            this.shoot();
        });
        
        // Mouse down/up for rapid fire
        this.isMouseDown = false;
        this.canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            this.isMouseDown = false;
        });
        
        // Handle case when mouse leaves canvas while held down
        this.canvas.addEventListener('mouseleave', (e) => {
            this.isMouseDown = false;
        });
    }

    dash() {
        // Use the dash attack system instead of inline code
        this.dashAttack.dash();
    }

    shoot() {
        const myPresence = this.room.presence[this.room.clientId];
        if (!myPresence) return;
        
        // Delegate to weapon system
        this.weapon.fire(myPresence.x, myPresence.y, this.mouse.worldX, this.mouse.worldY);
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
            
            // Keep players within the map bounds
            newX = Math.max(20, Math.min(this.MAP_WIDTH - 20, newX));
            newY = Math.max(20, Math.min(this.MAP_HEIGHT - 20, newY));
            
            // Only update our own position
            if (clientId === this.room.clientId) {
                // Check for collision with structures before moving
                if (!this.structureSystem.checkPlayerCollisions(presence.x, presence.y, newX, newY)) {
                    if (newX !== presence.x || newY !== presence.y) {
                        this.room.updatePresence({
                            x: newX,
                            y: newY
                        });
                        
                        // Update camera to follow our player
                        this.updateCamera();
                    }
                } else {
                    // If collision detected, try to slide along walls
                    // First try moving just in X direction
                    if (!this.structureSystem.checkPlayerCollisions(presence.x, presence.y, newX, presence.y)) {
                        this.room.updatePresence({
                            x: newX
                        });
                        // Update camera
                        this.updateCamera();
                    }
                    // Then try moving just in Y direction
                    else if (!this.structureSystem.checkPlayerCollisions(presence.x, presence.y, presence.x, newY)) {
                        this.room.updatePresence({
                            y: newY
                        });
                        // Update camera
                        this.updateCamera();
                    }
                }
            }
        });
        
        // Update mouse position relative to the world, not the canvas
        const myPresence = this.room.presence[this.room.clientId];
        if (myPresence) {
            this.mouse.worldX = this.mouse.x + this.camera.x;
            this.mouse.worldY = this.mouse.y + this.camera.y;
            
            // Handle rapid fire when mouse is held down
            if (this.isMouseDown) {
                this.shoot();
            }
        }
        
        // Update coordinate display
        this.coordinateSystem.update();
        
        // Update dash attack state
        this.dashAttack.update();
        
        // Update structure system
        this.structureSystem.update(deltaTime);
        
        // Update projectiles using the ProjectileSystem
        this.projectileSystem.update(deltaTime);
    }
    
    updateCamera() {
        const myPresence = this.room.presence[this.room.clientId];
        if (!myPresence) return;
        
        // Center camera on player with smooth movement
        const targetX = myPresence.x - this.canvas.width / 2;
        const targetY = myPresence.y - this.canvas.height / 2;
        
        // Clamp camera to map boundaries
        this.camera.x = Math.max(0, Math.min(this.MAP_WIDTH - this.canvas.width, targetX));
        this.camera.y = Math.max(0, Math.min(this.MAP_HEIGHT - this.canvas.height, targetY));
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save the canvas state before transforming
        this.ctx.save();
        
        // Apply camera transform
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Draw map boundaries
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
        
        // Draw grid
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x < this.MAP_WIDTH; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.MAP_HEIGHT);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.MAP_HEIGHT; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.MAP_WIDTH, y);
            this.ctx.stroke();
        }
        
        // Render structures using the StructureSystem
        this.structureSystem.render(this.ctx);
        
        // Render projectiles using the ProjectileSystem
        this.projectileSystem.render(this.ctx);
        
        // Draw players
        Object.entries(this.room.presence).forEach(([clientId, presence]) => {
            if (presence.x === undefined || presence.y === undefined) return;
            
            // Skip if player is outside of camera view (with some padding)
            if (presence.x < this.camera.x - 50 || 
                presence.x > this.camera.x + this.canvas.width + 50 ||
                presence.y < this.camera.y - 50 || 
                presence.y > this.camera.y + this.canvas.height + 50) {
                return;
            }
            
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
        
        // Restore the canvas state after rendering world elements
        this.ctx.restore();
        
        // UI elements that should be fixed to the screen, not the world
        // Draw mini-map in the corner
        this.drawMiniMap();
    }
    
    drawMiniMap() {
        const miniMapWidth = 150;
        const miniMapHeight = 120;
        const miniMapX = this.canvas.width - miniMapWidth - 10;
        const miniMapY = 10;
        const miniMapScale = Math.min(miniMapWidth / this.MAP_WIDTH, miniMapHeight / this.MAP_HEIGHT);
        
        // Draw mini-map background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(miniMapX, miniMapY, miniMapWidth, miniMapHeight);
        
        // Draw world boundary on mini-map
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(miniMapX, miniMapY, miniMapWidth, miniMapHeight);
        
        // Draw current viewport on mini-map
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            miniMapX + this.camera.x * miniMapScale,
            miniMapY + this.camera.y * miniMapScale,
            this.canvas.width * miniMapScale,
            this.canvas.height * miniMapScale
        );
        
        // Draw players on mini-map
        Object.entries(this.room.presence).forEach(([clientId, presence]) => {
            if (presence.x === undefined || presence.y === undefined) return;
            
            // Calculate mini-map position
            const dotX = miniMapX + presence.x * miniMapScale;
            const dotY = miniMapY + presence.y * miniMapScale;
            
            // Draw player dot
            this.ctx.fillStyle = clientId === this.room.clientId ? '#00ff00' : '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            this.ctx.fill();
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