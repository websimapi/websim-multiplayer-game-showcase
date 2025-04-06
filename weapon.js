class Weapon {
    constructor(game) {
        this.game = game;
        this.lastFireTime = 0;
        this.fireRate = 300; // 0.3 seconds in milliseconds
        this.bulletSpeed = 400; // pixels per second
        this.damage = 10;
    }

    canFire() {
        const now = Date.now();
        return now - this.lastFireTime >= this.fireRate;
    }

    fire(startX, startY, targetX, targetY) {
        if (!this.canFire()) return false;
        
        // Update last fire time
        this.lastFireTime = Date.now();
        
        // Delegate shooting to projectile system
        this.game.projectileSystem.shoot(startX, startY, targetX, targetY);
        
        return true;
    }
}