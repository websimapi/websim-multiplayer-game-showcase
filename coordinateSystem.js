class CoordinateSystem {
    constructor(game) {
        this.game = game;
        this.container = document.createElement('div');
        this.container.className = 'coordinate-display';
        document.querySelector('.game-area').appendChild(this.container);
        
        // Create coordinate display
        this.coordDisplay = document.createElement('div');
        this.coordDisplay.className = 'coordinate-text';
        this.container.appendChild(this.coordDisplay);
    }
    
    update() {
        const myPresence = this.game.room?.presence?.[this.game.room?.clientId];
        if (!myPresence) return;
        
        // Update coordinate display with exact floating point values
        this.coordDisplay.textContent = `X: ${myPresence.x.toFixed(2)}, Y: ${myPresence.y.toFixed(2)}`;
    }
}