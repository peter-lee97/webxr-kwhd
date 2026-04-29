const discoveredAudioAssets = import.meta.glob('../assets/audio/*.{mp3,ogg,wav,m4a}', {
    eager: true,
    import: 'default'
});

function sortAssetsByName(assets) {
    return assets.sort((a, b) => a.name.localeCompare(b.name));
}

function classifyAudioAssets() {
    const entries = Object.entries(discoveredAudioAssets).map(([path, url]) => {
        const name = path.split('/').pop() || '';
        return { path, name, url };
    });

    const sorted = sortAssetsByName(entries);
    const bgTracks = sorted.filter(item => item.name.startsWith('bg-')).map(item => item.url);
    const meowTracks = sorted.filter(item => item.name.startsWith('meow-')).map(item => item.url);
    const purrTracks = sorted.filter(item => item.name.startsWith('purr-')).map(item => item.url);

    return { bgTracks, meowTracks, purrTracks };
}

export class AudioManager {
    constructor(onStateChange = () => {}) {
        const { bgTracks, meowTracks, purrTracks } = classifyAudioAssets();

        this.bgTracks = bgTracks;
        this.meowTracks = meowTracks;
        this.purrTracks = purrTracks;

        this.bgPlayer = new Audio();
        this.bgPlayer.preload = 'auto';
        this.bgPlayer.loop = false;

        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.baseVolume = 0.05;
        this.isMuted = false;
        this.status = 'Ready';
        this.lastError = '';
        this.onStateChange = onStateChange;

        this.toggleButton = null;
        this.statusLabel = null;

        this.bgPlayer.addEventListener('ended', () => {
            this.playNextTrack();
        });

        this.bgPlayer.addEventListener('error', () => {
            this.lastError = 'Failed to load current audio track.';
            this.status = this.lastError;
            this.isPlaying = false;
            this.syncUi();
            this.emitState();
        });

        if (!this.bgTracks.length) {
            this.status = 'No bg-* track found in src/assets/audio/';
        }
    }

    attachControls({ toggleButton, statusLabel }) {
        this.toggleButton = toggleButton;
        this.statusLabel = statusLabel;

        if (this.toggleButton) {
            this.toggleButton.addEventListener('click', () => this.toggleMute());
        }

        this.syncUi();
        this.emitState();
    }

    applyVolume() {
        this.bgPlayer.volume = this.isMuted ? 0 : this.baseVolume;
    }

    preloadFirstTrack() {
        if (!this.bgTracks.length) return;
        this.bgPlayer.src = this.bgTracks[this.currentTrackIndex];
        this.bgPlayer.load();
    }

    async tryAutoplayOnLoad() {
        if (!this.bgTracks.length) {
            this.status = 'Add bg-* audio files to src/assets/audio/';
            this.syncUi();
            this.emitState();
            return;
        }

        this.preloadFirstTrack();
        await this.playCurrentTrack();
    }

    async playCurrentTrack() {
        const trackUrl = this.bgTracks[this.currentTrackIndex];
        if (!trackUrl) {
            this.isPlaying = false;
            this.status = 'No background track available';
            this.syncUi();
            this.emitState();
            return;
        }

        this.bgPlayer.src = trackUrl;
        this.applyVolume();

        try {
            await this.bgPlayer.play();
            this.isPlaying = true;
            this.status = this.isMuted ? 'Playing (muted)' : 'Playing';
        } catch (error) {
            this.isPlaying = false;
            this.status = 'Autoplay blocked; tap speaker icon';
            this.lastError = String(error?.message || error);
        }

        this.syncUi();
        this.emitState();
    }

    async playNextTrack() {
        if (!this.bgTracks.length) return;
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.bgTracks.length;
        await this.playCurrentTrack();
    }

    async toggleMute() {
        if (!this.bgTracks.length) {
            this.status = 'No tracks loaded';
            this.syncUi();
            this.emitState();
            return;
        }

        if (!this.isPlaying) {
            await this.playCurrentTrack();
            if (!this.isPlaying) return;
        }

        this.isMuted = !this.isMuted;
        this.applyVolume();
        this.status = this.isMuted ? 'Playing (muted)' : 'Playing';
        this.syncUi();
        this.emitState();
    }

    playSfx(kind) {
        if (this.isMuted) return;
        const pool = kind === 'purr' ? this.purrTracks : this.meowTracks;
        if (!pool.length) return;

        const index = Math.floor(Math.random() * pool.length);
        const sfx = new Audio(pool[index]);
        sfx.volume = Math.min(1, this.baseVolume + 0.2);
        sfx.play().catch(() => {
            this.status = `Unable to play ${kind} SFX`;
            this.syncUi();
            this.emitState();
        });
    }

    getCurrentTrackName() {
        if (!this.bgTracks.length) return 'none';
        const url = this.bgTracks[this.currentTrackIndex];
        return url.split('/').pop() || 'unknown';
    }

    getState() {
        return {
            isPlaying: this.isPlaying,
            isMuted: this.isMuted,
            status: this.status,
            trackName: this.getCurrentTrackName()
        };
    }

    syncUi() {
        if (this.toggleButton) {
            this.toggleButton.dataset.muted = this.isMuted ? 'true' : 'false';
            this.toggleButton.setAttribute('aria-label', this.isMuted ? 'Unmute audio' : 'Mute audio');
        }

        if (this.statusLabel) {
            this.statusLabel.textContent = this.status;
        }
    }

    emitState() {
        this.onStateChange(this.getState());
    }
}
