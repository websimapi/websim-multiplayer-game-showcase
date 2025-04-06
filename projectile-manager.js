class ProjectileManager {
    constructor(game) {
        this.game = game;
        this.projectiles = {}; // Local projectile state for interpolation
        this.serverProjectiles = {}; // Last received server state
        
        // Constants
        this.PROJECTILE_SPEED = 400; // pixels per second
        this.INTERPOLATION_DELAY = 100; // ms - buffer for smoother interpolation
    }
    
    syncProjectiles(serverProjectiles) {
        this.serverProjectiles = serverProjectiles;
        
        // Add new projectiles from server
        Object.entries(serverProjectiles).forEach(([id, serverProjectile]) => {
            if (!this.projectiles[id]) {
                // New projectile - initialize with server data and add interpolation properties
                this.projectiles[id] = {
                    ...serverProjectile,
                    renderX: serverProjectile.x,
                    renderY: serverProjectile.y,
                    lastUpdateTime: Date.now()
                };
            } else {
                // Update existing projectile with server data
                // Keep render position for interpolation
                const renderX = this.projectiles[id].renderX;
                const renderY = this.projectiles[id].renderY;
                
                this.projectiles[id] = {
                    ...serverProjectile,
                    renderX,
                    renderY,
                    lastUpdateTime: Date.now()
                };
            }
        });
        
        // Remove projectiles that no longer exist on server
        Object.keys(this.projectiles).forEach(id => {
            if (!serverProjectiles[id]) {
                delete this.projectiles[id];
            }
        });
    }
    
    update(deltaTime) {
        // Update local projectiles for interpolation
        Object.values(this.projectiles).forEach(projectile => {
            // Calculate projected server position
            const timeSinceUpdate = (Date.now() - projectile.lastUpdateTime) / 1000;
            const projectedX = projectile.x + projectile.vx * timeSinceUpdate;
            const projectedY = projectile.y + projectile.vy * timeSinceUpdate;
            
            // Smoothly interpolate render position toward projected position
            const interpolationSpeed = 10; // Higher = faster catch-up
            projectile.renderX += (projectedX - projectile.renderX) * interpolationSpeed * deltaTime;
            projectile.renderY += (projectedY - projectile.renderY) * interpolationSpeed * deltaTime;
        });
        
        // Handle collisions with players
        this.checkCollisions();
    }
    
    checkCollisions() {
        if (!this.game.room.roomState.projectiles) return;
        
        const updatedProjectiles = { ...this.game.room.roomState.projectiles };
        let projectilesChanged = false;
        
        Object.entries(updatedProjectiles).forEach(([id, projectile]) => {
            // Check if projectile is out of bounds
            if (projectile.x < 0 || projectile.x > this.game.canvas.width ||
                projectile.y < 0 || projectile.y > this.game.canvas.height) {
                delete updatedProjectiles[id];
                projectilesChanged = true;
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
                    // Request damage to the hit player
                    this.game.room.requestPresenceUpdate(clientId, {
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
            this.game.room.updateRoomState({
                projectiles: updatedProjectiles
            });
        }
    }
    
    render(ctx) {
        // Draw local interpolated projectiles
        Object.values(this.projectiles).forEach(projectile => {
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(projectile.renderX, projectile.renderY, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add glow effect
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Draw trail effect for smoother visualization
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            
            // Calculate trail points based on velocity
            const trailLength = 3;
            for (let i = 1; i <= trailLength; i++) {
                const trailX = projectile.renderX - (projectile.vx / this.PROJECTILE_SPEED) * i * 5;
                const trailY = projectile.renderY - (projectile.vy / this.PROJECTILE_SPEED) * i * 5;
                
                ctx.beginPath();
                ctx.arc(trailX, trailY, 5 - i, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
}