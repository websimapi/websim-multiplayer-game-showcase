class DashAttack {
    constructor(game) {
        this.game = game;
        
        // Dash attack constants
        this.DASH_SPEED = 600; // pixels per second
        this.DASH_DURATION = 200; // ms
        this.DASH_COOLDOWN = 1000; // ms
        this.DASH_DAMAGE = 15; // damage on hit
        this.DASH_RADIUS = 30; // collision radius
        
        // Track dash state
        this.isDashing = false;
        this.dashStartTime = 0;
        this.dashEndTime = 0;
        this.dashDirection = { x: 0, y: 0 };
        this.hitPlayers = new Set(); // Track players hit during dash to avoid multiple hits
    }
    
    initialize() {
        // Set up collision detection during dash
        this.game.room.subscribePresence(() => {
            if (this.isDashing) {
                this.checkDashCollisions();
            }
        });
    }
    
    dash() {
        const myPresence = this.game.room.presence[this.game.room.clientId];
        if (!myPresence) return;
        
        const now = Date.now();
        
        // Check if dash is on cooldown
        if (myPresence.dashCooldown || now - (myPresence.lastDashTime || 0) < this.DASH_COOLDOWN) {
            return;
        }
        
        // Determine dash direction based on current movement
        let directionX = 0;
        let directionY = 0;
        
        // If player is moving, use that direction
        if (myPresence.vx !== 0 || myPresence.vy !== 0) {
            const length = Math.sqrt(myPresence.vx * myPresence.vx + myPresence.vy * myPresence.vy);
            if (length > 0) {
                directionX = myPresence.vx / length;
                directionY = myPresence.vy / length;
            }
        } else {
            // If player is not moving, use direction to mouse
            const dx = this.game.mouse.worldX - myPresence.x;
            const dy = this.game.mouse.worldY - myPresence.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                directionX = dx / length;
                directionY = dy / length;
            }
        }
        
        // Update dash state
        this.isDashing = true;
        this.dashStartTime = now;
        this.dashEndTime = now + this.DASH_DURATION;
        this.dashDirection = { x: directionX, y: directionY };
        this.hitPlayers = new Set(); // Reset hit players
        
        // Update presence with dash state
        this.game.room.updatePresence({
            dashing: true,
            dashCooldown: true,
            lastDashTime: now,
            vx: directionX * this.DASH_SPEED,
            vy: directionY * this.DASH_SPEED
        });
        
        // Send dash effect event
        this.game.room.send({
            type: 'dash',
            x: myPresence.x,
            y: myPresence.y
        });
        
        // Create dash effect
        this.game.createDashEffect(myPresence.x, myPresence.y);
        
        // End dash after duration
        setTimeout(() => {
            this.endDash();
        }, this.DASH_DURATION);
    }
    
    endDash() {
        this.isDashing = false;
        
        this.game.room.updatePresence({
            dashing: false,
            vx: 0,
            vy: 0
        });
        
        // Reset cooldown after cooldown period
        setTimeout(() => {
            this.game.room.updatePresence({
                dashCooldown: false
            });
        }, this.DASH_COOLDOWN - this.DASH_DURATION);
    }
    
    checkDashCollisions() {
        const myPresence = this.game.room.presence[this.game.room.clientId];
        if (!myPresence || !this.isDashing) return;
        
        // Check for collisions with other players
        Object.entries(this.game.room.presence).forEach(([clientId, presence]) => {
            // Skip self, players already hit, or players without position
            if (clientId === this.game.room.clientId || 
                this.hitPlayers.has(clientId) ||
                presence.x === undefined || 
                presence.y === undefined ||
                presence.health <= 0) {
                return;
            }
            
            // Simple collision detection
            const dx = presence.x - myPresence.x;
            const dy = presence.y - myPresence.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.DASH_RADIUS + 20) { // Dash radius + player radius
                // Add player to hit list
                this.hitPlayers.add(clientId);
                
                // Request damage to the hit player
                this.game.room.requestPresenceUpdate(clientId, {
                    type: 'damage',
                    amount: this.DASH_DAMAGE
                });
                
                // Send dash hit event for sound/visual effects
                this.game.room.send({
                    type: 'dashHit',
                    x: presence.x,
                    y: presence.y
                });
            }
        });
        
        // Check for collisions with structures
        Object.entries(this.game.structureSystem.structures).forEach(([structureId, structure]) => {
            // Skip if structure is owned by player
            if (structure.ownerId === this.game.room.clientId) {
                return;
            }
            
            // Simple collision detection with box
            if (
                myPresence.x > structure.x - structure.width/2 - this.DASH_RADIUS &&
                myPresence.x < structure.x + structure.width/2 + this.DASH_RADIUS &&
                myPresence.y > structure.y - structure.height/2 - this.DASH_RADIUS &&
                myPresence.y < structure.y + structure.height/2 + this.DASH_RADIUS
            ) {
                // Damage the structure
                this.game.structureSystem.damageStructure(structureId, this.DASH_DAMAGE / 2); // Half damage to structures
                
                // Send dash hit event for sound/visual effects
                this.game.room.send({
                    type: 'dashHit',
                    x: structure.x,
                    y: structure.y
                });
            }
        });
    }
    
    update() {
        // Check if we need to end dash
        if (this.isDashing && Date.now() >= this.dashEndTime) {
            this.endDash();
        }
        
        // If dashing, check for collisions
        if (this.isDashing) {
            this.checkDashCollisions();
        }
    }
}