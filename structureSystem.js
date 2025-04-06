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
        this.placementMode = false; // Track if we're in wall placement mode
        this.gridSize = 50; // Grid size for wall placement
        
        // Color palette for structures based on health percentage
        this.wallColors = {
            healthy: '#8c7853', // Brown
            damaged: '#99704c', // Lighter brown
            critical: '#a34a28'  // Reddish brown
        };
        
        // Wall counter UI element
        this.wallCounter = document.createElement('div');
        this.wallCounter.className = 'wall-counter';
        document.querySelector('.game-area').appendChild(this.wallCounter);
        this.updateWallCounter();
    }
    
    initialize() {
        // Set up subscription for room state to track structures
        this.game.room.subscribeRoomState(this.handleRoomStateUpdate.bind(this));
        
        // Add keypress listener for toggling placement mode
        window.addEventListener('keydown', (e) => {
            if (e.key === 'e' || e.key === 'E') {
                this.togglePlacementMode();
            }
        });
        
        // Add click listener for placing structures in placement mode
        this.game.canvas.addEventListener('click', (e) => {
            if (this.placementMode) {
                this.placeStructureAtMouse('wall');
            }
        });
        
        // Update wall counter initially
        this.updateWallCounter();
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
            
            // Check for structures that have been removed from room state
            Object.keys(this.structures).forEach(id => {
                if (!currentStructureIds.has(id) || roomState.structures[id] === null) {
                    delete this.structures[id];
                }
            });
            
            // Update wall counter after handling structure changes
            this.updateWallCounter();
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
    
    togglePlacementMode() {
        this.placementMode = !this.placementMode;
        
        // Change cursor to indicate placement mode
        this.game.canvas.style.cursor = this.placementMode ? 'crosshair' : 'default';
        
        // Send event for UI feedback
        this.game.room.send({
            type: this.placementMode ? 'placementModeOn' : 'placementModeOff'
        });
    }
    
    placeStructureAtMouse(type) {
        if (!this.canPlaceStructure(type)) {
            return;
        }
        
        const myPresence = this.game.room.presence[this.game.room.clientId];
        if (!myPresence) return;
        
        // Get mouse position in world coordinates
        const mouseX = this.game.mouse.worldX;
        const mouseY = this.game.mouse.worldY;
        
        // Snap to grid
        const gridX = Math.floor(mouseX / this.gridSize) * this.gridSize + this.gridSize / 2;
        const gridY = Math.floor(mouseY / this.gridSize) * this.gridSize + this.gridSize / 2;
        
        // Check if there's already a structure at this position
        if (this.isStructureAtPosition(gridX, gridY)) {
            // Cannot place wall on top of another wall
            return;
        }
        
        // Create a unique ID for the structure
        const structureId = `${this.game.room.clientId}-structure-${Date.now()}`;
        
        // Create the structure data
        const structureData = {
            type: type,
            x: gridX,
            y: gridY,
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
        
        // Update wall counter
        this.updateWallCounter();
        
        // Send structure placed event for sound/visual effects
        this.game.room.send({
            type: 'structurePlaced',
            x: gridX,
            y: gridY,
            structureType: type
        });
        
        // Create structure placed effect
        this.createStructurePlacedEffect(gridX, gridY);
    }
    
    isStructureAtPosition(x, y) {
        // Check if there's a structure at or very near the given position
        const margin = 5; // Small margin for error
        return Object.values(this.structures).some(structure => {
            return Math.abs(structure.x - x) < (structure.width / 2 + margin) &&
                   Math.abs(structure.y - y) < (structure.height / 2 + margin);
        });
    }
    
    placeStructure(type) {
        // This method is now deprecated - we're using placeStructureAtMouse instead
        this.togglePlacementMode();
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
        
        // If structure is destroyed, remove it immediately
        if (newHealth <= 0) {
            setTimeout(() => {
                const currentStructures = { ...(this.game.room.roomState.structures || {}) };
                currentStructures[structureId] = null;
                
                this.game.room.updateRoomState({
                    structures: currentStructures
                });
                
                // Also remove from local structures cache
                delete this.structures[structureId];
                
                // Update wall counter
                this.updateWallCounter();
                
                // Create destruction effect
                this.createStructureDestroyedEffect(structure.x, structure.y);
                
                // Send destroyed event for sound
                this.game.room.send({
                    type: 'structureDestroyed',
                    x: structure.x,
                    y: structure.y,
                    structureType: structure.type
                });
            }, 50); // Small delay to ensure synchronization
        }
    }
    
    createStructureHitEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'structure-hit-effect';
        effect.style.left = `${x - this.WALL_WIDTH/2}px`;
        effect.style.top = `${y - this.WALL_HEIGHT/2}px`;
        effect.style.width = `${this.WALL_WIDTH}px`;
        effect.style.height = `${this.WALL_HEIGHT}px`;
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 300);
    }
    
    createStructureDestroyedEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'structure-destroyed-effect';
        effect.style.left = `${x - this.WALL_WIDTH/2}px`;
        effect.style.top = `${y - this.WALL_HEIGHT/2}px`;
        effect.style.width = `${this.WALL_WIDTH}px`;
        effect.style.height = `${this.WALL_HEIGHT}px`;
        document.querySelector('.game-area').appendChild(effect);
        
        // Remove the element after animation completes
        setTimeout(() => {
            effect.remove();
        }, 800);
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
    
    checkPlayerCollisions(playerX, playerY, newX, newY, playerRadius = 20) {
        // Check for collisions with all structures
        for (const structure of Object.values(this.structures)) {
            // Box collision check with player radius
            const halfWidth = structure.width / 2;
            const halfHeight = structure.height / 2;
            
            // Check if new position would collide with structure
            if (
                newX + playerRadius > structure.x - halfWidth &&
                newX - playerRadius < structure.x + halfWidth &&
                newY + playerRadius > structure.y - halfHeight &&
                newY - playerRadius < structure.y + halfHeight
            ) {
                // Collision detected, return true
                return true;
            }
        }
        
        // No collision detected
        return false;
    }
    
    update(deltaTime) {
        // Display ghost wall at mouse position when in placement mode
        if (this.placementMode) {
            // We'll handle the display in render method
        }
    }
    
    updateWallCounter() {
        // Count how many structures this player has placed
        const myClientId = this.game.room.clientId;
        let structureCount = 0;
        
        Object.values(this.structures).forEach(structure => {
            if (structure.ownerId === myClientId) {
                structureCount++;
            }
        });
        
        // Update the counter display
        this.wallCounter.textContent = `Walls: ${structureCount}/${this.MAX_STRUCTURES_PER_PLAYER}`;
        
        // Highlight counter in red if at max capacity
        if (structureCount >= this.MAX_STRUCTURES_PER_PLAYER) {
            this.wallCounter.style.color = '#ff4444';
        } else {
            this.wallCounter.style.color = '#ffffff';
        }
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
        
        // Draw ghost wall at mouse position when in placement mode
        if (this.placementMode) {
            const mouseX = this.game.mouse.worldX;
            const mouseY = this.game.mouse.worldY;
            
            // Snap to grid
            const gridX = Math.floor(mouseX / this.gridSize) * this.gridSize + this.gridSize / 2;
            const gridY = Math.floor(mouseY / this.gridSize) * this.gridSize + this.gridSize / 2;
            
            // Check if placement is valid
            const isValid = !this.isStructureAtPosition(gridX, gridY) && this.canPlaceStructure('wall');
            
            // Draw ghost wall with appropriate color
            ctx.fillStyle = isValid ? 'rgba(140, 120, 83, 0.5)' : 'rgba(255, 0, 0, 0.5)';
            ctx.fillRect(
                gridX - this.WALL_WIDTH / 2,
                gridY - this.WALL_HEIGHT / 2,
                this.WALL_WIDTH,
                this.WALL_HEIGHT
            );
            
            // Draw border
            ctx.strokeStyle = isValid ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 0, 0, 0.7)';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                gridX - this.WALL_WIDTH / 2,
                gridY - this.WALL_HEIGHT / 2,
                this.WALL_WIDTH,
                this.WALL_HEIGHT
            );
        }
    }
}