class StructureSystem {
    constructor(game) {
        this.game = game;
        this.structures = {};
        this.WALL_WIDTH = 50;
        this.WALL_HEIGHT = 50;
        this.WALL_HEALTH = 100;
        this.MAX_STRUCTURES_PER_PLAYER = 5;
        this.lastPlaceTime = 0;
        this.PLACE_COOLDOWN = 1000; // 1 second cooldown between placing structures
        
        // Color palette for structures based on health percentage
        this.wallColors = {
            healthy: '#8c7853', // Brown
            damaged: '#99704c', // Lighter brown
            critical: '#a34a28'  // Reddish brown
        };
    }
    
    initialize() {
        // Set up subscription for room state to track structures
        this.game.room.subscribeRoomState(this.handleRoomStateUpdate.bind(this));
        
        // Add keypress listener for placing structures
        window.addEventListener('keydown', (e) => {
            if (e.key === 'e' || e.key === 'E') {
                this.placeStructure('wall');
            }
        });
    }
    
    handleRoomStateUpdate(roomState) {
        if (roomState.structures) {
            // Track which structures we've seen in this update
            const currentStructureIds = new Set();
            
            Object.entries(roomState.structures || {}).forEach(([id, data]) => {
                currentStructureIds.add(id);
                
                if (data && !this.structures[id]) {
                    // New structure
                    this.structures[id] = { ...data };
                } else if (data && this.structures[id]) {
                    // Update existing structure
                    this.structures[id] = { ...this.structures[id], ...data };
                } else if (data === null && this.structures[id]) {
                    // Structure was removed
                    delete this.structures[id];
                }
            });
        }
    }
    
    canPlaceStructure(type) {
        const now = Date.now();
        
        // Check cooldown
        if (now - this.lastPlaceTime < this.PLACE_COOLDOWN) {
            return false;
        }
        
        // Count how many structures this player has already placed
        const myClientId = this.game.room.clientId;
        let structureCount = 0;
        
        Object.values(this.structures).forEach(structure => {
            if (structure.ownerId === myClientId) {
                structureCount++;
            }
        });
        
        return structureCount < this.MAX_STRUCTURES_PER_PLAYER;
    }
    
    placeStructure(type) {
        if (!this.canPlaceStructure(type)) {
            return;
        }
        
        const myPresence = this.game.room.presence[this.game.room.clientId];
        if (!myPresence) return;
        
        // Calculate position in front of player based on facing direction
        let dirX = 0;
        let dirY = 0;
        
        // If player is moving, use that direction
        if (myPresence.vx !== 0 || myPresence.vy !== 0) {
            const length = Math.sqrt(myPresence.vx * myPresence.vx + myPresence.vy * myPresence.vy);
            if (length > 0) {
                dirX = myPresence.vx / length;
                dirY = myPresence.vy / length;
            }
        } else {
            // If player is not moving, use direction to mouse
            const dx = this.game.mouse.worldX - myPresence.x;
            const dy = this.game.mouse.worldY - myPresence.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                dirX = dx / length;
                dirY = dy / length;
            }
        }
        
        // Position the structure a bit in front of the player
        const placeDistance = 60;
        const structureX = Math.round(myPresence.x + dirX * placeDistance);
        const structureY = Math.round(myPresence.y + dirY * placeDistance);
        
        // Create a unique ID for the structure
        const structureId = `${this.game.room.clientId}-structure-${Date.now()}`;
        
        // Create the structure data
        const structureData = {
            type: type,
            x: structureX,
            y: structureY,
            width: this.WALL_WIDTH,
            height: this.WALL_HEIGHT,
            health: this.WALL_HEALTH,
            maxHealth: this.WALL_HEALTH,
            ownerId: this.game.room.clientId,
            createdAt: Date.now()
        };
        
        // Update room state with the new structure
        const newStructures = {
            ...(this.game.room.roomState.structures || {}),
            [structureId]: structureData
        };
        
        this.game.room.updateRoomState({
            structures: newStructures
        });
        
        // Update last place time
        this.lastPlaceTime = Date.now();
        
        // Send structure placed event for sound/visual effects
        this.game.room.send({
            type: 'structurePlaced',
            x: structureX,
            y: structureY,
            structureType: type
        });
        
        // Create structure placed effect
        this.createStructurePlacedEffect(structureX, structureY);
    }
    
    damageStructure(structureId, amount) {
        const structure = this.structures[structureId];
        if (!structure) return;
        
        // Calculate new health
        const newHealth = Math.max(0, structure.health - amount);
        
        // Update structure in room state
        const updatedStructure = {
            ...structure,
            health: newHealth
        };
        
        const newStructures = {
            ...(this.game.room.roomState.structures || {}),
            [structureId]: updatedStructure
        };
        
        this.game.room.updateRoomState({
            structures: newStructures
        });
        
        // Create hit effect
        this.createStructureHitEffect(structure.x, structure.y);
        
        // Send hit event for sound
        this.game.room.send({
            type: 'structureHit',
            x: structure.x,
            y: structure.y
        });
        
        // If structure is destroyed, remove it after a short delay
        if (newHealth <= 0) {
            setTimeout(() => {
                const currentStructures = { ...(this.game.room.roomState.structures || {}) };
                currentStructures[structureId] = null;
                
                this.game.room.updateRoomState({
                    structures: currentStructures
                });
                
                // Create destruction effect
                this.createStructureDestroyedEffect(structure.x, structure.y);
                
                // Send destroyed event for sound
                this.game.room.send({
                    type: 'structureDestroyed',
                    x: structure.x,
                    y: structure.y,
                    structureType: structure.type
                });
            }, 50);
        }
    }
    
    createStructurePlacedEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'structure-placed-effect';
        effect.style.left = `${x - 25}px`;
        effect.style.top = `${y - 25}px`;
        effect.style.width = '50px';
        effect.style.height = '50px';
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 500);
    }
    
    createStructureHitEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'structure-hit-effect';
        effect.style.left = `${x - 25}px`;
        effect.style.top = `${y - 25}px`;
        effect.style.width = '50px';
        effect.style.height = '50px';
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 300);
    }
    
    createStructureDestroyedEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'structure-destroyed-effect';
        effect.style.left = `${x - 30}px`;
        effect.style.top = `${y - 30}px`;
        effect.style.width = '60px';
        effect.style.height = '60px';
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 800);
    }
    
    checkProjectileCollisions(projectile) {
        // Check for collisions with structures
        for (const [structureId, structure] of Object.entries(this.structures)) {
            // Simple box collision check
            if (
                projectile.x > structure.x - structure.width/2 &&
                projectile.x < structure.x + structure.width/2 &&
                projectile.y > structure.y - structure.height/2 &&
                projectile.y < structure.y + structure.height/2
            ) {
                // Damage the structure
                this.damageStructure(structureId, projectile.damage || 5);
                
                // Return true to indicate collision happened
                return true;
            }
        }
        
        return false;
    }
    
    update(deltaTime) {
        // No continuous updates needed for structures
    }
    
    render(ctx) {
        // Draw structures
        Object.entries(this.structures).forEach(([structureId, structure]) => {
            // Skip if structure is outside of camera view
            if (
                structure.x + structure.width/2 < this.game.camera.x ||
                structure.x - structure.width/2 > this.game.camera.x + this.game.canvas.width ||
                structure.y + structure.height/2 < this.game.camera.y ||
                structure.y - structure.height/2 > this.game.camera.y + this.game.canvas.height
            ) {
                return;
            }
            
            // Determine color based on health percentage
            const healthPercent = structure.health / structure.maxHealth;
            let color;
            
            if (healthPercent > 0.66) {
                color = this.wallColors.healthy;
            } else if (healthPercent > 0.33) {
                color = this.wallColors.damaged;
            } else {
                color = this.wallColors.critical;
            }
            
            if (structure.type === 'wall') {
                // Draw wall
                ctx.fillStyle = color;
                ctx.fillRect(
                    structure.x - structure.width/2,
                    structure.y - structure.height/2,
                    structure.width,
                    structure.height
                );
                
                // Draw border
                ctx.strokeStyle = '#555555';
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    structure.x - structure.width/2,
                    structure.y - structure.height/2,
                    structure.width,
                    structure.height
                );
                
                // Draw health bar above structure
                const barWidth = structure.width;
                const barHeight = 5;
                const barX = structure.x - structure.width/2;
                const barY = structure.y - structure.height/2 - 10;
                
                // Background of health bar
                ctx.fillStyle = '#333333';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Foreground of health bar
                if (healthPercent > 0.66) {
                    ctx.fillStyle = '#44ff44';
                } else if (healthPercent > 0.33) {
                    ctx.fillStyle = '#ffff44';
                } else {
                    ctx.fillStyle = '#ff4444';
                }
                
                ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
                
                // If it's our structure, indicate ownership
                if (structure.ownerId === this.game.room.clientId) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fillRect(
                        structure.x - structure.width/2,
                        structure.y - structure.height/2,
                        structure.width,
                        structure.height
                    );
                }
            }
        });
    }
}