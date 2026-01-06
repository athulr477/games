/* --- AUDIO SYSTEM --- */
class AudioController {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; 
        this.masterGain.connect(this.ctx.destination);
    }
    resume() { if(this.ctx.state === 'suspended') this.ctx.resume(); }
    
    playTone(startFreq, endFreq, type, dur=0.2, vol=0.2) {
        this.resume();
        const osc = this.ctx.createOscillator(); 
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + dur);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + dur);
    }

    playJump() { this.playTone(150, 600, 'sine'); }
    playSlide() { this.playTone(100, 50, 'triangle'); }
    playCollect() { this.playTone(1200, 1800, 'sine', 0.1, 0.1); }
    playDeath() { this.playTone(300, 10, 'sawtooth', 0.5, 0.4); }
}

/* --- MAIN GAME SCENE --- */
class MainScene extends Phaser.Scene {
    constructor() { super('MainScene'); }

    create() {
        this.createAssets();
        this.audio = new AudioController();
        
        // --- GROUPS (Optimized) ---
        // We use staticConfig for performance
        const staticConfig = { allowGravity: false, immovable: true };
        this.platforms = this.physics.add.group(staticConfig);
        this.elevated = this.physics.add.group(staticConfig);
        this.obstacles = this.physics.add.group(staticConfig);
        this.movingSpikes = this.physics.add.group(staticConfig);
        this.energyDrinks = this.physics.add.group({ allowGravity: false });

        this.createSkyline(); 

        // --- PLAYER ---
        this.player = this.physics.add.sprite(100, 300, 'human');
        this.player.setTint(0xffffff).setDragX(1000).setMaxVelocity(600, 1000).setDepth(20);
        this.player.body.setSize(24, 60).setOffset(5, 0);
        this.isSliding = false;

        // --- LASER PURSUIT ---
        this.laserWall = this.add.rectangle(-500, 225, 20, 450, 0xff0000).setDepth(15).setAlpha(0.6);
        this.physics.add.existing(this.laserWall);
        this.laserWall.body.setAllowGravity(false);

        // --- CONTROLS ---
        this.cursors = this.input.keyboard.createCursorKeys();
        this.shiftKey = this.input.keyboard.addKey('SHIFT');

        // --- CAMERA ---
        this.cameras.main.setZoom(1.5);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -100, 50);

        // --- COLLISIONS ---
        this.physics.add.collider(this.player, this.platforms);
        // One-way collision for elevated platforms
        this.physics.add.collider(this.player, this.elevated, null, (p, plat) => p.body.velocity.y > 0 && p.y + p.height/2 < plat.y);
        
        // Hazard Collisions
        this.physics.add.collider(this.player, this.obstacles, () => this.gameOver("CRASHED"));
        this.physics.add.collider(this.player, this.movingSpikes, () => this.gameOver("IMPALED"));
        this.physics.add.overlap(this.player, this.laserWall, () => this.gameOver("INCINERATED"));
        
        // Collectibles
        this.physics.add.overlap(this.player, this.energyDrinks, (p, b) => { 
            b.destroy(); 
            this.energy = Math.min(100, this.energy + 25); 
            this.updateUI(); 
            this.audio.playCollect(); 
        });

        // Tutorial Text
        this.tutorialText = this.add.text(400, 200, "-> ARROW KEYS", { fontFamily: 'Rajdhani', fontSize: '30px', color: '#ffff00', fontStyle: 'bold' }).setOrigin(0, 0.5);

        // Server Check
        this.fetchServerScore();

        // Start Logic
        document.getElementById('start-btn').onclick = () => this.startGame();
        this.spawnGroundSegment(-1000, 5000, true); // Initial safe zone
        this.physics.pause();
    }

    startGame() {
        document.getElementById('start-screen').style.display = 'none';
        if(this.tutorialText) this.tutorialText.destroy(); // Remove tutorial

        this.isGameRunning = true;
        this.energy = 100;
        this.nextSpawnX = 0;
        this.currentLevel = 1;
        this.laserSpeed = 300; 

        // Clean EVERYTHING
        this.platforms.clear(true, true);
        this.elevated.clear(true, true);
        this.obstacles.clear(true, true);
        this.movingSpikes.clear(true, true);
        this.energyDrinks.clear(true, true);
        
        this.player.setPosition(100, 300);
        this.player.setVelocity(0, 0);
        this.laserWall.x = -500;
        
        this.spawnGroundSegment(-1000, 5000, true);
        this.physics.resume();
        this.updateUI();
        this.audio.resume();
        this.showStory("SECTOR 1", "THE ESCAPE");
    }

    update(time, delta) {
        if (!this.isGameRunning) return;

        // --- LEVEL PROGRESSION (Fix from Screenshot 454) ---
        // Every 5000m, level up
        const newLevel = Math.floor(this.player.x / 5000) + 1;
        if (newLevel > this.currentLevel) {
            this.currentLevel = newLevel;
            this.laserSpeed += 50; // Speed up laser
            this.showStory(`SECTOR ${this.currentLevel}`, "SPEED INCREASING");
        }

        // --- UNIVERSAL CLEANUP (Fix from Screenshot 460) ---
        const cleanupThreshold = this.player.x - 4000;
        [this.platforms, this.elevated, this.obstacles, this.movingSpikes, this.energyDrinks].forEach(group => {
            group.children.each(obj => {
                if (obj.x < cleanupThreshold) obj.destroy();
            });
        });

        // Safety Net
        if (this.player.y > 500) { this.player.y = 300; this.player.setVelocityY(0); }

        // Laser Pursuit
        this.laserWall.body.velocity.x = this.laserSpeed;
        if (this.laserWall.x < this.player.x - 600) this.laserWall.x = this.player.x - 600;

        // --- CONTROLS ---
        const onGround = this.player.body.touching.down || this.player.body.blocked.down;
        
        // Slide
        if (this.cursors.down.isDown && onGround && !this.isSliding) {
            this.isSliding = true;
            this.player.body.setSize(24, 30).setOffset(5, 30);
            this.audio.playSlide();
            this.tweens.add({ targets: this.player, scaleY: 0.5, scaleX: 1.3, duration: 100 });
        } else if (this.cursors.down.isUp && this.isSliding) {
            this.isSliding = false;
            this.player.body.setSize(24, 60).setOffset(5, 0);
            this.tweens.add({ targets: this.player, scaleY: 1, scaleX: 1, duration: 100 });
        }

        // Jump
        if ((Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up)) && onGround) {
            this.player.setVelocityY(-600);
            this.audio.playJump();
            this.tweens.add({ targets: this.player, scaleY: 1.3, scaleX: 0.7, duration: 150, yoyo: true });
        }

        // Run
        let playerSpeed = 350;
        if (this.shiftKey.isDown) playerSpeed = 500;
        if (this.energy < 15) playerSpeed *= 0.6; 
        
        if (this.cursors.right.isDown) this.player.setVelocityX(playerSpeed);
        else if (this.cursors.left.isDown) this.player.setVelocityX(-playerSpeed * 0.5); 
        else this.player.setVelocityX(0); 

        // Infinite Gen
        if (this.player.x > this.nextSpawnX - 4000) this.generateSector();

        // Stamina
        this.energy -= this.shiftKey.isDown ? 0.4 : 0.08;
        if (this.energy <= 0) this.gameOver("EXHAUSTED");

        this.updateUI();
    }

    generateSector() {
        const width = Phaser.Math.Between(4000, 6000);
        this.spawnGroundSegment(this.nextSpawnX - 50, width);
    }

    // --- OPTIMIZED TEXTURE GENERATION (Fix from Screenshot 459) ---
    spawnGroundSegment(x, width, safe = false) {
        // Create the standard 1000px tile if it doesn't exist
        if (!this.textures.exists('ground_tile')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0x080808); g.fillRect(0,0,1000,400); 
            g.fillStyle(0x333333); g.fillRect(0,0,1000,4); 
            g.generateTexture('ground_tile', 1000, 400);
        }

        // Calculate how many 1000px segments we need
        const segments = Math.ceil(width / 1000);
        
        for(let i = 0; i < segments; i++) {
            this.platforms.create(x + (i * 1000), 380, 'ground_tile').setOrigin(0,0).refreshBody();
        }
        
        this.nextSpawnX = x + width;
        if (safe) return;

        // Obstacle Loop
        for (let i = 400; i < width; i += Phaser.Math.Between(400, 800)) {
            const spawnX = x + i;
            const rand = Math.random();
            
            // Logic based on Difficulty (Current Level)
            if (rand < 0.2) this.createObstacle(spawnX, 'police_car', 380);
            else if (rand < 0.4) this.createObstacle(spawnX, 'drone', 340);
            else if (rand < 0.5 && this.currentLevel >= 2) this.createMovingSpike(spawnX); // Spikes only after Level 2
            else if (rand < 0.7 && this.currentLevel >= 2) {
                const w = Phaser.Math.Between(300, 500);
                this.createElevatedPlatform(spawnX, 280, w);
                if(Math.random() > 0.4) this.createEnergyDrink(spawnX + w/2, 240);
            }
            else this.createEnergyDrink(spawnX, 340);
        }
    }

    createElevatedPlatform(x, y, width) {
        const key = `platform_${width}`;
        if (!this.textures.exists(key)) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0x111111); g.fillRect(0,0,width,20);
            g.lineStyle(2, 0x444444); g.strokeRect(0,0,width,20);
            g.generateTexture(key, width, 20);
        }
        this.elevated.create(x, y, key).setOrigin(0,0).refreshBody();
    }

    createMovingSpike(x) {
        if (!this.textures.exists('spike')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0xff0000); g.fillTriangle(0, 30, 15, 0, 30, 30);
            g.generateTexture('spike', 30, 30);
        }
        const s = this.movingSpikes.create(x, 380, 'spike').setOrigin(0.5, 1);
        // Add Patrol Tween (Fix from Screenshot 458)
        this.tweens.add({ targets: s, x: x + 100, duration: 2000, yoyo: true, repeat: -1 });
    }

    createObstacle(x, key, y) {
        if (!this.textures.exists(key)) this.generateTexture(key);
        const obs = this.obstacles.create(x, y, key).setOrigin(0.5, 1).setImmovable(true);
        if(key === 'drone') this.tweens.add({ targets: obs, y: y-30, duration: 600, yoyo: true, repeat: -1 });
    }

    createEnergyDrink(x, y) {
        if (!this.textures.exists('energy_drink')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0x00ff00); g.fillRect(0, 0, 15, 30);
            g.generateTexture('energy_drink', 15, 30);
        }
        this.energyDrinks.create(x, y, 'energy_drink').setOrigin(0.5, 1);
    }

    generateTexture(key) {
        const g = this.make.graphics({x:0, y:0, add:false});
        if(key === 'police_car') {
            g.fillStyle(0x000000); g.fillRect(0, 20, 60, 20); 
            g.fillStyle(0xff0000); g.fillRect(15, 0, 30, 10);
            g.generateTexture(key, 60, 40);
        } else if (key === 'drone') {
            g.fillStyle(0x222222); g.fillCircle(15, 15, 15);
            g.fillStyle(0xff0000); g.fillCircle(15, 15, 5);
            g.generateTexture(key, 30, 30);
        }
    }

    createAssets() {
        const g = this.make.graphics({x:0, y:0, add:false});
        g.fillStyle(0xffffff); g.fillRect(0, 0, 30, 60);
        g.generateTexture('human', 30, 60);
    }

    createSkyline() {
        for(let i=0; i<30; i++) {
            const w = Phaser.Math.Between(80, 150);
            const h = Phaser.Math.Between(200, 500);
            const key = `b_${i}`;
            if(!this.textures.exists(key)){
                const g = this.make.graphics({x:0, y:0, add:false});
                g.fillStyle(0x0a0a0a); g.fillRect(0,0,w,h);
                g.generateTexture(key, w, h);
            }
            this.add.image(i * 100, 600, key).setOrigin(0.5, 1).setScrollFactor(0.1).setDepth(-10);
        }
    }

    updateUI() {
        const dist = Math.floor(this.player.x / 10);
        document.getElementById('score').innerText = dist + "m";
        document.getElementById('stamina-value').innerText = Math.floor(this.energy); 
        document.getElementById('energy-fill').style.width = this.energy + "%";
    }

    showStory(title, sub) {
        const t = document.getElementById('story-title'); const s = document.getElementById('story-sub');
        if(t && s) { t.innerText = title; s.innerText = sub; t.style.opacity = 1; s.style.opacity = 1; setTimeout(() => { t.style.opacity = 0; s.style.opacity = 0; }, 4000); }
    }

    // --- PYTHON CONNECTION (Robust Error Handling) ---
    fetchServerScore() {
        fetch('http://127.0.0.1:5000/get_best')
            .then(res => res.json())
            .then(data => document.getElementById('high-score').innerText = data.high_score + "m")
            .catch(err => console.log("Server Offline - Playing Local Mode"));
    }

    sendToPython(score) {
        fetch('http://127.0.0.1:5000/submit_run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: score })
        })
        .then(res => res.json())
        .then(data => {
            document.getElementById('high-score').innerText = data.high_score + "m";
            document.getElementById('sub-text').innerText = data.message;
        })
        .catch(err => console.log("Server Offline - Cannot Save Score"));
    }

    gameOver(reason) {
        this.isGameRunning = false;
        this.physics.pause();
        this.audio.playDeath();
        this.sendToPython(Math.floor(this.player.x / 10));
        document.getElementById('start-screen').style.display = 'flex';
        document.getElementById('title-text').innerText = reason;
        document.getElementById('start-btn').innerText = "RETRY";
    }
}

const config = {
    type: Phaser.AUTO, width: 1200, height: 600, 
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, 
    parent: 'game-container', backgroundColor: '#000000',
    physics: { default: 'arcade', arcade: { gravity: { y: 1600 }, debug: false } },
    scene: [MainScene]
};
const game = new Phaser.Game(config);