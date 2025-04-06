class ProjectileSystem {
    constructor(game) {
        this.game = game;
        this.projectiles = {};
        this.PROJECTILE_SPEED = 600; // Increased from 400 to 600 to match weapon speed
        this.PROJECTILE_LIFETIME = 1500; // Reduced from 2000ms to 1500ms for faster gameplay
        this.processedProjectileIds = new Set(); // Track which projectiles we've processed
        
        // Add bullet validator instance
        this.bulletValidator = new BulletValidator();
    }

    initialize() {
        // Set up subscription for room state
        this.game.room.subscribeRoomState(this.handleRoomStateUpdate.bind(this));
        
        // Set up message handler for projectile events
        this.game.originalMessageHandler = this.game.room.onmessage;
        this.game.room.onmessage = this.handleMessage.bind(this);
    }
    
    handleRoomStateUpdate(roomState) {
        if (roomState.projectilesData) {
            // Track which projectiles we've seen in this update
            const currentProjectileIds = new Set();
            
            // New projectiles were created
            Object.entries(roomState.projectilesData || {}).forEach(([id, data]) => {
                currentProjectileIds.add(id);
                
                if (!this.projectiles[id] && data) {
                    // Only process each projectile once
                    if (!this.processedProjectileIds.has(id)) {
                        // Validate projectile data before processing
                        if (!this.bulletValidator.validateProjectileData(data)) {
                            console.warn("Dropping invalid projectile:", id);
                            return;
                        }
                        
                        this.processedProjectileIds.add(id);
                        this.projectiles[id] = {
                            id: id,
                            x: data.startX,
                            y: data.startY,
                            vx: data.vx,
                            vy: data.vy,
                            ownerId: data.ownerId,
                            createdAt: data.createdAt,
                            damage: data.damage
                        };
                    }
                } else if (data === null && this.projectiles[id]) {
                    // Projectile was explicitly deleted
                    delete this.projectiles[id];
                    this.processedProjectileIds.delete(id); // Allow this ID to be reused
                }
            });
            
            // Remove any projectiles that are no longer in room state
            Object.keys(this.projectiles).forEach(id => {
                if (!currentProjectileIds.has(id) && roomState.projectilesData[id] === null) {
                    delete this.projectiles[id];
                    this.processedProjectileIds.delete(id);
                }
            });
        }
    }
    
    handleMessage(event) {
        const data = event.data;
        
        if (this.game.originalMessageHandler) {
            this.game.originalMessageHandler(event);
        }
        
        switch (data.type) {
            case 'shoot':
                // Create projectile effect
                this.createProjectileEffect(data.x, data.y, data.vx, data.vy);
                break;
            case 'dashHit':
                // Create dash hit effect
                this.createDashHitEffect(data.x, data.y);
                break;
        }
    }
    
    createProjectileEffect(x, y, vx, vy) {
        // Visual effect only, actual projectile is tracked locally
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
    
    createDashHitEffect(x, y) {
        // Visual effect for dash hit
        const effect = document.createElement('div');
        effect.className = 'hit-effect';
        effect.style.left = `${x - 15}px`;
        effect.style.top = `${y - 15}px`;
        effect.style.width = '30px';
        effect.style.height = '30px';
        effect.style.backgroundColor = 'rgba(255, 200, 100, 0.8)';
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation
        setTimeout(() => {
            effect.remove();
        }, 300);
    }
    
    shoot(startX, startY, targetX, targetY, speed = this.PROJECTILE_SPEED, damage = 5) {
        // Calculate direction vector
        const dx = targetX - startX;
        const dy = targetY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return;
        
        const normalizedDx = dx / length;
        const normalizedDy = dy / length;
        
        // Validate bullet speed and damage before creating projectile
        if (!this.bulletValidator.isValidBullet(speed, damage)) {
            console.warn("Attempted to create invalid projectile - dropping request");
            return;
        }
        
        // Create a unique ID for the projectile
        const projectileId = `${this.game.room.clientId}-${Date.now()}`;
        
        // Add projectile data to room state (just the initial values, not position updates)
        const projectileData = {
            startX: startX,
            startY: startY,
            vx: normalizedDx * speed,
            vy: normalizedDy * speed,
            ownerId: this.game.room.clientId,
            createdAt: Date.now(),
            damage: damage
        };
        
        const newProjectilesData = {
            ...(this.game.room.roomState.projectilesData || {}),
            [projectileId]: projectileData
        };
        
        this.game.room.updateRoomState({
            projectilesData: newProjectilesData
        });
        
        // Send shoot event for sound and visual effects
        this.game.room.send({
            type: 'shoot',
            x: startX,
            y: startY,
            vx: normalizedDx,
            vy: normalizedDy
        });
        
        // Auto-remove projectile after lifetime expires
        setTimeout(() => {
            if (this.game.room.roomState.projectilesData && 
                this.game.room.roomState.projectilesData[projectileId]) {
                
                const updatedProjectilesData = { ...this.game.room.roomState.projectilesData };
                updatedProjectilesData[projectileId] = null;
                
                this.game.room.updateRoomState({
                    projectilesData: updatedProjectilesData
                });
                
                // Remove from local tracking
                delete this.projectiles[projectileId];
            }
        }, this.PROJECTILE_LIFETIME);
    }
    
    update(deltaTime) {
        // Clear projectiles that have expired
        const now = Date.now();
        Object.values(this.projectiles).forEach(projectile => {
            if (now - projectile.createdAt > this.PROJECTILE_LIFETIME) {
                delete this.projectiles[projectile.id];
                this.processedProjectileIds.delete(projectile.id);
                
                // Request server-side removal if it's our projectile
                if (projectile.ownerId === this.game.room.clientId) {
                    const updatedProjectilesData = { ...this.game.room.roomState.projectilesData };
                    updatedProjectilesData[projectile.id] = null;
                    
                    this.game.room.updateRoomState({
                        projectilesData: updatedProjectilesData
                    });
                }
            }
        });
        
        // Update projectile positions locally based on their velocity
        Object.values(this.projectiles).forEach(projectile => {
            // Skip invalid projectiles
            if (!projectile || projectile.x === undefined || projectile.y === undefined) {
                return;
            }
            
            // Update projectile position
            projectile.x += projectile.vx * deltaTime;
            projectile.y += projectile.vy * deltaTime;
            
            // Check if projectile is out of bounds of the map
            if (projectile.x < 0 || projectile.x > this.game.MAP_WIDTH ||
                projectile.y < 0 || projectile.y > this.game.MAP_HEIGHT) {
                
                // Remove locally
                delete this.projectiles[projectile.id];
                this.processedProjectileIds.delete(projectile.id);
                
                // Request server-side removal if it's our projectile
                if (projectile.ownerId === this.game.room.clientId) {
                    const updatedProjectilesData = { ...this.game.room.roomState.projectilesData };
                    updatedProjectilesData[projectile.id] = null;
                    
                    this.game.room.updateRoomState({
                        projectilesData: updatedProjectilesData
                    });
                }
                
                return;
            }
            
            // Check for collision with players
            Object.entries(this.game.room.presence).forEach(([clientId, presence]) => {
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
                
                if (distance < 20) { // Player radius + projectile radius
                    // Remove locally
                    delete this.projectiles[projectile.id];
                    this.processedProjectileIds.delete(projectile.id);
                    
                    // Request server-side removal if it's our projectile
                    if (projectile.ownerId === this.game.room.clientId) {
                        // Request damage to the hit player
                        this.game.room.requestPresenceUpdate(clientId, {
                            type: 'damage',
                            amount: projectile.damage || 10
                        });
                        
                        // Remove from room state
                        const updatedProjectilesData = { ...this.game.room.roomState.projectilesData };
                        updatedProjectilesData[projectile.id] = null;
                        
                        this.game.room.updateRoomState({
                            projectilesData: updatedProjectilesData
                        });
                    }
                }
            });
        });
    }
    
    render(ctx) {
        // Draw projectiles only if they're in view
        Object.values(this.projectiles).forEach(projectile => {
            // Skip invalid projectiles
            if (!projectile || projectile.x === undefined || projectile.y === undefined) {
                return;
            }
            
            // Skip if projectile is outside of camera view
            if (projectile.x < this.game.camera.x - 10 || 
                projectile.x > this.game.camera.x + this.game.canvas.width + 10 ||
                projectile.y < this.game.camera.y - 10 || 
                projectile.y > this.game.camera.y + this.game.canvas.height + 10) {
                return;
            }
            
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add glow effect
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }
}