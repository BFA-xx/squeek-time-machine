"use client";
import { useWorld, type Quality } from "@/lib/store";
import { audio } from "@/lib/audio";
import { Heading } from "../panels/ui";

export function SettingsPanel() {
  const { settings, setSettings } = useWorld();
  return (
    <div>
      <Heading eyebrow="Settings" title="Set up your visit" />
      <div className="space-y-5">
        <fieldset>
          <legend className="label mb-1">Graphics quality</legend>
          <div className="flex flex-wrap gap-1">
            {(["auto", "low", "medium", "high"] as Quality[]).map((q) => <button key={q} aria-pressed={settings.quality === q} className={`btn capitalize ${settings.quality === q ? "border-gold text-gold" : ""}`} onClick={() => setSettings({ quality: q })}>{q}</button>)}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-sm"><span>Reduced motion<span className="block text-xs text-gray">Skips the intro and camera moves</span></span><input type="checkbox" checked={settings.reducedMotion} onChange={(e) => setSettings({ reducedMotion: e.target.checked })} /></label>
        <label className="flex items-center justify-between gap-3 text-sm"><span>Sound<span className="block text-xs text-gray">Generated in your browser. Off until you turn it on.</span></span><input type="checkbox" checked={settings.sound} onChange={(e) => { setSettings({ sound: e.target.checked }); if (e.target.checked) audio.enable(settings.volume); else audio.disable(); }} /></label>
        <label className="block text-sm"><span>Volume</span><input className="w-full mt-1 accent-[#f2c230]" type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => { const volume = Number(e.target.value); setSettings({ volume }); if (settings.sound) audio.setVolume(volume); }} /></label>
        <label className="flex items-center justify-between gap-3 text-sm"><span>Click or tap the floor to walk</span><input type="checkbox" checked={settings.clickToMove} onChange={(e) => setSettings({ clickToMove: e.target.checked })} /></label>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>Toggle fullscreen</button>
          <button className="btn" onClick={() => setSettings({ introSeen: false })}>Replay the walkthrough</button>
          <a className="btn" href="/archive">Open the 2D archive</a>
        </div>
      </div>
    </div>
  );
}
