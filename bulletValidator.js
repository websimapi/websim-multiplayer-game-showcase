/**
 * Utility class for validating projectile properties to prevent cheating
 */
class BulletValidator {
    constructor() {
        // Valid speed ranges in pixels per second
        this.MIN_BULLET_SPEED = 400;
        this.MAX_BULLET_SPEED = 800;
        
        // Valid damage ranges
        this.MIN_BULLET_DAMAGE = 1;
        this.MAX_BULLET_DAMAGE = 15;
    }
    
    /**
     * Validates bullet speed and damage values
     * @param {number} speed - The speed of the bullet in pixels per second
     * @param {number} damage - The damage value of the bullet
     * @returns {boolean} - Whether the bullet parameters are valid
     */
    isValidBullet(speed, damage) {
        // Check if speed is within allowed range
        if (speed < this.MIN_BULLET_SPEED || speed > this.MAX_BULLET_SPEED) {
            console.warn(`Invalid bullet speed detected: ${speed}px/s`);
            return false;
        }
        
        // Check if damage is within allowed range
        if (damage < this.MIN_BULLET_DAMAGE || damage > this.MAX_BULLET_DAMAGE) {
            console.warn(`Invalid bullet damage detected: ${damage}`);
            return false;
        }
        
        return true;
    }
    
    /**
     * Validates projectile data from network
     * @param {Object} projectileData - The projectile data object from network
     * @returns {boolean} - Whether the projectile data is valid
     */
    validateProjectileData(projectileData) {
        if (!projectileData) return false;
        
        // Calculate speed from velocity components
        const speed = Math.sqrt(
            projectileData.vx * projectileData.vx + 
            projectileData.vy * projectileData.vy
        );
        
        return this.isValidBullet(speed, projectileData.damage || 5);
    }
}