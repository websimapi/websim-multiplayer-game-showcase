class GameShooter {
    constructor(game) {
        this.game = game;
        this.projectileManager = new ProjectileManager(game);
        this.shootCooldown = 200; // ms
        this.lastShootTime = 0;
    }
    
    shoot(originX, originY, targetX, targetY) {
        const now = Date.now();
        
        // Check cooldown
        if (now - this.lastShootTime < this.shootCooldown) {
            return;
        }
        
        this.lastShootTime = now;
        
        // Fire the projectile
        const projectileId = this.projectileManager.fireProjectile(
            originX, 
            originY, 
            targetX, 
            targetY
        );
    }
    
    update(deltaTime) {
        // Update projectiles
        this.projectileManager.update(deltaTime);
    }
    
    render(ctx) {
        // Render projectiles
        this.projectileManager.render(ctx);
    }
}