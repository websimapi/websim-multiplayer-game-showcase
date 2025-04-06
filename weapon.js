class Weapon {
    constructor(game) {
        this.game = game;
        this.lastFireTime = 0;
        this.fireRate = 100; // Changed from 300ms to 100ms for rapid fire
        this.bulletSpeed = 600; // Increased from 400 to 600 for faster bullets
        this.damage = 5; // Reduced damage per bullet since firing rate is higher
        
        // Add bullet validator
        this.bulletValidator = new BulletValidator();
    }

    canFire() {
        const now = Date.now();
        return now - this.lastFireTime >= this.fireRate;
    }

    fire(startX, startY, targetX, targetY) {
        if (!this.canFire()) return false;
        
        // Validate speed before even attempting to fire
        if (!this.bulletValidator.isValidBullet(this.bulletSpeed, this.damage)) {
            console.warn("Invalid weapon configuration - skipping fire");
            return false;
        }
        
        // Update last fire time
        this.lastFireTime = Date.now();
        
        // Delegate shooting to projectile system
        this.game.projectileSystem.shoot(startX, startY, targetX, targetY, this.bulletSpeed, this.damage);
        
        return true;
    }
}