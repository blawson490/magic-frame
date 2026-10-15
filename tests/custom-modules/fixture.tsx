import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import WidgetPreview from "../../src/app/editor/_components/WidgetPreview";
import CustomModuleInspector from "../../src/app/editor/_inspectors/CustomModuleInspector";
import { renderWidget } from "../../src/components/widgets/renderWidget";
import { loadModuleBundle } from "../../src/lib/modules/runtime";

type Options = {
  type: string;
  config: Record<string, unknown>;
  display?: boolean;
  duplicate?: boolean;
};

declare global {
  interface Window {
    harness: {
      update: (options: Partial<Options>) => void;
      unmount: () => void;
      load: typeof loadModuleBundle;
    };
  }
}

const root = createRoot(document.getElementById("root")!);
function App() {
  const [options, setOptions] = useState<Options>({ type: "custom:hello", config: { name: "Welt" } });
  useEffect(() => {
    window.harness = {
      update: (next) => setOptions((previous) => ({ ...previous, ...next })),
      unmount: () => root.unmount(),
      load: loadModuleBundle,
    };
  }, []);
  const preview = <WidgetPreview type={options.type} config={options.config} gridW={12} gridH={6} />;
  return (
    <div style={{ width: 400 }}>
      <div data-testid="preview">
        {options.display ? renderWidget(options.type, options.config, { dashboardId: "test-view" }) : preview}
      </div>
      {options.duplicate && <div data-testid="duplicate">{preview}</div>}
      {!options.display && options.type.startsWith("custom:") && (
        <CustomModuleInspector
          widget={{ i: "test-widget", label: "Test", bgOpacity: 0, type: options.type, x: 0, y: 0, w: 12, h: 6, config: { fontSize: 20, fontFamily: "sans-serif", ...options.config } }}
          updateConfig={(_id, key, value: unknown) => setOptions((previous) => ({
            ...previous, config: { ...previous.config, [key]: value },
          }))}
        />
      )}
    </div>
  );
}
root.render(<App />);
