"use client";
import * as React from "react";

/**
 * Browser-Runtime für Custom-Module.
 *
 * Module sind Plain-JS-Bundles, die als <script>-Tag in die Live-View
 * injiziert werden. Beim Laden rufen sie `window.MagicFrame.registerWidget({...})`
 * auf und werden in der globalen Registry abgelegt. Der CustomWidget-Wrapper
 * findet das Modul über die `type` und ruft seine `render`-Funktion.
 *
 * Modul-Author bekommt ein kleines API-Object (`ctx`) übergeben, das nur
 * bewusst exponierte React-Primitives enthält — kein direkter React-Import
 * im Modul nötig.
 */

export type ModuleCtx = {
  // React-Primitives für JSX-loses Schreiben (oder via h-Function vom esbuild-Helper)
  createElement: typeof React.createElement;
  Fragment: typeof React.Fragment;
  useState: typeof React.useState;
  useEffect: typeof React.useEffect;
  useRef: typeof React.useRef;
  useMemo: typeof React.useMemo;
  useCallback: typeof React.useCallback;
  // Convenience: gibt das geparste config-Objekt zurück (passthrough)
  config: Record<string, any>;
  dashboardId?: string;
  /** True in the inspector. Optional so existing module contexts stay compatible. */
  preview?: boolean;
  // Helper für API-Calls aus dem Modul
  fetch: typeof fetch;
};

export type RegisteredModule = {
  type: string;
  /** Liefert React-Element. Wird mit (ctx) gecalled. */
  render: (ctx: ModuleCtx) => React.ReactNode;
  /** Optional eigener Cleanup (rein informativ — React-Hooks sollten Cleanup machen). */
  dispose?: () => void;
};

declare global {
  interface Window {
    MagicFrame?: {
      registerWidget: (mod: RegisteredModule) => void;
      version: string;
      _modules?: Map<string, RegisteredModule>;
      _loadCallbacks?: Map<string, Array<() => void>>;
    };
  }
}

/**
 * Initialisiert die globale Registry. Idempotent — kann mehrfach gecalled werden.
 */
export function ensureRuntime(): NonNullable<Window["MagicFrame"]> {
  if (typeof window === "undefined") {
    throw new Error("ensureRuntime() only callable in browser");
  }
  if (!window.MagicFrame) {
    const modules = new Map<string, RegisteredModule>();
    const cbs = new Map<string, Array<() => void>>();
    window.MagicFrame = {
      version: "1.0",
      _modules: modules,
      _loadCallbacks: cbs,
      registerWidget(mod: RegisteredModule) {
        if (!mod || typeof mod.type !== "string" || typeof mod.render !== "function") {
          console.warn("[MagicFrame] registerWidget(): ungültiges Modul-Objekt", mod);
          return;
        }
        modules.set(mod.type, mod);
        const list = cbs.get(mod.type);
        if (list) {
          list.forEach((cb) => {
            try {
              cb();
            } catch {}
          });
          cbs.delete(mod.type);
        }
      },
    };
  }
  return window.MagicFrame;
}

/** Loads each type once per page; concurrent tiles share the same request. */
const loadedBundles = new Set<string>();
const loadingBundles = new Map<string, Promise<void>>();

export function loadModuleBundle(type: string): Promise<void> {
  const rt = ensureRuntime();
  if (loadedBundles.has(type)) return Promise.resolve();
  const inFlight = loadingBundles.get(type);
  if (inFlight) return inFlight;
  const p = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    let finished = false;
    let registrationTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(downloadTimer);
      clearTimeout(registrationTimer);
      script.onload = script.onerror = null;
      const callbacks = rt._loadCallbacks!.get(type)?.filter((cb) => cb !== registered);
      if (callbacks?.length) rt._loadCallbacks!.set(type, callbacks);
      else rt._loadCallbacks!.delete(type);
      if (error) {
        script.remove();
        reject(error);
      } else {
        loadedBundles.add(type);
        resolve();
      }
    };
    const registered = () => finish();
    const downloadTimer = setTimeout(
      () => finish(new Error(`Timeout: Custom-Modul ${type} konnte nicht geladen werden.`)),
      15000,
    );
    script.src = `/api/modules/${encodeURIComponent(type)}/bundle.js?v=${Date.now()}`;
    script.async = true;
    script.onload = () => {
      clearTimeout(downloadTimer);
      if (rt._modules!.has(type)) return finish();
      // Also allow modules that register asynchronously after the script loads.
      const callbacks = rt._loadCallbacks!.get(type) ?? [];
      callbacks.push(registered);
      rt._loadCallbacks!.set(type, callbacks);
      registrationTimer = setTimeout(
        () => finish(new Error(`Timeout: Modul ${type} hat sich in 5000ms nicht registriert`)),
        5000,
      );
    };
    script.onerror = () => finish(new Error(`Konnte Custom-Modul ${type} nicht laden.`));
    document.head.appendChild(script);
  }).finally(() => {
    loadingBundles.delete(type);
  });
  loadingBundles.set(type, p);
  return p;
}

/** Preview bridge calls are read-only, including Request objects and overrides. */
const previewFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new Error("Custom-module previews are read-only: " + method + " is disabled.");
  }
  return window.fetch(input, init);
};

/**
 * React-Wrapper für Custom-Module. Liegt im Live-View-Render an Stelle eines
 * bekannten Widgets — lädt Bundle + ruft `render(ctx)` des Moduls.
 */
/**
 * Ruft die render-Funktion eines Moduls auf — und zwar als EIGENE Komponente.
 *
 * Der Grund ist der ganze Witz an dieser Datei (#87, gemeldet und richtig
 * diagnostiziert von @stephenneal):
 *
 * Vorher stand hier schlicht `{mod.render(ctx)}` mitten im Render-Körper von
 * CustomWidget. Ruft ein Modul darin `ctx.useState` auf, dann ist das aus
 * Reacts Sicht ein Hook VON CustomWidget. Und weil `mod` beim ersten Durchgang
 * noch null ist (das Bundle laedt ja erst), wurde die Zeile beim ersten Render
 * uebersprungen — die Modul-Hooks liefen also gar nicht. Sobald setMod() neu
 * rendert, kommen sie ploetzlich dazu: mehr Hooks als beim vorigen Durchgang,
 * und React wirft Fehler #310.
 *
 * Das traf JEDES Modul mit irgendeinem Hook — waehrend `ctx` useState,
 * useEffect, useRef, useMemo und useCallback ausdruecklich anbietet. Wir haben
 * also eine Faehigkeit beworben, die zuverlaessig abstuerzt.
 *
 * Als eigene Komponente hat das Modul seine eigene, stabile Hook-Liste. Ob es
 * Hooks benutzt oder nicht, geht CustomWidget nichts mehr an.
 */
function ModuleRenderer({
  render,
  ctx,
}: {
  render: RegisteredModule["render"];
  ctx: ModuleCtx;
}) {
  return <>{render(ctx)}</>;
}

/**
 * Faengt Fehler aus dem Modul ab, ohne die ganze Ansicht mitzureissen.
 *
 * Muss eine Klasse sein: ein try/catch im Elternteil sieht nichts von dem, was
 * beim Rendern eines KINDES geworfen wird. Genau das war der Preis dafuer, das
 * Rendern eine Ebene tiefer zu legen — vorher lag der Aufruf im selben
 * Render-Koerper und war von try/catch erreichbar.
 */
class ModuleErrorBoundary extends React.Component<
  { children: React.ReactNode; config: ModuleCtx["config"] },
  { message: string | null }
> {
  constructor(props: { children: React.ReactNode; config: ModuleCtx["config"] }) {
    super(props);
    this.state = { message: null };
  }
  static getDerivedStateFromError(e: any) {
    return { message: e?.message ?? String(e) };
  }
  componentDidUpdate(previous: Readonly<{ config: ModuleCtx["config"] }>) {
    if (this.state.message && previous.config !== this.props.config) {
      this.setState({ message: null });
    }
  }
  render() {
    if (this.state.message) {
      return (
        <div className="w-full h-full flex items-center justify-center text-xs text-red-400 p-2 text-center">
          ⚠ Render-Fehler: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function CustomWidget({
  type,
  config,
  dashboardId,
  preview = false,
}: {
  type: string;
  config?: Record<string, any>;
  dashboardId?: string;
  preview?: boolean;
}) {
  const [loaded, setLoaded] = React.useState<{
    type: string;
    mod?: RegisteredModule;
    error?: string;
  } | null>(null);
  const mod = loaded?.type === type ? loaded.mod : undefined;
  const error = loaded?.type === type ? loaded.error : undefined;

  React.useEffect(() => {
    let cancelled = false;
    loadModuleBundle(type)
      .then(() => {
        if (!cancelled) setLoaded({ type, mod: ensureRuntime()._modules!.get(type) });
      })
      .catch((e) => {
        if (!cancelled) setLoaded({ type, error: e?.message ?? String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const ctx: ModuleCtx = React.useMemo(
    () => ({
      createElement: React.createElement,
      Fragment: React.Fragment,
      useState: React.useState,
      useEffect: React.useEffect,
      useRef: React.useRef,
      useMemo: React.useMemo,
      useCallback: React.useCallback,
      config: config ?? {},
      dashboardId,
      preview,
      fetch: preview
        ? previewFetch
        : (typeof window !== "undefined" ? window.fetch.bind(window) : fetch) as typeof fetch,
    }),
    [config, dashboardId, preview],
  );

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-red-400 p-2 text-center">
        ⚠ {error}
      </div>
    );
  }
  if (!mod) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs opacity-40">
        Lade {type}…
      </div>
    );
  }
  return (
    <ModuleErrorBoundary key={type} config={ctx.config}>
      <ModuleRenderer render={mod.render} ctx={ctx} />
    </ModuleErrorBoundary>
  );
}
