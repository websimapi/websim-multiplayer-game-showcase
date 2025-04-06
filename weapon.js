class Weapon {
    constructor(game) {
        this.game = game;
        this.lastFireTime = 0;
        this.fireRate = 50; // Changed from 100ms to 50ms for much faster rapid fire
        this.bulletSpeed = 600; 
        this.damage = 5;
        this.maxBulletsPerSecond = 15; // Threshold for bullet rate limiting
        this.recentBulletCounts = {}; // Track bullets fired by each player
    }

    canFire() {
        const now = Date.now();
        
        // Basic fire rate check
        if (now - this.lastFireTime < this.fireRate) {
            return false;
        }
        
        // Check bullet threshold
        const clientId = this.game.room.clientId;
        if (!this.recentBulletCounts[clientId]) {
            this.recentBulletCounts[clientId] = [];
        }
        
        // Remove bullets older than 1 second
        const oneSecondAgo = now - 1000;
        this.recentBulletCounts[clientId] = this.recentBulletCounts[clientId].filter(
            time => time > oneSecondAgo
        );
        
        // Check if we're over the threshold
        if (this.recentBulletCounts[clientId].length >= this.maxBulletsPerSecond) {
            return false;
        }
        
        return true;
    }

    fire(startX, startY, targetX, targetY) {
        if (!this.canFire()) return false;
        
        // Update last fire time
        const now = Date.now();
        this.lastFireTime = now;
        
        // Add to recent bullets count
        const clientId = this.game.room.clientId;
        if (!this.recentBulletCounts[clientId]) {
            this.recentBulletCounts[clientId] = [];
        }
        this.recentBulletCounts[clientId].push(now);
        
        // Delegate shooting to projectile system
        this.game.projectileSystem.shoot(startX, startY, targetX, targetY);
        
        return true;
    }
    
    // Track bullets from other players to enforce rate limiting
    trackBullet(clientId) {
        const now = Date.now();
        
        if (!this.recentBulletCounts[clientId]) {
            this.recentBulletCounts[clientId] = [];
        }
        
        // Remove bullets older than 1 second
        const oneSecondAgo = now - 1000;
        this.recentBulletCounts[clientId] = this.recentBulletCounts[clientId].filter(
            time => time > oneSecondAgo
        );
        
        // Add this bullet
        this.recentBulletCounts[clientId].push(now);
        
        // Return whether this player is over threshold
        return this.recentBulletCounts[clientId].length <= this.maxBulletsPerSecond;
    }
}