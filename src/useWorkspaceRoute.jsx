import { useEffect, useRef, useState } from 'react';
import { readWorkspaceRoute, workspaceRouteUrl } from './workspace-route.mjs';

export default function useWorkspaceRoute(options, guard) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [route, setRoute] = useState(() => readWorkspaceRoute(window.location.href, options));
  const entry = useRef({ index: window.history.state?.heysoIndex ?? 0 });
  const restoring = useRef(null);
  const first = useRef(true);
  const read = () => readWorkspaceRoute(window.location.href, optionsRef.current);

  useEffect(() => {
    const target = workspaceRouteUrl(window.location.href, route);
    const replace = first.current;
    first.current = false;
    if (replace || target.href !== window.location.href) {
      if (!replace) entry.current.index += 1;
      window.history[replace ? 'replaceState' : 'pushState'](
        { ...window.history.state, heysoIndex: entry.current.index }, '', target);
    }
  }, [route]);

  useEffect(() => {
    const onPop = (event) => {
      if (restoring.current) {
        const resume = restoring.current;
        restoring.current = null;
        resume();
        return;
      }
      const targetIndex = event.state?.heysoIndex ?? 0;
      const delta = entry.current.index - targetIndex;
      if (guard.current?.blocked() && delta) {
        // Restore the current entry before showing the existing unsaved-settings dialog.
        restoring.current = () => guard.current.request(() => window.history.go(-delta));
        window.history.go(delta);
        return;
      }
      entry.current.index = targetIndex;
      setRoute(read());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setter = (key) => (value) => setRoute(previous => {
    const next = typeof value === 'function' ? value(previous[key]) : value;
    return previous[key] === next ? previous : { ...previous, [key]: next };
  });
  return { ...route, setPage: setter('page'), setProjectId: setter('projectId'), setView: setter('view'),
    setSettingsSection: setter('settingsSection'), setSelected: setter('selected'), setTab: setter('tab') };
}
