/* ===================== AUDIO ===================== */
class AudioController {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
    }
    resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

    playJump() {
        this.resume();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.frequency.setValueAtTime(200, this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.2, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        o.connect(g); g.connect(this.master);
        o.start(); o.stop(this.ctx.currentTime + 0.2);
    }

    playDeath() {
        this.resume();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(300, this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.4);
        g.gain.setValueAtTime(0.4, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
        o.connect(g); g.connect(this.master);
        o.start(); o.stop(this.ctx.currentTime + 0.4);
    }
}

/* ===================== GAME SCENE ===================== */
class MainScene extends Phaser.Scene {
    constructor() { super('MainScene'); }

    create() {
        this.audio = new AudioController();

        this.GROUND_Y = 380;
        this.BASE_SPEED = 320;

        this.isRunning = false;
        this.energy = 100;
        this.maxSpeedSeen = 0;

        this.platforms = this.physics.add.group({ allowGravity:false, immovable:true });

        this.createPlayerAsset();

        this.player = this.physics.add.sprite(100, 300, 'human');
        this.player.setDepth(5);
        this.player.body.setSize(20, 60);

        this.physics.add.collider(this.player, this.platforms);

        this.cursors = this.input.keyboard.createCursorKeys();

        this.nextSpawnX = 0;
        this.spawnGround(0, 2000);

        this.physics.pause();

        document.getElementById("start-btn").onclick = () => this.startGame();
    }

    startGame() {
        document.getElementById("start-screen").style.display = "none";

        this.isRunning = true;
        this.energy = 100;
        this.maxSpeedSeen = 0;
        this.runStartTime = this.time.now;

        this.player.setPosition(100, 300);
        this.player.setVelocity(0, 0);

        this.nextSpawnX = 0;
        this.platforms.clear(true, true);
        this.spawnGround(0, 2000);

        this.physics.resume();
        this.audio.resume();
    }

    update(time, delta) {
        if (!this.isRunning) return;

        /* ---- FORCE FORWARD MOTION ---- */
        this.player.body.velocity.x = this.BASE_SPEED;
        this.maxSpeedSeen = Math.max(this.maxSpeedSeen, this.BASE_SPEED);

        /* ---- JUMP ---- */
        if ((this.cursors.up.isDown || this.cursors.space.isDown) && this.player.body.touching.down) {
            this.player.setVelocityY(-600);
            this.audio.playJump();
        }

        /* ---- DISTANCE (TIME BASED) ---- */
        this.distance = Math.floor((time - this.runStartTime) * 0.05);
        document.getElementById("score").innerText = this.distance + "m";

        /* ---- ENERGY ---- */
        this.energy -= 0.05;
        document.getElementById("stamina-value").innerText = Math.floor(this.energy);
        document.getElementById("energy-fill").style.width = this.energy + "%";
        if (this.energy <= 0) this.gameOver("EXHAUSTED");

        /* ---- PLATFORM SPAWN ---- */
        if (this.player.x > this.nextSpawnX - 800) {
            this.spawnGround(this.nextSpawnX, 1500);
        }

        /* ---- CLEANUP ---- */
        const cleanupX = this.player.x - 2000;
        this.platforms.children.each(p => {
            if (p.x + p.width < cleanupX) p.destroy();
        });
    }

    spawnGround(x, width) {
        if (!this.textures.exists('ground')) {
            const g = this.make.graphics({ x:0, y:0, add:false });
            g.fillStyle(0x111111);
            g.fillRect(0, 0, 400, 40);
            g.generateTexture('ground', 400, 40);
        }

        for (let i = 0; i < width; i += 400) {
            this.platforms.create(x + i, this.GROUND_Y, 'ground').setOrigin(0, 0);
        }

        this.nextSpawnX = x + width;
    }

    /* ===================== BACKEND ===================== */
    submitRun() {
        const payload = {
            distance: this.distance,
            duration: Math.floor((this.time.now - this.runStartTime) / 1000),
            stamina_collected: Math.floor(100 - this.energy),
            max_speed: this.maxSpeedSeen,
            identity_dropped: true
        };

        fetch("http://127.0.0.1:5000/submit_run", {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body:JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(d => console.log("SERVER:", d))
        .catch(e => console.error("SERVER ERROR:", e));
    }

    gameOver(reason) {
        this.isRunning = false;
        this.physics.pause();
        this.audio.playDeath();
        this.submitRun();

        document.getElementById("start-screen").style.display = "flex";
        document.getElementById("title-text").innerText = reason;
        document.getElementById("start-btn").innerText = "RETRY";
    }

    createPlayerAsset() {
        const g = this.make.graphics({ x:0, y:0, add:false });
        g.fillStyle(0xffffff);
        g.fillRect(14, 0, 6, 60);
        g.fillRect(8, 60, 18, 6);
        g.generateTexture('human', 34, 66);
    }
}

/* ===================== CONFIG ===================== */
new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 450,
    parent: "game-container",
    backgroundColor: "#000",
    physics: {
        default: "arcade",
        arcade: { gravity: { y: 1600 }, debug:false }
    },
    scene: [MainScene]
});
