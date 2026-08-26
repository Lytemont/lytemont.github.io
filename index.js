const MIN_PLAYERS = 2;
const CHOOSE_DELAY_MS = 3000;
const RESET_DELAY_MS = 2000;

// DOM Elements
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const instructionCard = document.getElementById("instruction-card");
const description = document.getElementById("description");
const ariaLive = document.getElementById("live-region");
const version = document.getElementById("version");
const updateAvailable = document.getElementById("update-available");
const teamModeToggle = document.getElementById("team-mode-toggle");
const teamCountLabel = document.getElementById("team-count-label");
const teamCountSpan = document.getElementById("team-count");
const teamMinusBtn = document.getElementById("team-minus");
const teamPlusBtn = document.getElementById("team-plus");

// State
const players = new Map();
let chosenPlayerId = undefined;
const chosenAnimation = {
	startTime: 0,
	startRadius: 0,
};

let teamMode = false;
let teamCount = 2;
const teams = new Map();
let teamsAssigned = false;
let dpr = window.devicePixelRatio || 1;

// Sound Effects Synthesizer (Web Audio API)
class SoundFX {
	constructor() {
		this.ctx = null;
	}

	init() {
		if (!this.ctx) {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (AudioContext) {
				this.ctx = new AudioContext();
			}
		}
		if (this.ctx && this.ctx.state === "suspended") {
			this.ctx.resume();
		}
	}

	touch() {
		this.init();
		if (!this.ctx) return;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(320, this.ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(560, this.ctx.currentTime + 0.08);
		gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
		osc.connect(gain);
		gain.connect(this.ctx.destination);
		osc.start();
		osc.stop(this.ctx.currentTime + 0.08);
	}

	win() {
		this.init();
		if (!this.ctx) return;
		const now = this.ctx.currentTime;
		const chords = [523.25, 659.25, 783.99, 1046.5];
		chords.forEach((freq, idx) => {
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();
			osc.type = "triangle";
			osc.frequency.setValueAtTime(freq, now + idx * 0.04);
			gain.gain.setValueAtTime(0.25, now + idx * 0.04);
			gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.6);
			osc.connect(gain);
			gain.connect(this.ctx.destination);
			osc.start(now + idx * 0.04);
			osc.stop(now + idx * 0.04 + 0.6);
		});
	}

	team() {
		this.init();
		if (!this.ctx) return;
		const now = this.ctx.currentTime;
		[440, 880].forEach((freq, idx) => {
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(freq, now + idx * 0.08);
			gain.gain.setValueAtTime(0.2, now + idx * 0.08);
			gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
			osc.connect(gain);
			gain.connect(this.ctx.destination);
			osc.start(now + idx * 0.08);
			osc.stop(now + idx * 0.08 + 0.3);
		});
	}
}

const sfx = new SoundFX();

// Accessibility Logging
const ariaLiveLog = (msg) => {
	const el = document.createElement("div");
	el.textContent = msg;
	ariaLive.append(el);
};

const ariaLiveReset = () => {
	ariaLive.innerHTML = "";
	ariaLiveLog("Reset");
};

// Canvas Resolution Handling
const resizeCanvas = () => {
	dpr = window.devicePixelRatio || 1;
	canvas.width = Math.floor(window.innerWidth * dpr);
	canvas.height = Math.floor(window.innerHeight * dpr);
	draw();
};
window.addEventListener("resize", resizeCanvas);

// Color Palettes
const getIndividualColor = (index, alpha = 1) =>
	`hsla(${(index * 137.5 + 340) % 360}, 95%, 58%, ${alpha})`;

const teamPalette = [
	{ hue: 345, hex: "#ff2a6d" },
	{ hue: 195, hex: "#05d9e8" },
	{ hue: 145, hex: "#00ff87" },
	{ hue: 45,  hex: "#ffb800" },
	{ hue: 275, hex: "#b537f2" },
	{ hue: 25,  hex: "#ff6c00" },
	{ hue: 170, hex: "#00f0b5" },
	{ hue: 315, hex: "#ff00a0" },
];

const getTeamColor = (teamIndex, alpha = 1) => {
	const col = teamPalette[teamIndex % teamPalette.length];
	return `hsla(${col.hue}, 100%, 55%, ${alpha})`;
};

const pickUnusedColor = () => {
	const used = Array.from(players.values()).map((p) => p.color);
	let c = 0;
	while (used.includes(c)) c++;
	return c;
};

const easeOutQuint = (t) => 1 + --t * t * t * t * t;

// Render Functions
const drawPlayerGlow = (x, y, radius, color, alpha = 0.4) => {
	const grad = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 2);
	grad.addColorStop(0, color.replace(/[\d.]+\)$/, `${alpha})`));
	grad.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.arc(x, y, radius * 2, 0, 2 * Math.PI);
	ctx.fill();
};

const drawPlayer = (player) => {
	const px = player.x * dpr;
	const py = player.y * dpr;
	const isNeutral = teamMode && !teamsAssigned;
	const mainColor = isNeutral
		? "hsla(220, 20%, 65%, 1)"
		: teamMode
		? getTeamColor(player.color, 1)
		: getIndividualColor(player.color, 1);

	drawPlayerGlow(px, py, 60 * dpr, mainColor, 0.45);

	const now = Date.now();
	const pulse = (Math.sin((now - player.spawnTime) / 200) + 1) / 2;
	const outerRadius = (52 + pulse * 6) * dpr;

	// Outer Ring
	ctx.beginPath();
	ctx.strokeStyle = mainColor;
	ctx.lineWidth = 4 * dpr;
	ctx.arc(px, py, outerRadius, 0, 2 * Math.PI);
	ctx.stroke();

	// Solid Inner Disc (No dots or text)
	ctx.beginPath();
	ctx.fillStyle = mainColor;
	ctx.arc(px, py, 38 * dpr, 0, 2 * Math.PI);
	ctx.fill();
};

const draw = (() => {
	const renderLoop = () => {
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		if (chosenPlayerId !== undefined) {
			instructionCard.classList.add("hidden");
			const player = players.get(chosenPlayerId);

			if (player) {
				const { startTime, startRadius } = chosenAnimation;
				const endRadius = 100 * dpr;
				const elapsed = Date.now() - startTime;
				const duration = RESET_DELAY_MS;
				const t = Math.min(1, elapsed / duration);
				const currentRadius = startRadius - (startRadius - endRadius) * easeOutQuint(t);

				const px = player.x * dpr;
				const py = player.y * dpr;
				const winColor = teamMode
					? getTeamColor(player.color, 1)
					: getIndividualColor(player.color, 1);

				ctx.beginPath();
				ctx.fillStyle = winColor;
				ctx.rect(0, 0, canvas.width, canvas.height);
				ctx.arc(px, py, Math.max(0, currentRadius), 0, 2 * Math.PI);
				ctx.fill("evenodd");

				drawPlayer(player);

				return t < 1;
			}
			return false;
		} else if (players.size > 0) {
			instructionCard.classList.add("hidden");
			for (const player of players.values()) {
				drawPlayer(player);
			}
			return true;
		} else {
			instructionCard.classList.remove("hidden");
			return false;
		}
	};

	let animFrame = null;
	const run = () => {
		if (renderLoop()) {
			animFrame = window.requestAnimationFrame(run);
		} else {
			animFrame = null;
		}
	};

	return () => {
		if (!animFrame) {
			animFrame = window.requestAnimationFrame(run);
		}
	};
})();

// Touch Interaction Handlers
const addPlayer = (id, x, y) => {
	sfx.touch();
	if (navigator.vibrate) navigator.vibrate(30);

	const player = {
		x,
		y,
		color: teamMode ? 0 : pickUnusedColor(),
		spawnTime: Date.now(),
	};
	players.set(id, player);
	draw();
	ariaLiveLog(`Finger added. Total: ${players.size}`);
};

const updatePlayer = (id, x, y) => {
	const player = players.get(id);
	if (player) {
		player.x = x;
		player.y = y;
		draw();
	}
};

const removePlayer = (id) => {
	players.delete(id);
	draw();
	ariaLiveLog(`Finger removed. Remaining: ${players.size}`);
};

const assignTeamsToPlayers = () => {
	const playerIds = Array.from(players.keys());
	const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

	teams.clear();
	for (let i = 0; i < teamCount; i++) {
		teams.set(i, []);
	}

	shuffled.forEach((playerId, index) => {
		const teamIndex = index % teamCount;
		const player = players.get(playerId);
		if (player) {
			player.team = teamIndex;
			player.color = teamIndex;
			teams.get(teamIndex).push(playerId);
		}
	});

	teamsAssigned = true;
	sfx.team();
	if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
	draw();

	for (let i = 0; i < teamCount; i++) {
		const count = teams.get(i).length;
		if (count > 0) {
			ariaLiveLog(`Team ${i + 1}: ${count} players`);
		}
	}
};

const choosePlayer = (() => {
	const pick = () => {
		if (players.size < MIN_PLAYERS) return;

		if (teamMode) {
			assignTeamsToPlayers();
			return;
		}

		const keys = Array.from(players.keys());
		const chosen = keys[Math.floor(Math.random() * keys.length)];
		chosenPlayerId = chosen;

		const player = players.get(chosenPlayerId);
		chosenAnimation.startTime = Date.now();
		const px = player.x * dpr;
		const py = player.y * dpr;

		chosenAnimation.startRadius = Math.hypot(
			Math.max(px, canvas.width - px),
			Math.max(py, canvas.height - py)
		);

		sfx.win();
		if (navigator.vibrate) navigator.vibrate([100, 50, 200]);

		draw();
		ariaLiveLog(`Winner selected!`);
	};

	let timeout;
	return () => {
		window.clearTimeout(timeout);
		if (chosenPlayerId === undefined && !teamsAssigned && players.size >= MIN_PLAYERS) {
			timeout = window.setTimeout(pick, CHOOSE_DELAY_MS);
		}
	};
})();

const reset = (() => {
	const doReset = () => {
		chosenPlayerId = undefined;
		teamsAssigned = false;
		players.clear();
		teams.clear();
		ariaLiveReset();
		draw();
	};

	let timeout;
	return () => {
		window.clearTimeout(timeout);
		timeout = window.setTimeout(doReset, RESET_DELAY_MS);
	};
})();

// Pointer Events
document.addEventListener("pointerdown", (e) => {
	if (e.target.closest("#controls")) return;
	addPlayer(e.pointerId, e.clientX, e.clientY);
	choosePlayer();
});

document.addEventListener("pointermove", (e) => {
	updatePlayer(e.pointerId, e.clientX, e.clientY);
});

const onPointerRemove = (e) => {
	if (chosenPlayerId === e.pointerId || (teamMode && teamsAssigned)) {
		reset();
	} else {
		removePlayer(e.pointerId);
		choosePlayer();
	}
};

document.addEventListener("pointerup", onPointerRemove);
document.addEventListener("pointercancel", onPointerRemove);

// Gesture prevention
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());

// UI Controls
const updateTeamModeUI = () => {
	if (teamMode) {
		teamModeToggle.classList.add("active");
		teamCountLabel.classList.add("visible");
		description.textContent = `Hold fingers down to divide into ${teamCount} teams.`;
	} else {
		teamModeToggle.classList.remove("active");
		teamCountLabel.classList.remove("visible");
		description.textContent = `Place your fingers on the screen to choose a winner.`;
	}
};

const updateTeamCount = () => {
	teamCountSpan.textContent = teamCount;
	teamMinusBtn.disabled = teamCount <= 2;
	teamPlusBtn.disabled = teamCount >= 8;
	if (teamMode) {
		description.textContent = `Hold fingers down to divide into ${teamCount} teams.`;
	}
};

teamModeToggle.addEventListener("click", () => {
	teamMode = !teamMode;
	updateTeamModeUI();
	reset();
});

teamMinusBtn.addEventListener("click", () => {
	if (teamCount > 2) {
		teamCount--;
		updateTeamCount();
	}
});

teamPlusBtn.addEventListener("click", () => {
	if (teamCount < 8) {
		teamCount++;
		updateTeamCount();
	}
});

// Initial Boot
resizeCanvas();
updateTeamModeUI();
updateTeamCount();
