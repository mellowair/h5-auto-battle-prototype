export const musicTracks = [
  { id: "leaving-home", name: "Leaving Home · Yo La Tengo", src: "assets/audio/leaving-home.mp3" },
  { id: "part-of-a-whole", name: "Part of a Whole · The Toxic Avenger", src: "assets/audio/part-of-a-whole.mp3" },
];

export function createMusicController(tracks = musicTracks, AudioClass = globalThis.Audio, onChange = () => {}) {
  const playable = tracks.filter((track) => typeof track.src === "string" && track.src.trim());
  let index = 0;
  let audio = null;
  let playing = false;
  let revision = 0;
  const notify = () => onChange({ tracks: playable, index, playing, available: playable.length > 0 });
  const player = () => {
    if (!playable.length || !AudioClass) return null;
    if (!audio) {
      audio = new AudioClass();
      audio.loop = true;
      audio.addEventListener?.("pause", () => { playing = false; notify(); });
      audio.addEventListener?.("play", () => { playing = true; notify(); });
      audio.src = playable[index].src;
    }
    return audio;
  };
  async function play() {
    const instance = player();
    if (!instance) { notify(); return false; }
    const attempt = ++revision;
    try {
      await instance.play();
      if (attempt !== revision) return false;
      playing = !instance.paused;
      notify();
      return playing;
    } catch {
      if (attempt !== revision) return false;
      playing = false;
      notify();
      return false;
    }
  }
  function pause() {
    revision += 1;
    if (audio) audio.pause();
    playing = false;
    notify();
  }
  async function select(nextIndex) {
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= playable.length) return false;
    const wasPlaying = playing;
    revision += 1;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    index = nextIndex;
    if (audio) audio.src = playable[index].src;
    if (wasPlaying) return play();
    notify();
    return true;
  }
  notify();
  return { play, pause, select, getState: () => ({ tracks: playable, index, playing, available: playable.length > 0 }) };
}
