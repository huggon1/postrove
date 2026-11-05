// Local fixture controller. Timers simulate resource preparation.
export function createSpeechInstaller({ resources, componentReady, ready, changed, schedule = setTimeout, unschedule = clearTimeout }) {
  let phase = 'idle', progress = 0, issue = '', timer, generation = 0, scenario = 'success';
  const active = () => ['preparing', 'downloading', 'verifying'].includes(phase);
  const snapshot = () => {
    const saved = resources();
    return { ...saved, phase: active() || phase === 'error' || phase === 'cancelled' ? phase : saved.runtime && saved.model ? 'ready' : 'idle', progress, issue, active: active() };
  };
  const emit = () => changed(snapshot());
  const later = (callback, delay) => {
    const current = generation;
    timer = schedule(() => { if (current === generation) callback(); }, delay);
  };
  const fail = code => { phase = 'error'; issue = code; emit(); };
  const finish = () => { phase = 'ready'; ready(); emit(); };
  function verify() {
    phase = 'verifying'; emit();
    later(() => {
      if (scenario === 'checksum') { fail('checksum'); return; }
      finish();
    }, 900);
  }
  function download() {
    if (resources().model) { finish(); return; }
    phase = 'downloading'; emit();
    const tick = () => {
      progress = Math.min(100, progress + 10);
      if (scenario === 'network' && progress >= 40) { fail('network'); return; }
      if (progress === 100) { verify(); return; }
      emit(); later(tick, 450);
    };
    later(tick, 450);
  }
  function start(nextScenario = 'success') {
    if (active() || resources().runtime && resources().model) return;
    unschedule(timer); generation += 1;
    progress = 0; issue = ''; scenario = nextScenario;
    if (resources().runtime) { download(); return; }
    phase = 'preparing'; emit();
    later(() => { componentReady(); download(); }, 800);
  }
  function cancel() {
    if (!active()) return;
    unschedule(timer); generation += 1;
    phase = 'cancelled'; progress = 0; issue = ''; emit();
  }
  function reset() {
    unschedule(timer); generation += 1;
    phase = 'idle'; progress = 0; issue = '';
  }
  return { snapshot, start, retry: () => start('success'), cancel, reset };
}
