export class SoundManager {
  private context: AudioContext | null = null
  private enabled = true

  start() {
    if (!this.context) this.context = new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
  }

  playOpen() {
    this.tone(220, 0.08, 'sine', 0.045)
    this.tone(440, 0.16, 'sine', 0.025, 0.04)
  }

  playConnect() {
    this.tone(180, 0.18, 'triangle', 0.035)
    this.tone(360, 0.28, 'sine', 0.018, 0.08)
  }

  playClose() {
    this.tone(420, 0.2, 'sine', 0.035, 0, true)
    this.tone(210, 0.28, 'triangle', 0.025, 0.04, true)
  }

  playExpand(amount: number) {
    if (amount < 0.08) return
    this.tone(160 + amount * 180, 0.06, 'sine', 0.012)
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0, reverse = false) {
    if (!this.enabled || !this.context) return
    const start = this.context.currentTime + delay
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(reverse ? frequency * 1.4 : frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, reverse ? frequency * 0.6 : frequency * 1.08), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(this.context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }
}
